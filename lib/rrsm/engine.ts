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
  last30?: RRSMNight[]
}

export type RRSMOutput = {
  headline: string
  primaryDriver: string
  protocolFamily: string
  suggestedProtocol: string
  predictedIssue?: string
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
  if (!arr.length) return 0
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

function correlationScore(nights: RRSMNight[], tag: string) {

  let latencyHits = 0
  let wakeHits = 0
  let qualityHits = 0
  let tagCount = 0

  nights.forEach(n => {

    const tags = [
      ...(n.mindTags ?? []),
      ...(n.envTags ?? []),
      ...(n.bodyTags ?? []),
      ...(n.affectedTonight ?? [])
    ].map(t => t.toLowerCase())

    if (tags.includes(tag)) {

      tagCount++

      if (n.latencyMinutes >= 45) latencyHits++
      if (n.wakeUps >= 3) wakeHits++
      if (n.sleepQuality <= 4) qualityHits++

    }
  })

  return {
    tagCount,
    latencyHits,
    wakeHits,
    qualityHits
  }
}

function mostCorrelatedTag(nights: RRSMNight[]) {

  const tags = collectTags(nights)

  const unique = [...new Set(tags.map(t => t.toLowerCase()))]

  let strongest = ""
  let score = 0

  unique.forEach(tag => {

    const result = correlationScore(nights, tag)

    const totalImpact =
      result.latencyHits +
      result.wakeHits +
      result.qualityHits

    if (totalImpact > score) {
      score = totalImpact
      strongest = tag
    }

  })

  return strongest
}

export function runRRSM(input: RRSMInput): RRSMOutput {

  const nights7 = input.last7
  const nights30 = input.last30 ?? []
  const tonight = input.tonight

  const avgLatency7 = avg(nights7.map(n => n.latencyMinutes))
  const avgWake7 = avg(nights7.map(n => n.wakeUps))
  const avgQuality7 = avg(nights7.map(n => n.sleepQuality))

  const baselineLatency =
    nights30.length
      ? avg(nights30.map(n => n.latencyMinutes))
      : avgLatency7

  const baselineWake =
    nights30.length
      ? avg(nights30.map(n => n.wakeUps))
      : avgWake7

  const baselineQuality =
    nights30.length
      ? avg(nights30.map(n => n.sleepQuality))
      : avgQuality7

  const latencyThreshold = baselineLatency + 15
  const wakeThreshold = baselineWake + 1
  const qualityThreshold = baselineQuality - 2

  const latencyPattern =
    count(nights7.map(n => n.latencyMinutes >= latencyThreshold))

  const wakePattern =
    count(nights7.map(n => n.wakeUps >= wakeThreshold))

  const qualityPattern =
    count(nights7.map(n => n.sleepQuality <= qualityThreshold))

  const correlatedTag = mostCorrelatedTag(nights7)

  let driver = "Optimization"

  if (qualityPattern >= 3 || tonight.sleepQuality <= qualityThreshold)
    driver = "Recovery"

  else if (latencyPattern >= 3 || tonight.latencyMinutes >= latencyThreshold)
    driver = "Pre-Sleep Discharge"

  else if (wakePattern >= 3 || tonight.wakeUps >= wakeThreshold)
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
    primaryDriver = "Sleep quality below personal baseline"

    why.push(`Baseline quality: ${baselineQuality.toFixed(1)}/10`)
    why.push(`Recent quality: ${avgQuality7.toFixed(1)}/10`)
  }

  else if (driver === "Pre-Sleep Discharge") {

    headline = "Tonight plan: Faster sleep onset"
    primaryDriver = "Sleep latency above baseline"

    why.push(`Baseline latency: ${baselineLatency.toFixed(0)} minutes`)
    why.push(`Recent latency: ${avgLatency7.toFixed(0)} minutes`)
  }

  else if (driver === "Stabilization") {

    headline = "Tonight plan: Reduce wake-ups"
    primaryDriver = "Wake-ups above baseline"

    why.push(`Baseline wake-ups: ${baselineWake.toFixed(1)}`)
    why.push(`Recent wake-ups: ${avgWake7.toFixed(1)}`)
  }

  else {

    headline = "Tonight plan: Maintain good sleep"
    primaryDriver = "Sleep pattern stable"

    why.push("Recent sleep metrics match your baseline.")
  }

  if (correlatedTag) {
    why.push(`Strong trigger correlation detected: ${correlatedTag}`)
  }

  const predictedIssue =
    latencyPattern >= 2
      ? "Sleep onset delay likely"
      : wakePattern >= 2
      ? "Night awakenings likely"
      : undefined

  actions.push("Follow the suggested protocol tonight.")
  actions.push("Maintain consistent sleep timing.")

  if (correlatedTag)
    avoid.push(`Avoid ${correlatedTag} near bedtime.`)

  avoid.push("Late stimulation and large routine changes.")

  const strongestPattern =
    Math.max(latencyPattern, wakePattern, qualityPattern)

  let confidence: "low" | "medium" | "high" = "low"

  if (strongestPattern >= 4) confidence = "high"
  else if (strongestPattern >= 2) confidence = "medium"

  return {
    headline,
    primaryDriver,
    protocolFamily: driver,
    suggestedProtocol,
    predictedIssue,
    why,
    actions,
    avoid,
    confidence: {
      level: confidence,
      meaning: confidenceMeaning(confidence)
    }
  }
}
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
  last30?: RRSMNight[]
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
  if (!arr.length) return 0
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

  const nights7 = input.last7
  const nights30 = input.last30 ?? []
  const tonight = input.tonight

  const avgLatency7 = avg(nights7.map(n => n.latencyMinutes))
  const avgWake7 = avg(nights7.map(n => n.wakeUps))
  const avgQuality7 = avg(nights7.map(n => n.sleepQuality))

  const baselineLatency = nights30.length ? avg(nights30.map(n => n.latencyMinutes)) : avgLatency7
  const baselineWake = nights30.length ? avg(nights30.map(n => n.wakeUps)) : avgWake7
  const baselineQuality = nights30.length ? avg(nights30.map(n => n.sleepQuality)) : avgQuality7

  const latencyThreshold = baselineLatency + 15
  const wakeThreshold = baselineWake + 1
  const qualityThreshold = baselineQuality - 2

  const latencyPattern =
    count(nights7.map(n => n.latencyMinutes >= latencyThreshold))

  const wakePattern =
    count(nights7.map(n => n.wakeUps >= wakeThreshold))

  const qualityPattern =
    count(nights7.map(n => n.sleepQuality <= qualityThreshold))

  const tagData = topTag(collectTags(nights7))

  let driver = "Optimization"

  if (qualityPattern >= 3 || tonight.sleepQuality <= qualityThreshold)
    driver = "Recovery"

  else if (latencyPattern >= 3 || tonight.latencyMinutes >= latencyThreshold)
    driver = "Pre-Sleep Discharge"

  else if (wakePattern >= 3 || tonight.wakeUps >= wakeThreshold)
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
    primaryDriver = "Sleep quality below personal baseline"

    why.push(`Your baseline sleep quality: ${baselineQuality.toFixed(1)}/10`)
    why.push(`Recent average: ${avgQuality7.toFixed(1)}/10`)
  }

  else if (driver === "Pre-Sleep Discharge") {

    headline = "Tonight plan: Faster sleep onset"
    primaryDriver = "Sleep latency above baseline"

    why.push(`Baseline latency: ${baselineLatency.toFixed(0)} minutes`)
    why.push(`Recent latency: ${avgLatency7.toFixed(0)} minutes`)
  }

  else if (driver === "Stabilization") {

    headline = "Tonight plan: Reduce wake-ups"
    primaryDriver = "Wake-ups above baseline"

    why.push(`Baseline wake-ups: ${baselineWake.toFixed(1)}`)
    why.push(`Recent wake-ups: ${avgWake7.toFixed(1)}`)
  }

  else {

    headline = "Tonight plan: Maintain good sleep"
    primaryDriver = "Sleep pattern stable"

    why.push("Recent sleep metrics match your normal baseline.")
  }

  if (tagData.tag && tagData.count >= 2) {
    why.push(`Frequent contributing factor: ${tagData.tag}`)
  }

  actions.push("Follow the suggested protocol tonight.")
  actions.push("Keep sleep timing and environment consistent.")

  avoid.push("Late stimulation, late meals, and sudden routine changes.")

  const strongestPattern = Math.max(latencyPattern, wakePattern, qualityPattern)

  let confidence: "low" | "medium" | "high" = "low"

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
