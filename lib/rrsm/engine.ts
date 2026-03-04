// lib/rrsm/engine.ts

export type RRSMNight = {
  sleepQuality: number
  latencyMinutes: number
  wakeUps: number
  mindTags?: string[]
  envTags?: string[]
  bodyTags?: string[]
  affectedTonight?: string[]
}

export type RRSMInput = {
  tonight: RRSMNight
  last7: RRSMNight[]
}

export type RRSMOutput = {
  headline: string
  primaryDriver: string
  protocolFamily: string
  suggestedProtocol: string
  why: string[]
  actions: string[]
  avoid: string[]
  confidence: {
    level: "low" | "medium" | "high"
    meaning: string
  }
}

function confidenceMeaning(level: "low" | "medium" | "high") {
  if (level === "low") return "low — early signal"
  if (level === "medium") return "medium — pattern emerging"
  return "high — consistent pattern"
}

function avg(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function count(condition: boolean[]) {
  return condition.filter(Boolean).length
}

function collectTags(nights: RRSMNight[]) {
  const tags: string[] = []

  nights.forEach(n => {
    tags.push(...(n.mindTags ?? []))
    tags.push(...(n.envTags ?? []))
    tags.push(...(n.bodyTags ?? []))
    tags.push(...(n.affectedTonight ?? []))
  })

  return tags
}

function topTag(tags: string[]) {
  const map: Record<string, number> = {}

  tags.forEach(t => {
    const key = t.toLowerCase()
    map[key] = (map[key] || 0) + 1
  })

  let top = ""
  let count = 0

  Object.entries(map).forEach(([k, v]) => {
    if (v > count) {
      count = v
      top = k
    }
  })

  return { tag: top, count }
}

export function runRRSM(input: RRSMInput): RRSMOutput {

  const nights = input.last7
  const tonight = input.tonight

  const latencyPattern =
    count(nights.map(n => n.latencyMinutes >= 45))

  const wakePattern =
    count(nights.map(n => n.wakeUps >= 3))

  const qualityPattern =
    count(nights.map(n => n.sleepQuality <= 4))

  const avgLatency = avg(nights.map(n => n.latencyMinutes))
  const avgWake = avg(nights.map(n => n.wakeUps))
  const avgQuality = avg(nights.map(n => n.sleepQuality))

  const tagData = topTag(collectTags(nights))

  let driver = "Optimization"

  if (qualityPattern >= 3 || tonight.sleepQuality <= 4)
    driver = "Recovery"

  else if (latencyPattern >= 3 || tonight.latencyMinutes >= 45)
    driver = "Pre-Sleep Discharge"

  else if (wakePattern >= 3 || tonight.wakeUps >= 3)
    driver = "Stabilization"

  let suggestedProtocol = ""

  if (driver === "Pre-Sleep Discharge")
    suggestedProtocol = "RB2 Deceleration"

  else if (driver === "Stabilization")
    suggestedProtocol = "Sleep Continuity Reset"

  else if (driver === "Recovery")
    suggestedProtocol = "Low-Stimulation Recovery Night"

  else
    suggestedProtocol = "Maintain Routine"

  const why: string[] = []
  const actions: string[] = []
  const avoid: string[] = []

  let headline = ""
  let primaryDriver = ""

  if (driver === "Recovery") {

    headline = "Tonight plan: Recovery sleep"
    primaryDriver = "Low sleep quality pattern"

    why.push(`Average sleep quality: ${avgQuality.toFixed(1)}/10`)
    why.push(`${qualityPattern} of the last 7 nights had poor sleep quality.`)
  }

  else if (driver === "Pre-Sleep Discharge") {

    headline = "Tonight plan: Faster sleep onset"
    primaryDriver = "Sleep onset delay pattern"

    why.push(`Average latency: ${avgLatency.toFixed(0)} minutes`)
    why.push(`${latencyPattern} of the last 7 nights had long sleep latency.`)
  }

  else if (driver === "Stabilization") {

    headline = "Tonight plan: Reduce wake-ups"
    primaryDriver = "Sleep fragmentation pattern"

    why.push(`Average wake-ups: ${avgWake.toFixed(1)}`)
    why.push(`${wakePattern} of the last 7 nights had frequent wake-ups.`)
  }

  else {

    headline = "Tonight plan: Maintain good sleep"
    primaryDriver = "Stable sleep pattern"

    why.push("Sleep metrics are stable across recent nights.")
  }

  if (tagData.tag && tagData.count >= 2) {
    why.push(`Common contributing factor: ${tagData.tag}`)
  }

  actions.push("Follow the suggested protocol tonight.")
  actions.push("Keep sleep environment stable and predictable.")

  avoid.push("Late stimulation, late meals, and large routine changes.")

  let confidence: "low" | "medium" | "high" = "low"

  const strongestPattern = Math.max(latencyPattern, wakePattern, qualityPattern)

  if (strongestPattern >= 4) confidence = "high"
  else if (strongestPattern >= 2) confidence = "medium"

  return {
    headline,
    primaryDriver,
    protocolFamily: driver,
    suggestedProtocol,
    why,
    actions,
    avoid,
    confidence: {
      level: confidence,
      meaning: confidenceMeaning(confidence)
    }
  }
}
