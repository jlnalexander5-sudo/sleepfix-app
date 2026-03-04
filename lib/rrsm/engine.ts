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
  return "high — consistent pattern across nights"
}

function avg(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function count(condition: boolean[]) {
  return condition.filter(Boolean).length
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

  let driver = "Optimization"

  if (qualityPattern >= 3 || tonight.sleepQuality <= 4)
    driver = "Recovery"

  else if (latencyPattern >= 3 || tonight.latencyMinutes >= 45)
    driver = "Pre-Sleep Discharge"

  else if (wakePattern >= 3 || tonight.wakeUps >= 3)
    driver = "Stabilization"

  const why: string[] = []
  const actions: string[] = []
  const avoid: string[] = []

  let headline = ""
  let primaryDriver = ""

  if (driver === "Recovery") {

    headline = "Tonight plan: Recovery sleep"
    primaryDriver = "Low sleep quality pattern"

    why.push(`Average sleep quality (7 nights): ${avgQuality.toFixed(1)}/10`)
    why.push(`${qualityPattern} of the last 7 nights had poor sleep quality.`)

    actions.push("Reduce stimulation after dinner.")
    actions.push("Keep lighting dim before bed.")

    avoid.push("Late meals and alcohol.")
  }

  else if (driver === "Pre-Sleep Discharge") {

    headline = "Tonight plan: Faster sleep onset"
    primaryDriver = "Sleep onset delay pattern"

    why.push(`Average sleep latency: ${avgLatency.toFixed(0)} minutes`)
    why.push(`${latencyPattern} of the last 7 nights had long sleep latency.`)

    actions.push("20 minute discharge walk before bed.")
    actions.push("Dim light decompression period.")

    avoid.push("Screens late at night.")
  }

  else if (driver === "Stabilization") {

    headline = "Tonight plan: Reduce wake-ups"
    primaryDriver = "Sleep fragmentation pattern"

    why.push(`Average wake-ups: ${avgWake.toFixed(1)} per night`)
    why.push(`${wakePattern} of the last 7 nights had multiple wake-ups.`)

    actions.push("Cool and dark bedroom environment.")
    actions.push("Avoid checking phone if waking.")

    avoid.push("Late fluids and overheating the room.")
  }

  else {

    headline = "Tonight plan: Maintain good sleep"
    primaryDriver = "Stable sleep pattern"

    why.push("Sleep quality, latency, and wake-ups are stable across recent nights.")

    actions.push("Maintain current sleep routine.")

    avoid.push("Large routine changes.")
  }

  let confidence: "low" | "medium" | "high" = "low"

  const strongestPattern = Math.max(latencyPattern, wakePattern, qualityPattern)

  if (strongestPattern >= 4) confidence = "high"
  else if (strongestPattern >= 2) confidence = "medium"

  return {
    headline,
    primaryDriver,
    protocolFamily: driver,
    why,
    actions,
    avoid,
    confidence: {
      level: confidence,
      meaning: confidenceMeaning(confidence)
    }
  }
}
