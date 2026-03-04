// lib/rrsm/engine.ts
//
// RRSM Engine v7
// - Hard-locked priority order: Quality → Latency → Wake-ups → Optimization
// - Personal baseline (30-night preferred), adaptive thresholds
// - 7-night pattern detection
// - Trigger correlation
// - Protocol effectiveness learning (if you store protocolUsed + protocolName on nights)
//
// NOTE: For protocol learning to work, your stored nights must be in chronological order
// (oldest → newest) so we can evaluate "next night outcome" after a protocol was used.

export type RRSMNight = {
  sleepQuality: number
  latencyMinutes: number
  wakeUps: number
  mindTags?: string[]
  envTags?: string[]
  bodyTags?: string[]
  affectedTonight?: string[]

  // Learning hooks (optional; engine works without them)
  protocolName?: string            // name of protocol the user used
  protocolUsed?: boolean           // true/false if they used it
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

    impacts[tag] = {
      withN: withTag.length,
      withoutN: withoutTag.length,
      dLatency: withLatency - withoutLatency,
      dWake: withWake - withoutWake,
      dQuality: withQuality - withoutQuality,
    }
  }

  return { impacts }
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

// Tag category helpers (used to choose the right protocol variant inside the correct priority bucket)
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

type Driver = "Recovery" | "Pre-Sleep Discharge" | "Stabilization" | "Optimization"

type ProtocolTarget = "quality" | "latency" | "wake"

function driverTarget(driver: Driver): ProtocolTarget {
  if (driver === "Recovery") return "quality"
  if (driver === "Pre-Sleep Discharge") return "latency"
  if (driver === "Stabilization") return "wake"
  return "quality"
}

