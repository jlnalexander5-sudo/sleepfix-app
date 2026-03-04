// lib/rrsm/engine.ts

export type RRSMNight = {
  sleepQuality: number
  latencyMinutes: number
  wakeUps: number
  mindTags?: string[]
  envTags?: string[]
  bodyTags?: string[]
  affectedTonight?: string[]

  // Optional hook for future success tracking (won’t break callers)
  protocolUsed?: string
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

function nightTags(n: RRSMNight) {
  return [
    ...(n.mindTags ?? []),
    ...(n.envTags ?? []),
    ...(n.bodyTags ?? []),
    ...(n.affectedTonight ?? []),
  ]
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.toLowerCase())
}

function unique(arr: string[]) {
  return [...new Set(arr)]
}

/**
 * Tag impact = compare nights WITH tag vs WITHOUT tag (prefer 30 nights; else 7).
 * We compute deltas for latency/wakeups/quality.
 */
function computeTagImpacts(nights: RRSMNight[]) {
  const allTags = unique(nights.flatMap(n => nightTags(n)))
  const impacts: Record<
    string,
    { withN: number; withoutN: number; dLatency: number; dWake: number; dQuality: number }
  > = {}

  const latAll = nights.map(n => n.latencyMinutes)
  const wakeAll = nights.map(n => n.wakeUps)
  const qualAll = nights.map(n => n.sleepQuality)

  const baseLatency = avg(latAll)
  const baseWake = avg(wakeAll)
  const baseQuality = avg(qualAll)

  for (const tag of allTags) {
    const withTag = nights.filter(n => nightTags(n).includes(tag))
    const withoutTag = nights.filter(n => !nightTags(n).includes(tag))

    if (withTag.length < 2 || withoutTag.length < 2) continue

    const withLatency = avg(withTag.map(n => n.latencyMinutes))
    const withWake = avg(withTag.map(n => n.wakeUps))
    const withQuality = avg(withTag.map(n => n.sleepQuality))

    const withoutLatency = avg(withoutTag.map(n => n.latencyMinutes))
    const withoutWake = avg(withoutTag.map(n => n.wakeUps))
    const withoutQuality = avg(withoutTag.map(n => n.sleepQuality))

    // delta = worse when positive for latency/wake; worse when negative for quality
    impacts[tag] = {
      withN: withTag.length,
      withoutN: withoutTag.length,
      dLatency: withLatency - withoutLatency,
      dWake: withWake - withoutWake,
      dQuality: withQuality - withoutQuality,
    }
  }

  // baseline fallbacks (in case impacts empty)
  return { impacts, baseLatency, baseWake, baseQuality }
}

function pickTopImpactTag(
  impacts: Record<string, { withN: number; withoutN: number; dLatency: number; dWake: number; dQuality: number }>,
  focus: "quality" | "latency" | "wake"
) {
  let bestTag = ""
  let bestScore = 0

  for (const [tag, v] of Object.entries(impacts)) {
    // small sample guard
    const sampleFactor = Math.min(1, v.withN / 4)

    let score = 0
    if (focus === "latency") score = v.dLatency
    if (focus === "wake") score = v.dWake
    if (focus === "quality") score = -(v.dQuality) // quality worse when delta is negative

    score = score * sampleFactor

    if (score > bestScore) {
      bestScore = score
      bestTag = tag
    }
  }

  return { tag: bestTag, score: bestScore }
}

// Tag category helpers (used to choose the right protocol *within* the correct priority bucket)
const STIMULATION_TAGS = [
  "caffeine",
  "late caffeine",
  "screens",
  "scrolling",
  "stress",
  "anxiety",
  "overstimulated",
  "wired",
  "work late",
  "late novelty",
]

const HEAT_TAGS = [
  "hot room",
  "overheating",
  "heat",
  "warm shower",
  "hot shower",
  "hot drink",
  "hot food",
  "temperature",
]

const ENV_FRAGMENT_TAGS = ["noise", "light", "bright", "partner", "snoring", "bathroom trips"]

function hasAnyTag(tags: string[], group: string[]) {
  const set = new Set(tags)
  return group.some(g => set.has(g))
}

