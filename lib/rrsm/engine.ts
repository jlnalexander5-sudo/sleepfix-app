// lib/rrsm/engine.ts

export type RRSMInput = {
  sleepQuality: number
  latencyMinutes: number
  wakeUps: number
  mindTags?: string[]
  envTags?: string[]
  bodyTags?: string[]
  affectedTonight?: string[]
  notes?: string
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
  if (level === "low") return "low — early signal, more nights needed"
  if (level === "medium") return "medium — enough nights to see a pattern"
  return "high — consistent pattern across nights"
}

function qualityPoor(q: number) {
  return q <= 4
}

function latencyHigh(m: number) {
  return m >= 45
}

function wakeHigh(w: number) {
  return w >= 3
}

export function runRRSM(input: RRSMInput): RRSMOutput {

  const { sleepQuality, latencyMinutes, wakeUps, affectedTonight } = input

  let driver = "Optimization"
  if (qualityPoor(sleepQuality)) driver = "Recovery"
  else if (latencyHigh(latencyMinutes)) driver = "Pre-Sleep Discharge"
  else if (wakeHigh(wakeUps)) driver = "Stabilization"

  const why: string[] = []
  const actions: string[] = []
  const avoid: string[] = []

  let headline = ""
  let primaryDriver = ""

  if (driver === "Recovery") {
    headline = "Tonight plan: Recovery sleep"
    primaryDriver = "Sleep quality is low"

    why.push(`Sleep quality was ${sleepQuality}/10.`)

    actions.push("Reduce stimulation after dinner.")
    actions.push("Keep lights dim and routine simple.")

    avoid.push("Late meals, alcohol, overheating the room.")
  }

  else if (driver === "Pre-Sleep Discharge") {
    headline = "Tonight plan: Faster sleep onset"
    primaryDriver = "Falling asleep is taking too long"

    why.push(`Time to fall asleep was about ${latencyMinutes} minutes.`)

    actions.push("Do a 15–30 minute steady walk before bed.")
    actions.push("Dim lights and remove screens for 10 minutes.")

    avoid.push("Scrolling or stimulating content late.")
  }

  else if (driver === "Stabilization") {
    headline = "Tonight plan: Fewer wake-ups"
    primaryDriver = "Sleep fragmentation"

    why.push(`You woke up ${wakeUps} times.`)

    actions.push("Keep the room cool and dark.")
    actions.push("If you wake up, keep lights low and avoid the phone.")

    avoid.push("Clock checking and late fluids.")
  }

  else {
    headline = "Tonight plan: Maintain good sleep"
    primaryDriver = "Core sleep metrics look stable"

    why.push("Sleep quality, latency, and wake-ups look acceptable.")

    actions.push("Maintain the same routine.")
    actions.push("Improve one small factor from tags or notes.")

    avoid.push("Changing multiple habits at once.")
  }

  if (affectedTonight?.length) {
    why.push(`Possible contributors: ${affectedTonight.join(", ")}`)
  }

  const confidenceLevel: "low" | "medium" | "high" = "medium"

  return {
    headline,
    primaryDriver,
    protocolFamily: driver,
    why,
    actions,
    avoid,
    confidence: {
      level: confidenceLevel,
      meaning: confidenceMeaning(confidenceLevel)
    }
  }
}