function protocolTargetFromName(name: string): ProtocolTarget {
  const n = name.toLowerCase()
  if (n.includes("rb2") || n.includes("discharge") || n.includes("latency") || n.includes("sleep onset")) return "latency"
  if (n.includes("continuity") || n.includes("wake") || n.includes("fragment")) return "wake"
  if (n.includes("recovery") || n.includes("low-stimulation") || n.includes("quality")) return "quality"
  // default
  return "quality"
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

/**
 * Protocol learning:
 * If a night has protocolUsed=true and protocolName, we measure next-night outcome delta.
 * - latency: improvement = previous latency - next latency (bigger is better)
 * - wake: improvement = previous wakeUps - next wakeUps
 * - quality: improvement = next quality - previous quality
 */
function learnProtocolEffects(nightsChronological: RRSMNight[]) {
  const stats: Record<string, { uses: number; sum: number; target: ProtocolTarget }> = {}

  for (let i = 0; i < nightsChronological.length - 1; i++) {
    const n = nightsChronological[i]
    const next = nightsChronological[i + 1]
    if (!n.protocolUsed || !n.protocolName) continue

    const proto = n.protocolName.trim()
    if (!proto) continue

    const target = protocolTargetFromName(proto)

    let improvement = 0
    if (target === "latency") improvement = (n.latencyMinutes ?? 0) - (next.latencyMinutes ?? 0)
    else if (target === "wake") improvement = (n.wakeUps ?? 0) - (next.wakeUps ?? 0)
    else improvement = (next.sleepQuality ?? 0) - (n.sleepQuality ?? 0)

    // Keep extreme outliers from dominating learning
    const capped = clamp(improvement, -120, 120)

    stats[proto] = stats[proto] ?? { uses: 0, sum: 0, target }
    stats[proto].uses += 1
    stats[proto].sum += capped
  }

  // Convert to averages
  const avgs: Record<string, { uses: number; avg: number; target: ProtocolTarget }> = {}
  for (const [proto, s] of Object.entries(stats)) {
    avgs[proto] = { uses: s.uses, avg: s.sum / s.uses, target: s.target }
  }

  return avgs
}

function pickBestProtocolForTarget(
  learned: Record<string, { uses: number; avg: number; target: ProtocolTarget }>,
  target: ProtocolTarget,
  candidates: string[]
) {
  // Prefer learned best among candidates with enough samples
  let best = ""
  let bestAvg = 0
  let bestUses = 0

  for (const c of candidates) {
    const s = learned[c]
    if (!s) continue
    if (s.target !== target) continue
    if (s.uses < 2) continue // minimum evidence
    if (s.avg > bestAvg) {
      best = c
      bestAvg = s.avg
      bestUses = s.uses
    }
  }

  return { best, bestAvg, bestUses }
}

function dedupe(arr: string[]) {
  const seen = new Set<string>()
  return arr.filter(s => {
    const k = s.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function runRRSM(input: RRSMInput): RRSMOutput {
  const nights7 = input.last7
  const nights30 = input.last30 ?? []
  const tonight = input.tonight

  // Baseline: 30 nights if we have enough; else 7
  const baselineNights = nights30.length >= 10 ? nights30 : nights7

  const baselineLatency = avg(baselineNights.map(n => n.latencyMinutes))
  const baselineWake = avg(baselineNights.map(n => n.wakeUps))
  const baselineQuality = avg(baselineNights.map(n => n.sleepQuality))

  // Adaptive thresholds (personal)
  const latencyThreshold = baselineLatency + 15
  const wakeThreshold = baselineWake + 1
  const qualityThreshold = baselineQuality - 2

  // 7-night patterns
  const latencyPattern = count(nights7.map(n => n.latencyMinutes >= latencyThreshold))
  const wakePattern = count(nights7.map(n => n.wakeUps >= wakeThreshold))
  const qualityPattern = count(nights7.map(n => n.sleepQuality <= qualityThreshold))

  const avgLatency7 = avg(nights7.map(n => n.latencyMinutes))
  const avgWake7 = avg(nights7.map(n => n.wakeUps))
  const avgQuality7 = avg(nights7.map(n => n.sleepQuality))

  // Trigger correlation (prefer 30; else 7)
  const correlationNights = nights30.length >= 10 ? nights30 : nights7
  const { impacts } = computeTagImpacts(correlationNights)

  // HARD-LOCKED PRIORITY ORDER (no exceptions)
  let driver: Driver = "Optimization"
  if (qualityPattern >= 3 || tonight.sleepQuality <= qualityThreshold) driver = "Recovery"
  else if (latencyPattern >= 3 || tonight.latencyMinutes >= latencyThreshold) driver = "Pre-Sleep Discharge"
  else if (wakePattern >= 3 || tonight.wakeUps >= wakeThreshold) driver = "Stabilization"
  else driver = "Optimization"

  const focus: ProtocolTarget = driverTarget(driver)
  const topTrigger = pickTopImpactTag(impacts, focus === "wake" ? "wake" : focus === "latency" ? "latency" : "quality")

  const tonightTags = nightTags(tonight)

  // Protocol learning (uses last30 if available; else last7)
  const learningNights = nights30.length >= 10 ? nights30 : nights7
  const learned = learnProtocolEffects(learningNights)

  // Candidate protocols (within each family)
  const latencyCandidates = [
    "Pre-Sleep Discharge Protocol",
    "Pre-Sleep Discharge + RB2 Deceleration",
    "RB2 Deceleration + Heat Management (No Cold Shocks)",
  ]
  const wakeCandidates = [
    "Sleep Continuity Reset + Night-Awake Reset",
    "Night-Awake Reset (Mechanical)",
  ]
  const qualityCandidates = [
    "Low-Stimulation Recovery Night",
    "Recovery Night + Discharge Walk",
  ]
  const optCandidates = ["Maintain Routine (One-Lever Test)"]

  // Confidence from pattern strength + learning evidence (if available)
  const strongestPattern = Math.max(latencyPattern, wakePattern, qualityPattern)
  let confidence: "low" | "medium" | "high" = "low"
  if (strongestPattern >= 4) confidence = "high"
  else if (strongestPattern >= 2) confidence = "medium"

  // If we have protocol learning with at least 3 uses in the active target, bump confidence one level.
  const learnedEvidence = Object.values(learned).some(s => s.target === focus && s.uses >= 3)
  if (learnedEvidence) {
    if (confidence === "low") confidence = "medium"
    else if (confidence === "medium") confidence = "high"
  }

  // Prediction
  let predictedIssue: string | undefined
  if (latencyPattern >= 2) predictedIssue = "Sleep onset delay likely"
  else if (wakePattern >= 2) predictedIssue = "Night awakenings likely"

  const why: string[] = []
  const actions: string[] = []
  const avoid: string[] = []

  let headline = ""
  let primaryDriver = ""
  let suggestedProtocol = ""
  let protocolFamily: string = driver

  // Helper: choose learned-best protocol if available
  const chooseProtocol = (target: ProtocolTarget, candidates: string[], fallback: string) => {
    const pick = pickBestProtocolForTarget(learned, target, candidates)
    if (pick.best) {
      // show learning fact in "why"
      const unit = target === "latency" ? "min" : target === "wake" ? "wake-ups" : "quality pts"
      const sign = pick.bestAvg >= 0 ? "+" : ""
      why.push(`Based on your history: ${pick.best} is your best performer (${sign}${pick.bestAvg.toFixed(1)} ${unit}, n=${pick.bestUses}).`)
      return pick.best
    }
    return fallback
  }

  // -----------------------------
  // RECOVERY (QUALITY FIRST)
  // -----------------------------
  if (driver === "Recovery") {
    headline = "Tonight plan: Recovery sleep"
    primaryDriver = "Sleep quality below your baseline"

    const fallback = "Low-Stimulation Recovery Night"
    suggestedProtocol = chooseProtocol("quality", qualityCandidates, fallback)

    why.push(`Baseline quality: ${baselineQuality.toFixed(1)}/10`)
    why.push(`Recent quality: ${avgQuality7.toFixed(1)}/10`)
    if (qualityPattern) why.push(`${qualityPattern} of the last 7 nights were below baseline quality.`)

    // Surface the protocol name so the UI can display it cleanly
  if (suggestedProtocol && suggestedProtocol.toLowerCase() !== "no suggestion") {
    why.push(`Suggested protocol: ${suggestedProtocol}`)
  }

  actions.push("Reduce stimulus rhythm after dinner (low light, low noise, no screens).")
    actions.push("If you feel wired: steady walking 20–40 min (not exertion).")
    actions.push("Long-exhale breathing (no breath holds).")
    actions.push("Avoid late novelty and complex mental engagement.")

    avoid.push("Late stimulants (especially within 10–12 hours if sensitive).")
    avoid.push("High contrast content (bright screens / loud audio).")
  }

  // -----------------------------------
  // LATENCY (SECOND PRIORITY)
  // -----------------------------------
  else if (driver === "Pre-Sleep Discharge") {
    headline = "Tonight plan: Faster sleep onset"
    primaryDriver = "Sleep latency above your baseline"

    why.push(`Baseline latency: ${baselineLatency.toFixed(0)} min`)
    why.push(`Recent latency: ${avgLatency7.toFixed(0)} min`)
    if (latencyPattern) why.push(`${latencyPattern} of the last 7 nights had long sleep latency.`)

    const heatTonight = hasAnyTag(tonightTags, HEAT_TAGS)
    const stimTonight = hasAnyTag(tonightTags, STIMULATION_TAGS)

    const fallback =
      heatTonight
        ? "RB2 Deceleration + Heat Management (No Cold Shocks)"
        : stimTonight
        ? "Pre-Sleep Discharge + RB2 Deceleration"
        : "Pre-Sleep Discharge Protocol"

    suggestedProtocol = chooseProtocol("latency", latencyCandidates, fallback)

    // Protocol steps (from your PDF framing)
    if (suggestedProtocol.toLowerCase().includes("heat")) {
      actions.push("Remove rhythmic stimulation: no music, no scrolling, no narrative replay.")
      actions.push("RB2 Deceleration breathing: inhale 4s → pause 2s → exhale 6s → pause 2s (12–15 cycles).")
      actions.push("Internal cooling (without cold): spread awareness to soles/knees/elbows/palms (no focusing).")
      actions.push("Sleep Entry Lock: once sleepy, do not re-engage thought; if clarity spikes, return to breath.")

      avoid.push("Cold showers before bed / ice water / cooling shocks.")
      avoid.push("Intense breathing or visualisation.")
      avoid.push("Hot food/drinks/showers late (keep ≤ warm).")
    } else {
      actions.push("Step 1: Outbound rhythmic discharge (15–30 min): walking (best) or gentle cycling / slow movement.")
      actions.push("Rule: continuous motion, not exertion.")
      actions.push("Step 2: Sensory smoothing (10 min): dim lighting, no screens, neutral temp, no high-contrast sound.")
      actions.push("Step 3: Breath normalisation (5 min): natural breathing + slightly longer exhale (no holds).")
      actions.push("Step 4: Sleep entry: lie down only after the body quiets; if restlessness returns, repeat Step 1 briefly.")

      if (suggestedProtocol.toLowerCase().includes("rb2")) {
        actions.push("RB2 Deceleration add-on: inhale 4s → pause 2s → exhale 6s → pause 2s (12–15 cycles).")
        avoid.push("Visualisation (it re-engages the mind).")
      }

      avoid.push("Screens / scrolling late.")
      avoid.push("Late stimulants (caffeine).")
    }
  }

  // --------------------------------
  // WAKE-UPS (THIRD PRIORITY)
  // --------------------------------
  else if (driver === "Stabilization") {
    headline = "Tonight plan: Reduce wake-ups"
    primaryDriver = "Wake-ups above your baseline"

    const fallback = "Sleep Continuity Reset + Night-Awake Reset"
    suggestedProtocol = chooseProtocol("wake", wakeCandidates, fallback)

    why.push(`Baseline wake-ups: ${baselineWake.toFixed(1)}`)
    why.push(`Recent wake-ups: ${avgWake7.toFixed(1)}`)
    if (wakePattern) why.push(`${wakePattern} of the last 7 nights had higher wake-ups than baseline.`)

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
  // OPTIMIZATION (LAST)
  // --------------------------------
  else {
    headline = "Tonight plan: Maintain good sleep"
    primaryDriver = "Core sleep metrics are stable"

    suggestedProtocol = chooseProtocol("quality", optCandidates, "Maintain Routine (One-Lever Test)")

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

  return {
    headline,
    primaryDriver,
    protocolFamily,
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
