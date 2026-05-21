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
  const maintenanceIssue = hasMaintenanceIssue(night);

  return Boolean(
    majorQualityIssue ||
      majorLatencyIssue ||
      maintenanceIssue ||
      (wakeIssue && qualityIssue) ||
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
  const combinedText = `${text} ${profileText}`;
  const maintenanceIssue = hasMaintenanceIssue(night);
  const prolongedWakeRecovery = hasProlongedWakeRecovery(night);
  const majorWakeRecovery = hasMajorWakeRecovery(night);

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

  return {
    mind_emotional: clamp7(scores.mind_emotional),
    body_physiology: clamp7(scores.body_physiology),
    environment: clamp7(scores.environment),
    sleep_hygiene: clamp7(scores.sleep_hygiene),
    circadian_context: clamp7(scores.circadian_context),
  };
}

function chooseDominantCategory(scores: ReturnType<typeof scoreNightCategories>): RRSMContributorCategory {
  const priority: RRSMContributorCategory[] = [
    "mind_emotional",
    "body_physiology",
    "environment",
    "sleep_hygiene",
    "circadian_context",
  ];

  const maxScore = Math.max(
    scores.mind_emotional,
    scores.body_physiology,
    scores.environment,
    scores.sleep_hygiene,
    scores.circadian_context,
  );

  if (maxScore <= 0) return "none";

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

  if (category === "environment" && wakeUps >= 2 && typeof wakeRecovery === "number" && wakeRecovery >= 15) {
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
    const cat = chooseDominantCategory(scores);
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

export function runRRSMEngineV4(nights: NightWithOptionalProtocol[]): RRSMProtocolResult {
  const base = runRRSMEngineV2(nights);

  const latestNight = nights[nights.length - 1];
  const sleepIssueDetected = detectSleepIssue(latestNight);
  const categoryScores = scoreNightCategories(latestNight);
  const dominantCategory = sleepIssueDetected ? chooseDominantCategory(categoryScores) : "none";
  const recommendedProtocol = protocolForCategory(dominantCategory, categoryScores, latestNight);
  const recurring = recurringIssue(nights, dominantCategory);
  const secondaryFactors = secondaryFactorsFor(categoryScores, dominantCategory);
  const protocolConfidence = confidenceFor(nights, sleepIssueDetected, recurring);
  const protocolEvaluation = evaluateProtocol(nights);

  const protocolReason = detailedReasonForLatestNight(dominantCategory, latestNight);

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
  ];

  const actions = [`Tonight's recommended protocol: ${recommendedProtocol}`, ...base.actions];

  if (secondaryFactors.length > 0) {
    actions.push(`Secondary factors to watch: ${secondaryFactors.join(", ")}.`);
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
    why,
    actions,
  };
}
