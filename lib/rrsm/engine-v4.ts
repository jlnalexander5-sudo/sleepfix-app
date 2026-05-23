// lib/rrsm/engine-v4.ts
// RRSM Engine v4 — protocol decision layer
// Purpose:
// 1) Detect whether there was a sleep issue.
// 2) Detect whether the same issue is recurring.
// 3) Score contributor categories from 1–7.
// 4) Choose the best protocol using RRSM priority order.
// 5) Evaluate whether the previous recommended protocol appears to be working.
//
// This file is intentionally deterministic and explainable.

import type { RRSMMetricsNight, RRSMV2Insight } from "./engine-v2";
import { runRRSMEngineV2 } from "./engine-v2";

export type RRSMContributorCategory =
  | "mind_emotional"
  | "body_physiology"
  | "environment"
  | "sleep_hygiene"
  | "circadian_context"
  | "none";

export type RRSMProtocolEvaluation =
  | "not_enough_data"
  | "case_a_working"
  | "case_b_hidden_factor"
  | "case_c_not_followed";

export type RRSMSleepDimensionScores = {
  sleepRecovery: number;
  sleepStability: number;
  thermalStability: number;
  wakeMaintenance: number;
  sleepOnset: number;
  environmentStress: number;
};

export type RRSMProtocolResult = RRSMV2Insight & {
  sleepIssueDetected: boolean;
  recurringIssue: boolean;
  dominantCategory: RRSMContributorCategory;
  categoryScores: {
    mind_emotional: number;
    body_physiology: number;
    environment: number;
    sleep_hygiene: number;
    circadian_context: number;
  };
  recommendedProtocol: string;
  protocolReason: string;
  secondaryFactors: RRSMContributorCategory[];
  protocolConfidence: "low" | "moderate" | "high";
  protocolEvaluation: RRSMProtocolEvaluation;
  protocolEvaluationLabel: string;
  protocolEvaluationReason: string;
  hiddenFactorSuspected: boolean;
  hiddenFactorReason: string | null;
  patternStability: "stable" | "forming" | "unstable";
  investigationPrompt: string | null;
  userSummary: string;
  sleepDimensions: RRSMSleepDimensionScores;
  sleepDimensionSummary: string;
};

type ProtocolFollowedValue =
  | "yes"
  | "partial"
  | "no"
  | "none"
  | "not_used"
  | "not_applicable"
  | null
  | undefined;

type NightWithOptionalProtocol = RRSMMetricsNight & {
  sleepContext?: string[] | null;
  workContext?: string[] | null;
  sleep_context?: string[] | null;
  work_context?: string[] | null;
  wakeRecoveryMin?: number | null;
  wake_recovery_choice?: string | null;
  wakeRecoveryChoice?: string | null;
  protocolFollowed?: ProtocolFollowedValue;
  protocol_followed?: ProtocolFollowedValue;
  protocol_used_name?: string | null;
  protocolUsedName?: string | null;
  primary_trigger?: string | null;
  primaryTrigger?: string | null;
  bed_tags?: string[] | null;
  bedTags?: string[] | null;
};

function clamp7(n: number) {
  return Math.max(0, Math.min(7, n));
}

function lowerIncludes(value: string | null | undefined, needles: string[]) {
  const s = String(value ?? "").toLowerCase();
  return needles.some((n) => s.includes(n));
}