export function runRRSM(input: RRSMInput): RRSMOutput {
  const nights7 = input.last7
  const nights30 = input.last30 ?? []
  const tonight = input.tonight

  // Use 30 nights for baseline if present; else 7 nights.
  const baselineNights = nights30.length >= 10 ? nights30 : nights7

  const baselineLatency = avg(baselineNights.map(n => n.latencyMinutes))
  const baselineWake = avg(baselineNights.map(n => n.wakeUps))
  const baselineQuality = avg(baselineNights.map(n => n.sleepQuality))

  // Adaptive thresholds (still simple but now personal)
  const latencyThreshold = baselineLatency + 15
  const wakeThreshold = baselineWake + 1
  const qualityThreshold = baselineQuality - 2

  // 7-night patterns (your “what’s going on” window)
  const latencyPattern = count(nights7.map(n => n.latencyMinutes >= latencyThreshold))
  const wakePattern = count(nights7.map(n => n.wakeUps >= wakeThreshold))
  const qualityPattern = count(nights7.map(n => n.sleepQuality <= qualityThreshold))

  const avgLatency7 = avg(nights7.map(n => n.latencyMinutes))
  const avgWake7 = avg(nights7.map(n => n.wakeUps))
  const avgQuality7 = avg(nights7.map(n => n.sleepQuality))

  // Build tag impact model (prefer 30 nights for correlation; else 7)
  const correlationNights = nights30.length >= 10 ? nights30 : nights7
  const { impacts } = computeTagImpacts(correlationNights)

  // HARD-LOCKED PRIORITY ORDER (no exceptions)
  // 1) Sleep quality
  // 2) Sleep latency
  // 3) Wake ups
  // 4) Optimization
  let driver: "Recovery" | "Pre-Sleep Discharge" | "Stabilization" | "Optimization" = "Optimization"

  if (qualityPattern >= 3 || tonight.sleepQuality <= qualityThreshold) driver = "Recovery"
  else if (latencyPattern >= 3 || tonight.latencyMinutes >= latencyThreshold) driver = "Pre-Sleep Discharge"
  else if (wakePattern >= 3 || tonight.wakeUps >= wakeThreshold) driver = "Stabilization"
  else driver = "Optimization"

  // Select top trigger *within the active driver* (so we don’t guess wrong protocol)
  const focus: "quality" | "latency" | "wake" =
    driver === "Recovery" ? "quality" : driver === "Pre-Sleep Discharge" ? "latency" : "wake"

  const topTrigger = pickTopImpactTag(impacts, focus)

  // Tonight tag set (used for selecting the right protocol variant inside the driver bucket)
  const tonightTags = nightTags(tonight)

  // OUTPUT
  const why: string[] = []
  const actions: string[] = []
  const avoid: string[] = []

  let headline = ""
  let primaryDriver = ""
  let suggestedProtocol = ""
  let predictedIssue: string | undefined

  // Confidence from pattern strength
  const strongestPattern = Math.max(latencyPattern, wakePattern, qualityPattern)
  let confidence: "low" | "medium" | "high" = "low"
  if (strongestPattern >= 4) confidence = "high"
  else if (strongestPattern >= 2) confidence = "medium"

  // Prediction: what’s likely next if nothing changes
  if (latencyPattern >= 2) predictedIssue = "Sleep onset delay likely"
  else if (wakePattern >= 2) predictedIssue = "Night awakenings likely"

  // -----------------------------
  // DRIVER: RECOVERY (QUALITY FIRST)
  // -----------------------------
  if (driver === "Recovery") {
    headline = "Tonight plan: Recovery sleep"
    primaryDriver = "Sleep quality below your baseline"
    suggestedProtocol = "Low-Stimulation Recovery Night"

    why.push(`Baseline quality: ${baselineQuality.toFixed(1)}/10`)
    why.push(`Recent quality: ${avgQuality7.toFixed(1)}/10`)
    if (qualityPattern) why.push(`${qualityPattern} of the last 7 nights were below baseline quality.`)

    // From your PDF “Top 5 reset sleep levers” + “Sleep correction”
    actions.push("Reduce stimulus rhythm after dinner (low light, low noise, no screens).")
    actions.push("Add structured discharge if you feel wired: steady walking 20–40 min (not exertion).")
    actions.push("Use long-exhale breathing (no breath holds).")
    actions.push("Avoid late novelty and complex mental engagement.")

    avoid.push("Late stimulants (especially within 10–12 hours if sensitive).")
    avoid.push("High contrast content (bright screens / loud audio).")
  }

  // -----------------------------------
  // DRIVER: LATENCY (SECOND PRIORITY)
  // -----------------------------------
  else if (driver === "Pre-Sleep Discharge") {
    headline = "Tonight plan: Faster sleep onset"
    primaryDriver = "Sleep latency above your baseline"

    why.push(`Baseline latency: ${baselineLatency.toFixed(0)} min`)
    why.push(`Recent latency: ${avgLatency7.toFixed(0)} min`)
    if (latencyPattern) why.push(`${latencyPattern} of the last 7 nights had long sleep latency.`)

    // Choose protocol variant using your PDF:
    // - Pre-Sleep Discharge Protocol (mechanical)
    // - If heat tags present: thermal neutral / heat management + RB2 deceleration (no cold shocks)
    const heatTonight = hasAnyTag(tonightTags, HEAT_TAGS)
    const stimTonight = hasAnyTag(tonightTags, STIMULATION_TAGS)

    if (heatTonight) {
      suggestedProtocol = "RB2 Deceleration + Heat Management (No Cold Shocks)"

      // From PDF: “WHAT NOT TO DO during heat” + “Emergency Night-Awake Reset” + “RB2 Deceleration”
      actions.push("Remove rhythmic stimulation: no music, no scrolling, no narrative replay.")
      actions.push("RB2 Deceleration breathing: inhale 4s → pause 2s → exhale 6s → pause 2s (12–15 cycles).")
      actions.push("Internal cooling (without cold): spread awareness to soles, knees, elbows, palms (no focusing).")
      actions.push("Sleep Entry Lock: once sleepy, do not re-engage thought; if clarity spikes, return to breath.")

      avoid.push("Cold showers before bed / ice water / cooling shocks.")
      avoid.push("Intense breathing or visualisation.")
      avoid.push("Hot food/drinks/showers late (keep ≤ warm 2–3).")
    } else {
      suggestedProtocol = stimTonight ? "Pre-Sleep Discharge + RB2 Deceleration" : "Pre-Sleep Discharge Protocol"

      // From PDF: Pre-Sleep Discharge Protocol steps
      actions.push("Step 1: Outbound rhythmic discharge (15–30 min): walking (best) or gentle cycling / slow movement.")
      actions.push("Rule: continuous motion, not exertion.")
      actions.push("Step 2: Sensory smoothing (10 min): dim lighting, no screens, neutral temp, no high-contrast sound.")
      actions.push("Step 3: Breath normalisation (5 min): natural breathing + slightly longer exhale (no holds).")
      actions.push("Step 4: Sleep entry: lie down only after the body quiets; if restlessness returns, repeat Step 1 briefly.")

      if (stimTonight) {
        actions.push("RB2 Deceleration add-on: inhale 4s → pause 2s → exhale 6s → pause 2s (12–15 cycles).")
        avoid.push("Visualisation (it re-engages the mind).")
      }

      avoid.push("Screens / scrolling late.")
      avoid.push("Late stimulants (caffeine).")
    }
  }

  // --------------------------------
  // DRIVER: WAKE-UPS (THIRD PRIORITY)
  // --------------------------------
  else if (driver === "Stabilization") {
    headline = "Tonight plan: Reduce wake-ups"
    primaryDriver = "Wake-ups above your baseline"
    suggestedProtocol = "Sleep Continuity Reset + Night-Awake Reset"

    why.push(`Baseline wake-ups: ${baselineWake.toFixed(1)}`)
    why.push(`Recent wake-ups: ${avgWake7.toFixed(1)}`)
    if (wakePattern) why.push(`${wakePattern} of the last 7 nights had higher wake-ups than baseline.`)

    // Use PDF’s “Emergency Night-Awake Reset” and “what not to do”
    actions.push("If awake >30–40 min: sit up, feet on floor, slow breathing (out longer than in), neutral posture, eyes unfocused.")
    actions.push("Keep wake-ups mechanical: no phone, no mental techniques, no visualisation.")
    actions.push("Stabilise sensory input: low light, low noise, neutral temperature.")

    const envFragTonight = hasAnyTag(tonightTags, ENV_FRAGMENT_TAGS)
    if (envFragTonight) {
      actions.push("Fix the obvious environment trigger first (noise/light/temperature) before changing protocols.")
    }

    avoid.push("Lying there waiting while activated.")
    avoid.push("Visualisation or ‘mental methods’ during wake-ups.")
    avoid.push("Cooling shocks (ice water / cold shower) before bed.")
  }

  // --------------------------------
  // DRIVER: OPTIMIZATION (LAST)
  // --------------------------------
  else {
    headline = "Tonight plan: Maintain good sleep"
    primaryDriver = "Core sleep metrics are stable"
    suggestedProtocol = "Maintain Routine (One-Lever Test)"

    why.push("Quality, latency, and wake-ups are stable relative to your baseline.")
    actions.push("Maintain the same sleep timing and environment.")
    actions.push("Change ONE thing only (one lever) for the next 3 nights.")

    avoid.push("Changing multiple habits at once.")
  }

  // Trigger correlation line (only if meaningful)
  if (topTrigger.tag && topTrigger.score > 0.25) {
    why.push(`Likely trigger for this driver: ${topTrigger.tag}`)
    avoid.push(`Avoid ${topTrigger.tag} near bedtime (based on your recent pattern).`)
  }

  // De-duplicate avoid/actions
  const dedupe = (arr: string[]) => {
    const seen = new Set<string>()
    return arr.filter(s => {
      const k = s.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  return {
    headline,
    primaryDriver,
    protocolFamily: driver,
    suggestedProtocol,
    predictedIssue,
    why: dedupe(why),
    actions: dedupe(actions),
    avoid: dedupe(avoid),
    confidence: {
      level: confidence,
      meaning: confidenceMeaning(confidence),
    },
  }
}
