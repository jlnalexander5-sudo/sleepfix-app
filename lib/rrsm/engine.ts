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
  if (level === "low") return "low — early signal"
  if (level === "medium") return "medium — pattern emerging"
  return "high — consistent pattern"
}

function scoreTags(tags: string[]) {
  let stimulation = 0
  let fragmentation = 0
  let physiology = 0

  tags.forEach(tag => {
    const t = tag.toLowerCase()

    if (["stress","anxiety","screens","caffeine","late caffeine"].includes(t))
      stimulation++

    if (["noise","light","temperature","hot room"].includes(t))
      fragmentation++

    if (["pain","sickness","exercise late","body discomfort"].includes(t))
      physiology++
  })

  return { stimulation, fragmentation, physiology }
}

export function runRRSM(input: RRSMInput): RRSMOutput {

  const tags = [
    ...(input.mindTags ?? []),
    ...(input.envTags ?? []),
    ...(input.bodyTags ?? []),
    ...(input.affectedTonight ?? [])
  ]

  const tagScore = scoreTags(tags)

  let driver = "Optimization"

  if (input.sleepQuality <= 4) driver = "Recovery"

  else if (input.latencyMinutes >= 45 || tagScore.stimulation >= 2)
    driver = "Pre-Sleep Discharge"

  else if (input.wakeUps >= 3 || tagScore.fragmentation >= 2)
    driver = "Stabilization"

  else if (tagScore.physiology >= 2)
    driver = "Physiology Reset"

  const why: string[] = []
  const actions: string[] = []
  const avoid: string[] = []

  let headline = ""
  let primaryDriver = ""

  if (driver === "Recovery") {
    headline = "Tonight plan: Recovery sleep"
    primaryDriver = "Sleep quality is low"

    why.push(`Sleep quality was ${input.sleepQuality}/10.`)

    actions.push("Reduce stimulation tonight.")
    actions.push("Keep lighting low and environment calm.")

    avoid.push("Late meals, alcohol, heavy stimulation.")
  }

  else if (driver === "Pre-Sleep Discharge") {
    headline = "Tonight plan: Faster sleep onset"
    primaryDriver = "Overstimulated before bed"

    why.push(`Sleep latency was about ${input.latencyMinutes} minutes.`)

    actions.push("20–30 minute discharge walk.")
    actions.push("10 minutes dim-light decompression.")

    avoid.push("Screens and stimulating activity late.")
  }

  else if (driver === "Stabilization") {
    headline = "Tonight plan: Reduce wake-ups"
    primaryDriver = "Sleep fragmentation"

    why.push(`Wake-ups recorded: ${input.wakeUps}.`)

    actions.push("Keep bedroom cool and dark.")
    actions.push("Avoid checking phone during wake-ups.")

    avoid.push("Late fluids, overheating room.")
  }

  else if (driver === "Physiology Reset") {
    headline = "Tonight plan: Physical reset"
    primaryDriver = "Body discomfort signals"

    why.push("Body-related signals detected.")

    actions.push("Gentle stretching before bed.")
    actions.push("Ensure comfortable sleep environment.")

    avoid.push("Late intense exercise.")
  }

  else {
    headline = "Tonight plan: Maintain good sleep"
    primaryDriver = "Sleep metrics look stable"

    why.push("Quality, latency, and wake-ups are within good range.")

    actions.push("Keep the same sleep routine.")

    avoid.push("Changing too many habits at once.")
  }

  if (tags.length) {
    why.push(`Possible contributors: ${tags.join(", ")}`)
  }

  const confidenceLevel: "low" | "medium" | "high" =
    tags.length >= 3 ? "high" : tags.length >= 1 ? "medium" : "low"

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