function joinedNightText(night: RRSMMetricsNight) {
  return [night.primaryDriver, night.secondaryDriver].filter(Boolean).join(" ").toLowerCase();
}
function getPrimaryTrigger(night: NightWithOptionalProtocol | undefined) {
  if (!night) return "";

  return String(
    night.primary_trigger ??
      night.primaryTrigger ??
      ""
  )
    .trim()
    .toLowerCase();
}
function joinedProfileText(night: NightWithOptionalProtocol | undefined) {
  if (!night) return "";
  const sleepContext = night.sleepContext ?? night.sleep_context ?? [];
  const workContext = night.workContext ?? night.work_context ?? [];

  return [
    ...(Array.isArray(sleepContext) ? sleepContext : []),
    ...(Array.isArray(workContext) ? workContext : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}


function joinedBedText(night: NightWithOptionalProtocol | undefined) {
  if (!night) return "";
  const bedTags = night.bedTags ?? night.bed_tags ?? [];
  return Array.isArray(bedTags) ? bedTags.filter(Boolean).join(" ").toLowerCase() : "";
}

function hasBedThermalSignal(night: NightWithOptionalProtocol | undefined) {
  const bedText = joinedBedText(night);
  return lowerIncludes(bedText, [
    "mattress too hard",
    "mattress too soft",
    "bed felt hot",
    "bed felt cold",
    "too many blankets",
    "too few blankets",
    "partner body heat",
    "sleepwear too warm",
    "sleepwear too light",
    "pillow / position issue",
    "pillow",
    "bedding",
    "bed factor",
  ]);
}

function parseWakeRecoveryToMinutes(night: NightWithOptionalProtocol | undefined): number | null {
  if (!night) return null;

  if (typeof night.wakeRecoveryMin === "number") return night.wakeRecoveryMin;

  const raw = String(night.wake_recovery_choice ?? night.wakeRecoveryChoice ?? "").toLowerCase().trim();
  if (!raw) return null;

  if (raw.includes("60")) return 60;
  if (raw.includes("30-60") || raw.includes("30–60")) return 30;
  if (raw.includes("15-30") || raw.includes("15–30")) return 15;
  if (raw.includes("5-15") || raw.includes("5–15")) return 5;
  if (raw.includes("0-5") || raw.includes("0–5")) return 0;

  const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function hasProlongedWakeRecovery(night: NightWithOptionalProtocol | undefined): boolean {
  const mins = parseWakeRecoveryToMinutes(night);
  return typeof mins === "number" && mins >= 15;
}

function hasMajorWakeRecovery(night: NightWithOptionalProtocol | undefined): boolean {
  const mins = parseWakeRecoveryToMinutes(night);
  return typeof mins === "number" && mins >= 30;
}

function hasMaintenanceIssue(night: NightWithOptionalProtocol | undefined): boolean {
  if (!night) return false;
  const wakeUps = typeof night.wakeUps === "number" ? night.wakeUps : 0;
  return wakeUps >= 2 && hasProlongedWakeRecovery(night);
}

function detectSleepIssue(night: NightWithOptionalProtocol | undefined): boolean {
  if (!night) return false;

  const qualityIssue = typeof night.quality === "number" && night.quality <= 6;
  const majorQualityIssue = typeof night.quality === "number" && night.quality <= 3;
  const latencyIssue = typeof night.latencyMin === "number" && night.latencyMin >= 30;
  const majorLatencyIssue = typeof night.latencyMin === "number" && night.latencyMin >= 45;
  const wakeIssue = typeof night.wakeUps === "number" && night.wakeUps >= 3;
  const bedThermalSignal = hasBedThermalSignal(night);
  const maintenanceIssue = hasMaintenanceIssue(night);
  const prolongedWakeRecovery = hasProlongedWakeRecovery(night);
  const majorWakeRecovery = hasMajorWakeRecovery(night);

return Boolean(
  majorLatencyIssue ||
    wakeIssue ||
    maintenanceIssue ||
    prolongedWakeRecovery ||
    majorWakeRecovery ||
    bedThermalSignal ||
    majorQualityIssue ||
    (qualityIssue && latencyIssue)
);
}

function scoreNightCategories(night: NightWithOptionalProtocol | undefined) {
  const scores = {
    mind_emotional: 0,
    body_physiology: 0,
    environment: 0,
    sleep_hygiene: 0,
    circadian_context: 0,
  };

  if (!night) return scores;

  const text = joinedNightText(night);
  const profileText = joinedProfileText(night);
  const bedText = joinedBedText(night);
  const combinedText = `${text} ${profileText} ${bedText}`;
  const maintenanceIssue = hasMaintenanceIssue(night);
  const prolongedWakeRecovery = hasProlongedWakeRecovery(night);
  const majorWakeRecovery = hasMajorWakeRecovery(night);
  const primaryTrigger = getPrimaryTrigger(night);

  // C1 — Mind / emotional activation: RB2/RB3
  if (
    lowerIncludes(combinedText, [
      "stress",
      "worry",
      "anxious",
      "anxiety",
      "racing",
      "thought",
      "overstimulated",
      "wired",
      "alert",
      "emotional",
      "confrontation",
      "overwhelmed",
    ])
  ) {
    scores.mind_emotional += 4;
  }

  if (typeof night.latencyMin === "number" && night.latencyMin >= 45) {
    scores.mind_emotional += 2;
  } else if (typeof night.latencyMin === "number" && night.latencyMin >= 30) {
    scores.mind_emotional += 1;
  }

  if (prolongedWakeRecovery && scores.mind_emotional > 0) {
    scores.mind_emotional += 1;
  }

  // C2 — Body physiology: RB1
  if (
    lowerIncludes(combinedText, [
      "pain",
      "discomfort",
      "doms",
      "sore",
      "inflammation",
      "inflamed",
      "tense",
      "restless",
      "ill",
      "flu",
      "sick",
      "heavy fatigue",
      "body",
    ])
  ) {
    scores.body_physiology += 4;
  }

  if (typeof night.wakeUps === "number" && night.wakeUps >= 3) {
    scores.body_physiology += 1;
  }

  if (maintenanceIssue && scores.body_physiology > 0) {
    scores.body_physiology += majorWakeRecovery ? 3 : 2;
  }

  // C3 — Environment / room disruption
  if (
    lowerIncludes(combinedText, [
      "hot",
      "cold",
      "noise",
      "noisy",
      "light",
      "bright",
      "humid",
      "dry",
      "mosquito",
      "room",
      "temperature",
      "mattress",
      "blanket",
      "blankets",
      "bedding",
      "bed felt",
      "partner body heat",
      "sleepwear",
      "pillow",
    ])
  ) {
    scores.environment += 4;
  }

  // Wake-up persistence makes room/body factors much more important.
  // Example: cold room + repeated long awake periods = real maintenance disruption.
  if (maintenanceIssue && scores.environment > 0) {
    scores.environment += majorWakeRecovery ? 3 : 2;
  }

  // C4 — Personal sleep hygiene / behaviour
  if (
    lowerIncludes(combinedText, [
      "caffeine",
      "coffee",
      "alcohol",
      "nicotine",
      "smoking",
      "smoke",
      "screen",
      "phone",
      "tv",
      "scroll",
      "late meal",
      "food",
      "eating",
      "exercise late",
      "gym",
    ])
  ) {
    scores.sleep_hygiene += 4;
  }

  if (typeof night.latencyMin === "number" && night.latencyMin >= 45 && scores.sleep_hygiene > 0) {
    scores.sleep_hygiene += 1;
  }

  // C5 — Circadian/context limitation
  if (
    lowerIncludes(combinedText, [
      "shift",
      "night shift",
      "jet lag",
      "travel",
      "irregular",
      "pregnant",
      "pregnancy",
      "chronic",
      "illness",
    ])
  ) {
    scores.circadian_context += 4;
  }

  // Profile/context modifiers.
  // These do not diagnose the night by themselves; they bias the engine when nightly signals also point that way.
  if (lowerIncludes(profileText, ["night shift", "rotating shift", "irregular work", "shift-based", "jet lag", "travel"])) {
    scores.circadian_context += maintenanceIssue || typeof night.latencyMin === "number" && night.latencyMin >= 30 ? 3 : 1;
  }

  if (lowerIncludes(profileText, ["pregnancy", "chronic illness"])) {
    scores.circadian_context += 2;
    scores.body_physiology += 1;
  }

  if (lowerIncludes(profileText, ["construction", "physical labour", "machinery", "tools", "mostly standing", "driving"])) {
    scores.body_physiology += lowerIncludes(text, ["pain", "discomfort", "tense", "restless", "fatigue", "sore", "inflamed"]) ? 2 : 1;
  }

  if (lowerIncludes(profileText, ["desk work", "screen-heavy", "phone", "mostly sitting"])) {
    scores.mind_emotional += lowerIncludes(text, ["racing", "thought", "wired", "alert", "stimulated", "foggy"]) ? 2 : 1;
    scores.sleep_hygiene += lowerIncludes(text, ["screen", "phone", "tv", "scroll"]) ? 2 : 0;
  }

  if (lowerIncludes(profileText, ["talking", "customer-facing", "high-stress decision"])) {
    scores.mind_emotional += lowerIncludes(text, ["stress", "worry", "anxious", "upset", "overwhelmed"]) ? 2 : 1;
  }

  // Bed / bedding thermal setup.
  // This catches nights where sleep quality is good while asleep, but repeated wake-ups are caused by bed heat/cold instability.
  if (hasBedThermalSignal(night)) {
    scores.environment += maintenanceIssue || prolongedWakeRecovery ? 4 : 3;
  }

  if (lowerIncludes(bedText, ["mattress too hard", "bed felt hot", "too many blankets", "partner body heat", "sleepwear too warm", "pillow"])) {
    scores.environment += 2;
  }

  if (lowerIncludes(bedText, ["mattress too soft", "bed felt cold", "too few blankets", "sleepwear too light", "pillow / position"])) {
    scores.environment += 2;
  }

  // User-perceived dominant trigger weighting.
  // This is NOT absolute truth. It is a weighting boost only.
  if (primaryTrigger.includes("emotional")) {
    scores.mind_emotional += 2;
  }

  if (primaryTrigger.includes("mental")) {
    scores.mind_emotional += 2;
  }

  if (primaryTrigger.includes("body") || primaryTrigger.includes("pain")) {
    scores.body_physiology += 2;
  }

  if (
    primaryTrigger.includes("room") ||
    primaryTrigger.includes("environment") ||
    primaryTrigger.includes("bed") ||
    primaryTrigger.includes("bedding")
  ) {
    scores.environment += 2;
  }

  if (primaryTrigger.includes("hygiene") || primaryTrigger.includes("habit")) {
    scores.sleep_hygiene += 2;
  }

  if (primaryTrigger.includes("circadian") || primaryTrigger.includes("schedule")) {
    scores.circadian_context += 2;
  }

  return {
    mind_emotional: clamp7(scores.mind_emotional),
    body_physiology: clamp7(scores.body_physiology),
    environment: clamp7(scores.environment),
    sleep_hygiene: clamp7(scores.sleep_hygiene),
    circadian_context: clamp7(scores.circadian_context),
  };
}

function chooseDominantCategory(
  scores: ReturnType<typeof scoreNightCategories>,
  night?: NightWithOptionalProtocol,
): RRSMContributorCategory {
  const maxScore = Math.max(
    scores.mind_emotional,
    scores.body_physiology,
    scores.environment,
    scores.sleep_hygiene,
    scores.circadian_context,
  );

  if (maxScore <= 0) return "none";

  // Bed / bedding thermal disruption should win over generic body discomfort.
  // Example: user wakes repeatedly because mattress/blankets create heat/cold instability.
  if (night && hasBedThermalSignal(night) && scores.environment >= Math.max(scores.body_physiology - 1, 3)) {
    return "environment";
  }

  const primaryTrigger = getPrimaryTrigger(night);
  if (
    primaryTrigger &&
    (primaryTrigger.includes("bed") ||
      primaryTrigger.includes("bedding") ||
      primaryTrigger.includes("room") ||
      primaryTrigger.includes("environment")) &&
    scores.environment >= 3
  ) {
    return "environment";
  }

  const priority: RRSMContributorCategory[] = [
    "mind_emotional",
    "environment",
    "body_physiology",
    "sleep_hygiene",
    "circadian_context",
  ];

  return priority.find((cat) => scores[cat as keyof typeof scores] === maxScore) ?? "none";
}

function mindProtocolForNight(night: NightWithOptionalProtocol | undefined) {
  const text = `${joinedNightText(night as RRSMMetricsNight)} ${joinedProfileText(night)}`;

  const hasMentalActivation = lowerIncludes(text, [
    "racing",
    "thought",
    "thoughts",
    "mentally stimulated",
    "mental",
    "wired",
    "alert",
    "focused",
    "overstimulated",
  ]);

  const hasEmotionalActivation = lowerIncludes(text, [
    "anxious",
    "anxiety",
    "worried",
    "worry",
    "upset",
    "stress",
    "stressed",
    "euphoric",
    "depressed",
    "low",
    "flat",
    "emotional",
  ]);

  if (hasMentalActivation) return "RRSM Quieting Protocol";
  if (hasEmotionalActivation) return "RRSM Body Downshift Protocol";

  return "RRSM Quieting Protocol";
}


function protocolForCategory(category: RRSMContributorCategory, scores: ReturnType<typeof scoreNightCategories>, night?: NightWithOptionalProtocol) {
  switch (category) {
    case "mind_emotional":
      return mindProtocolForNight(night);
    case "body_physiology":
      if (scores.body_physiology >= 5) return "RRSM Body Recovery Protocol";
      return "RRSM Body Downshift Protocol";
    case "environment":
      return "Sleep Environment Reset Protocol";
    case "sleep_hygiene":
      return "RRSM Shutdown Ritual";
    case "circadian_context":
      return "RRSM Rhythm Support Protocol";
    default:
      return "No protocol needed tonight";
  }
}

function reasonForCategory(category: RRSMContributorCategory) {
  switch (category) {
    case "mind_emotional":
      return "Your sleep form points toward mind or emotional activation. Mental activation usually needs quieting; emotional activation often needs body downshifting first.";
    case "body_physiology":
      return "Your sleep form points most strongly toward body-based activation such as pain, tension, inflammation, DOMS, illness, or physical discomfort.";
    case "environment":
      return "Your sleep form points most strongly toward room-environment disruption. If wake-ups included longer awake periods, the issue is likely sleep maintenance rather than falling asleep.";
    case "sleep_hygiene":
      return "Your sleep form points most strongly toward a personal sleep-rhythm habit, such as late caffeine, screens, alcohol, nicotine, late food, or late exercise.";
    case "circadian_context":
      return "Your profile context suggests a rhythm or life-context limitation may be affecting sleep. The goal is to improve sleep transition and recovery stability without treating real timing constraints as simple habits.";
    default:
      return "Your sleep form does not show a clear sleep issue tonight.";
  }
}


function detailedReasonForLatestNight(category: RRSMContributorCategory, latestNight: NightWithOptionalProtocol | undefined) {
  const baseReason = reasonForCategory(category);
  if (!latestNight) return baseReason;

  const wakeUps = typeof latestNight.wakeUps === "number" ? latestNight.wakeUps : 0;
  const wakeRecovery = parseWakeRecoveryToMinutes(latestNight);
  const text = joinedNightText(latestNight);
  const bedText = joinedBedText(latestNight);

  if (category === "environment" && wakeUps >= 2 && typeof wakeRecovery === "number" && wakeRecovery >= 15) {
    if (lowerIncludes(bedText, ["mattress too hard", "bed felt hot", "too many blankets", "partner body heat", "sleepwear too warm", "pillow"])) {
      return "SleepFix detected bed/bedding heat-related sleep maintenance disruption: repeated wake-ups plus longer awake time after waking. The main target is stabilising bed temperature without overcooling or overcorrecting.";
    }

    if (lowerIncludes(bedText, ["mattress too soft", "bed felt cold", "too few blankets", "sleepwear too light", "pillow / position"])) {
      return "SleepFix detected bed/bedding cold-related sleep maintenance disruption: repeated wake-ups plus longer awake time after waking. The main target is stable warmth across the whole night without needing mid-night corrections.";
    }

    if (lowerIncludes(text, ["cold"])) {
      return "SleepFix detected cold-related sleep maintenance disruption: repeated wake-ups plus longer awake time after waking. The main target is stable warmth through the whole night, especially feet and bedding.";
    }
    if (lowerIncludes(text, ["hot", "humid"])) {
      return "SleepFix detected heat/humidity-related sleep maintenance disruption: repeated wake-ups plus longer awake time after waking. The main target is thermal stability without overcooling the body.";
    }
    return "SleepFix detected room-related sleep maintenance disruption: repeated wake-ups plus longer awake time after waking. The main target is removing the room factor that kept reactivating you.";
  }

  if (category === "body_physiology" && wakeUps >= 2 && typeof wakeRecovery === "number" && wakeRecovery >= 15) {
    return "SleepFix detected body-related sleep maintenance disruption: repeated wake-ups plus longer awake time after waking. The main target is reducing body activation enough that wake-ups do not keep you awake.";
  }

  if (category === "mind_emotional" && wakeUps >= 2 && typeof wakeRecovery === "number" && wakeRecovery >= 15) {
    if (lowerIncludes(text, ["racing", "thought", "mentally stimulated", "wired", "alert"])) {
      return "SleepFix detected mental reactivation after waking. The main target is stopping wake-ups from turning into long awake periods.";
    }

    if (lowerIncludes(text, ["anxious", "worried", "upset", "stress", "stressed", "euphoric", "depressed", "low", "flat"])) {
      return "SleepFix detected emotional activation affecting sleep maintenance. The main target is reducing emotional charge through body downshifting before trying to sleep again.";
    }

    return "SleepFix detected mind/emotional reactivation after waking. The main target is stopping wake-ups from turning into long awake periods.";
  }

  return baseReason;
}

function secondaryFactorsFor(scores: ReturnType<typeof scoreNightCategories>, dominant: RRSMContributorCategory) {
  const entries: Array<[RRSMContributorCategory, number]> = [
    ["mind_emotional", scores.mind_emotional],
    ["body_physiology", scores.body_physiology],
    ["environment", scores.environment],
    ["sleep_hygiene", scores.sleep_hygiene],
    ["circadian_context", scores.circadian_context],
  ];

  return entries
    .filter(([cat, score]) => cat !== dominant && score >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);
}

function recurringIssue(nights: NightWithOptionalProtocol[], dominant: RRSMContributorCategory): boolean {
  if (dominant === "none") return false;

  const lastSeven = nights.slice(-7);
  const matches = lastSeven.filter((night) => {
    const scores = scoreNightCategories(night);
    const cat = chooseDominantCategory(scores, night);
    return cat === dominant && detectSleepIssue(night);
  });

  return matches.length >= 2;
}

function confidenceFor(nights: NightWithOptionalProtocol[], sleepIssueDetected: boolean, recurring: boolean) {
  if (!sleepIssueDetected) return "low";
  if (recurring && nights.length >= 5) return "high";
  if (nights.length >= 3) return "moderate";
  return "low";
}

function getProtocolFollowed(night: NightWithOptionalProtocol | undefined): ProtocolFollowedValue {
  if (!night) return null;
  return night.protocolFollowed ?? night.protocol_followed ?? null;
}

function normalizeProtocolFollowed(value: ProtocolFollowedValue): "yes" | "partial" | "no" | "none" | null {
  if (!value) return null;
  const v = String(value).toLowerCase().trim();

  if (v === "yes" || v.includes("followed")) return "yes";
  if (v === "partial" || v.includes("part")) return "partial";
  if (v === "none" || v === "not_used" || v === "not applicable" || v === "not_applicable") return "none";
  if (v === "no" || v.includes("did not")) return "no";

  return null;
}

function evaluateProtocol(nights: NightWithOptionalProtocol[]): {
  value: RRSMProtocolEvaluation;
  label: string;
  reason: string;
} {
  if (nights.length < 2) {
    return {
      value: "not_enough_data",
      label: "Not enough data yet",
      reason: "SleepFix needs at least two saved nights to compare protocol use against the next sleep result.",
    };
  }

  const previous = nights[nights.length - 2];
  const latest = nights[nights.length - 1];

  const followed = normalizeProtocolFollowed(getProtocolFollowed(previous));

  if (!followed || followed === "none" || followed === "no" || followed === "partial") {
    return {
      value: "case_c_not_followed",
      label: "Case C — protocol not fully followed",
      reason: "The previous protocol was not followed fully, so SleepFix cannot fairly judge whether it worked.",
    };
  }

  const prevIssue = detectSleepIssue(previous);
  const latestIssue = detectSleepIssue(latest);

  if (prevIssue && !latestIssue) {
    return {
      value: "case_a_working",
      label: "Case A — protocol appears to be working",
      reason: "The protocol was followed and the next saved night no longer shows a clear sleep issue.",
    };
  }

  if (prevIssue && latestIssue) {
    return {
      value: "case_b_hidden_factor",
      label: "Case B — hidden factor likely remains",
      reason: "The protocol was followed but the next saved night still shows a sleep issue, so another contributor may be present.",
    };
  }

  return {
    value: "not_enough_data",
    label: "Not enough data yet",
    reason: "The saved nights do not yet show a clear before-and-after protocol comparison.",
  };
}


function latestIssueCategories(nights: NightWithOptionalProtocol[], limit = 5): RRSMContributorCategory[] {
  return nights
    .slice(-limit)
    .filter((night) => detectSleepIssue(night))
    .map((night) => chooseDominantCategory(scoreNightCategories(night), night))
    .filter((cat) => cat !== "none");
}

function detectPatternStability(
  nights: NightWithOptionalProtocol[],
  dominant: RRSMContributorCategory,
  protocolEvaluation: RRSMProtocolEvaluation,
): "stable" | "forming" | "unstable" {
  const cats = latestIssueCategories(nights, 5);
  const unique = new Set(cats);

  if (protocolEvaluation === "case_b_hidden_factor") return "unstable";
  if (cats.length >= 3 && unique.size >= 3) return "unstable";
  if (dominant !== "none" && cats.filter((cat) => cat === dominant).length >= 2) return "stable";

  return "forming";
}

function detectHiddenFactor(
  nights: NightWithOptionalProtocol[],
  dominant: RRSMContributorCategory,
  protocolEvaluation: RRSMProtocolEvaluation,
): {
  suspected: boolean;
  reason: string | null;
} {
  if (protocolEvaluation !== "case_b_hidden_factor") {
    return { suspected: false, reason: null };
  }

  const latest = nights[nights.length - 1];
  const previous = nights[nights.length - 2];

  if (!latest || !previous) {
    return {
      suspected: true,
      reason: "The protocol was followed but the next night still showed a sleep issue. SleepFix needs more data to identify what changed.",
    };
  }

  const latestCat = chooseDominantCategory(scoreNightCategories(latest), latest);
  const previousCat = chooseDominantCategory(scoreNightCategories(previous), previous);

  if (latestCat !== previousCat && latestCat !== "none" && previousCat !== "none") {
    return {
      suspected: true,
      reason:
        "The protocol was followed, but the main sleep factor shifted. This suggests the original protocol may not have been targeting the main remaining cause.",
    };
  }

  if (dominant === "environment") {
    return {
      suspected: true,
      reason:
        "The room/environment protocol was followed but sleep still remained disrupted. Check for a hidden body or timing factor, such as illness, body temperature instability, pain, or irregular schedule pressure.",
    };
  }

  if (dominant === "mind_emotional") {
    return {
      suspected: true,
      reason:
        "The mind/emotional protocol was followed but sleep still remained disrupted. Check whether the issue was actually body activation, room disturbance, caffeine/screen stimulation, or a timing constraint.",
    };
  }

  if (dominant === "body_physiology") {
    return {
      suspected: true,
      reason:
        "The body protocol was followed but sleep still remained disrupted. Check for hidden inflammation, illness, room temperature, overtraining, pain position, or schedule strain.",
    };
  }

  if (dominant === "sleep_hygiene") {
    return {
      suspected: true,
      reason:
        "The sleep-hygiene protocol was followed but sleep still remained disrupted. Check whether another factor, such as emotion, pain, room temperature, or circadian timing, was stronger than the habit factor.",
    };
  }

  return {
    suspected: true,
    reason:
      "The protocol was followed but the sleep issue remained. SleepFix suspects another hidden factor may be contributing.",
  };
}

function investigationPromptFor(
  dominant: RRSMContributorCategory,
  hiddenFactorSuspected: boolean,
  patternStability: "stable" | "forming" | "unstable",
): string | null {
  if (!hiddenFactorSuspected && patternStability !== "unstable") return null;

  switch (dominant) {
    case "environment":
      return "Tonight, check one room factor only: temperature, bedding, light, noise, humidity, or airflow. Do not change several things at once.";
    case "mind_emotional":
      return "Tonight, note whether the problem is thoughts, emotion, body activation, or outside disturbance. Do not assume they are the same issue.";
    case "body_physiology":
      return "Tonight, note the exact body factor: pain area, soreness, inflammation, illness, tension, or restless body. Also check whether room temperature worsened it.";
    case "sleep_hygiene":
      return "Tonight, track one habit variable only: caffeine, alcohol, nicotine, late food, screens, supplements, or late exercise.";
    case "circadian_context":
      return "Tonight, note whether timing pressure is unavoidable: shift work, irregular hours, travel, pregnancy, chronic illness, or a disrupted routine.";
    default:
      return "Tonight, record what changed from the previous night. SleepFix needs a cleaner signal before changing the protocol.";
  }
}

function confidenceForWithStability(
  nights: NightWithOptionalProtocol[],
  sleepIssueDetected: boolean,
  recurring: boolean,
  patternStability: "stable" | "forming" | "unstable",
  protocolEvaluation: RRSMProtocolEvaluation,
): "low" | "moderate" | "high" {
  if (!sleepIssueDetected) return "low";

  const latest = nights[nights.length - 1];
  const primaryTrigger = getPrimaryTrigger(latest);

  if (primaryTrigger) {
  const dominant = chooseDominantCategory(
    scoreNightCategories(latest)
  );

  const aligned =
    (primaryTrigger.includes("emotional") && dominant === "mind_emotional") ||
    (primaryTrigger.includes("mental") && dominant === "mind_emotional") ||
    (primaryTrigger.includes("body") && dominant === "body_physiology") ||
    (primaryTrigger.includes("room") && dominant === "environment") ||
    (primaryTrigger.includes("environment") && dominant === "environment") ||
    (primaryTrigger.includes("bed") && dominant === "environment") ||
    (primaryTrigger.includes("bedding") && dominant === "environment") ||
    (primaryTrigger.includes("hygiene") && dominant === "sleep_hygiene") ||
    (primaryTrigger.includes("schedule") && dominant === "circadian_context") ||
    (primaryTrigger.includes("circadian") && dominant === "circadian_context");

    if (!aligned) return "low";
  }

  if (patternStability === "unstable") return "low";
  if (protocolEvaluation === "case_b_hidden_factor") return "low";
  if (recurring && nights.length >= 5) return "high";
  if (nights.length >= 3) return "moderate";
  return "low";
}



function clamp100(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function calculateSleepDimensions(night: NightWithOptionalProtocol | undefined): RRSMSleepDimensionScores {
  if (!night) {
    return {
      sleepRecovery: 0,
      sleepStability: 0,
      thermalStability: 0,
      wakeMaintenance: 0,
      sleepOnset: 0,
      environmentStress: 0,
    };
  }

  const quality = typeof night.quality === "number" ? night.quality : null;
  const latency = typeof night.latencyMin === "number" ? night.latencyMin : null;
  const wakeUps = typeof night.wakeUps === "number" ? night.wakeUps : 0;
  const wakeRecovery = parseWakeRecoveryToMinutes(night);
  const bedText = joinedBedText(night);
  const nightText = joinedNightText(night);
  const combinedText = `${nightText} ${bedText}`;

  const sleepRecovery = clamp100(quality === null ? 50 : quality * 10);

  const sleepOnset = clamp100(
    latency === null
      ? 50
      : latency <= 10
      ? 95
      : latency <= 20
      ? 85
      : latency <= 30
      ? 70
      : latency <= 45
      ? 50
      : latency <= 60
      ? 35
      : 20
  );

  const wakePenalty = wakeUps * 12;
  const recoveryPenalty =
    wakeRecovery === null
      ? 0
      : wakeRecovery >= 60
      ? 45
      : wakeRecovery >= 30
      ? 32
      : wakeRecovery >= 15
      ? 20
      : wakeRecovery >= 5
      ? 8
      : 0;

  const wakeMaintenance = clamp100(100 - wakePenalty - recoveryPenalty);

  const sleepStability = clamp100(
    100 -
      (latency !== null && latency >= 30 ? 18 : 0) -
      wakePenalty -
      recoveryPenalty
  );

  const thermalSignal = lowerIncludes(combinedText, [
    "hot",
    "cold",
    "humid",
    "dry",
    "temperature",
    "mattress",
    "blanket",
    "blankets",
    "bedding",
    "bed felt",
    "partner body heat",
    "sleepwear",
    "pillow",
  ]);

  const thermalStability = clamp100(
    100 -
      (thermalSignal ? 35 : 0) -
      (hasBedThermalSignal(night) ? 25 : 0) -
      (wakeUps >= 3 ? 12 : 0) -
      (wakeRecovery !== null && wakeRecovery >= 30 ? 18 : 0)
  );

  const environmentStress = clamp100(
    (thermalSignal ? 40 : 0) +
      (hasBedThermalSignal(night) ? 30 : 0) +
      (lowerIncludes(combinedText, ["noise", "noisy", "bright", "light", "room"]) ? 20 : 0) +
      (wakeUps >= 3 ? 10 : 0) +
      (wakeRecovery !== null && wakeRecovery >= 30 ? 10 : 0)
  );

  return {
    sleepRecovery,
    sleepStability,
    thermalStability,
    wakeMaintenance,
    sleepOnset,
    environmentStress,
  };
}

function dimensionLabel(score: number, goodLabel: string, mediumLabel: string, lowLabel: string) {
  if (score >= 75) return goodLabel;
  if (score >= 50) return mediumLabel;
  return lowLabel;
}

function buildSleepDimensionSummary(dimensions: RRSMSleepDimensionScores) {
  return [
    `Recovery: ${dimensionLabel(dimensions.sleepRecovery, "good", "mixed", "low")}`,
    `Night stability: ${dimensionLabel(dimensions.sleepStability, "stable", "mixed", "unstable")}`,
    `Wake maintenance: ${dimensionLabel(dimensions.wakeMaintenance, "stable", "disrupted", "strongly disrupted")}`,
    `Thermal stability: ${dimensionLabel(dimensions.thermalStability, "stable", "mixed", "unstable")}`,
    `Sleep onset: ${dimensionLabel(dimensions.sleepOnset, "settled", "delayed", "strongly delayed")}`,
  ].join(" • ");
}


function buildUserSummary(
  latestNight: NightWithOptionalProtocol | undefined,
  dominant: RRSMContributorCategory,
  recommendedProtocol: string,
) {
  if (!latestNight) return "SleepFix does not have a saved night to summarise yet.";

  const wakeUps = typeof latestNight.wakeUps === "number" ? latestNight.wakeUps : 0;
  const wakeRecovery = parseWakeRecoveryToMinutes(latestNight);
  const latency = typeof latestNight.latencyMin === "number" ? latestNight.latencyMin : null;
  const quality = typeof latestNight.quality === "number" ? latestNight.quality : null;
  const bedText = joinedBedText(latestNight);
  const primaryTrigger = getPrimaryTrigger(latestNight);

  if (dominant === "environment" && hasBedThermalSignal(latestNight)) {
    if (lowerIncludes(bedText, ["hot", "too many blankets", "partner body heat", "too warm", "mattress too hard", "pillow"])) {
      return `SleepFix detected a sleep-maintenance issue: you woke ${wakeUps} time${wakeUps === 1 ? "" : "s"}, had ${wakeRecovery ?? "some"} minutes of awake time after waking, and your bed/bedding signals point to heat build-up or thermal instability. Tonight's match is ${recommendedProtocol}.`;
    }

    if (lowerIncludes(bedText, ["cold", "too few blankets", "too light", "mattress too soft"])) {
      return `SleepFix detected a sleep-maintenance issue: you woke ${wakeUps} time${wakeUps === 1 ? "" : "s"}, had ${wakeRecovery ?? "some"} minutes of awake time after waking, and your bed/bedding signals point to cold exposure or thermal instability. Tonight's match is ${recommendedProtocol}.`;
    }

    return `SleepFix detected a sleep-maintenance issue: you woke ${wakeUps} time${wakeUps === 1 ? "" : "s"}, had ${wakeRecovery ?? "some"} minutes of awake time after waking, and the bed/bedding setup may be part of the disruption. Tonight's match is ${recommendedProtocol}.`;
  }

  if (dominant === "environment") {
    return `SleepFix detected an environment-related sleep-maintenance issue: wake-ups and awake time after waking suggest the sleep problem was not just overall sleep quality. Tonight's match is ${recommendedProtocol}.`;
  }

  if (wakeUps >= 3 || (typeof wakeRecovery === "number" && wakeRecovery >= 30)) {
    return `SleepFix detected sleep-maintenance instability: your overall sleep quality may be acceptable, but wake-ups and awake time after waking still show a real sleep disruption. Tonight's match is ${recommendedProtocol}.`;
  }

  if (latency !== null && latency >= 30) {
    return `SleepFix detected a sleep-onset issue: it took about ${latency} minutes to fall asleep. Tonight's match is ${recommendedProtocol}.`;
  }

  if (quality !== null && quality <= 6) {
    return `SleepFix detected reduced sleep quality. Tonight's match is ${recommendedProtocol}.`;
  }

  if (primaryTrigger) {
    return `SleepFix did not detect a strong issue from the core metrics, but your main reported disruption was ${primaryTrigger}. Keep logging so SleepFix can check whether it repeats.`;
  }

  return "SleepFix did not detect a strong sleep issue from the latest record.";
}

export function runRRSMEngineV4(nights: NightWithOptionalProtocol[]): RRSMProtocolResult {
  const base = runRRSMEngineV2(nights);

  const latestNight = nights[nights.length - 1];
  const sleepIssueDetected = detectSleepIssue(latestNight);
  const categoryScores = scoreNightCategories(latestNight);
  const dominantCategory = sleepIssueDetected ? chooseDominantCategory(categoryScores, latestNight) : "none";
  const recommendedProtocol = protocolForCategory(dominantCategory, categoryScores, latestNight);
  const recurring = recurringIssue(nights, dominantCategory);
  const secondaryFactors = secondaryFactorsFor(categoryScores, dominantCategory);
  const protocolEvaluation = evaluateProtocol(nights);
  const patternStability = detectPatternStability(nights, dominantCategory, protocolEvaluation.value);
  const hiddenFactor = detectHiddenFactor(nights, dominantCategory, protocolEvaluation.value);
  const hiddenFactorSuspected = hiddenFactor.suspected;
  const hiddenFactorReason = hiddenFactor.reason;
  const investigationPrompt = investigationPromptFor(dominantCategory, hiddenFactorSuspected, patternStability);
  const protocolConfidence = confidenceForWithStability(
    nights,
    sleepIssueDetected,
    recurring,
    patternStability,
    protocolEvaluation.value,
  );

  const protocolReason = detailedReasonForLatestNight(dominantCategory, latestNight);
  const sleepDimensions = calculateSleepDimensions(latestNight);
  const sleepDimensionSummary = buildSleepDimensionSummary(sleepDimensions);
  const userSummary = buildUserSummary(latestNight, dominantCategory, recommendedProtocol);

  const why = [
    ...base.why,
    sleepIssueDetected
      ? "Sleep issue detected from the latest sleep record."
      : "No clear sleep issue detected from the latest sleep record.",
    recurring
      ? "This contributor appears to be recurring in recent entries."
      : "This does not yet look like a recurring pattern.",
    protocolReason,
    protocolEvaluation.reason,
    hiddenFactorReason ? hiddenFactorReason : null,
    investigationPrompt ? investigationPrompt : null,
  ].filter(Boolean) as string[];

  const actions = [`Tonight's recommended protocol: ${recommendedProtocol}`, ...base.actions];

  if (secondaryFactors.length > 0) {
    actions.push(`Secondary factors to watch: ${secondaryFactors.join(", ")}.`);
  }

  if (hiddenFactorSuspected && investigationPrompt) {
    actions.push(`Hidden-factor check: ${investigationPrompt}`);
  }

  return {
    ...base,
    sleepIssueDetected,
    recurringIssue: recurring,
    dominantCategory,
    categoryScores,
    recommendedProtocol,
    protocolReason,
    secondaryFactors,
    protocolConfidence,
    protocolEvaluation: protocolEvaluation.value,
    protocolEvaluationLabel: protocolEvaluation.label,
    protocolEvaluationReason: protocolEvaluation.reason,
    hiddenFactorSuspected,
    hiddenFactorReason,
    patternStability,
    investigationPrompt,
    userSummary,
    sleepDimensions,
    sleepDimensionSummary,
    why,
    actions,
  };
}
