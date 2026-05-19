// lib/rrsm/engine-v4.ts
// RRSM Engine v4 — protocol decision layer
// Purpose:
// 1) Detect whether there was a sleep issue.
// 2) Detect whether the same issue is recurring.
// 3) Score contributor categories from 1–7.
// 4) Choose the best protocol using RRSM priority order.
// 5) Prepare the structure needed later for protocol-followed evaluation.
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
  protocolEvaluation: "not_enough_data" | "case_a_working" | "case_b_hidden_factor" | "case_c_not_followed";
};

type NightWithOptionalProtocol = RRSMMetricsNight & {
  protocolFollowed?: "yes" | "partial" | "no" | null;
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
  return [
    night.primaryDriver,
    night.secondaryDriver,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function detectSleepIssue(night: RRSMMetricsNight | undefined): boolean {
  if (!night) return false;

  const qualityIssue = typeof night.quality === "number" && night.quality <= 6;
  const majorQualityIssue = typeof night.quality === "number" && night.quality <= 3;
  const latencyIssue = typeof night.latencyMin === "number" && night.latencyMin >= 30;
  const majorLatencyIssue = typeof night.latencyMin === "number" && night.latencyMin >= 45;
  const wakeIssue = typeof night.wakeUps === "number" && night.wakeUps >= 3;

  return Boolean(majorQualityIssue || majorLatencyIssue || wakeIssue || (qualityIssue && latencyIssue));
}

function scoreNightCategories(night: RRSMMetricsNight | undefined) {
  const scores = {
    mind_emotional: 0,
    body_physiology: 0,
    environment: 0,
    sleep_hygiene: 0,
    circadian_context: 0,
  };

  if (!night) return scores;

  const text = joinedNightText(night);

  // C1 — Mind / emotional activation: RB2/RB3
  if (
    lowerIncludes(text, [
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

  // C2 — Body physiology: RB1
  if (
    lowerIncludes(text, [
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

  // C3 — Environment
  if (
    lowerIncludes(text, [
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

  // C4 — Personal sleep hygiene / behaviour
  if (
    lowerIncludes(text, [
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
    lowerIncludes(text, [
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

function protocolForCategory(category: RRSMContributorCategory, scores: ReturnType<typeof scoreNightCategories>) {
  switch (category) {
    case "mind_emotional":
      return "RRSM Quieting Protocol";
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
      return "Your sleep form points most strongly toward mind/emotional activation. This commonly affects falling asleep and can reappear as wake-ups later in the night.";
    case "body_physiology":
      return "Your sleep form points most strongly toward body-based activation such as pain, tension, inflammation, DOMS, illness, or physical discomfort.";
    case "environment":
      return "Your sleep form points most strongly toward room or environmental disruption. The first aim is to reduce external sleep interference.";
    case "sleep_hygiene":
      return "Your sleep form points most strongly toward a personal sleep-rhythm habit, such as late caffeine, screens, alcohol, nicotine, late food, or late exercise.";
    case "circadian_context":
      return "Your sleep form suggests a rhythm/context limitation. The goal is to improve sleep transition and recovery stability, while recognising that timing constraints may limit results.";
    default:
      return "Your sleep form does not show a clear sleep issue tonight.";
  }
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

function recurringIssue(nights: RRSMMetricsNight[], dominant: RRSMContributorCategory): boolean {
  if (dominant === "none") return false;
  const lastSeven = nights.slice(-7);
  const matches = lastSeven.filter((night) => {
    const scores = scoreNightCategories(night);
    const cat = chooseDominantCategory(scores);
    return cat === dominant && detectSleepIssue(night);
  });

  return matches.length >= 2;
}

function confidenceFor(nights: RRSMMetricsNight[], sleepIssueDetected: boolean, recurring: boolean) {
  if (!sleepIssueDetected) return "low";
  if (recurring && nights.length >= 5) return "high";
  if (nights.length >= 3) return "moderate";
  return "low";
}

function evaluateProtocol(nights: NightWithOptionalProtocol[]): RRSMProtocolResult["protocolEvaluation"] {
  if (nights.length < 2) return "not_enough_data";

  const previous = nights[nights.length - 2];
  const latest = nights[nights.length - 1];

  const followed = previous.protocolFollowed ?? null;
  if (!followed || followed === "no" || followed === "partial") return "case_c_not_followed";

  const prevIssue = detectSleepIssue(previous);
  const latestIssue = detectSleepIssue(latest);

  if (prevIssue && !latestIssue) return "case_a_working";
  if (prevIssue && latestIssue) return "case_b_hidden_factor";

  return "not_enough_data";
}

export function runRRSMEngineV4(nights: NightWithOptionalProtocol[]): RRSMProtocolResult {
  const base = runRRSMEngineV2(nights);

  const latestNight = nights[nights.length - 1];
  const sleepIssueDetected = detectSleepIssue(latestNight);
  const categoryScores = scoreNightCategories(latestNight);
  const dominantCategory = sleepIssueDetected ? chooseDominantCategory(categoryScores) : "none";
  const recommendedProtocol = protocolForCategory(dominantCategory, categoryScores);
  const recurring = recurringIssue(nights, dominantCategory);
  const secondaryFactors = secondaryFactorsFor(categoryScores, dominantCategory);
  const protocolConfidence = confidenceFor(nights, sleepIssueDetected, recurring);
  const protocolEvaluation = evaluateProtocol(nights);

  const why = [
    ...base.why,
    sleepIssueDetected
      ? "Sleep issue detected from the latest sleep record."
      : "No clear sleep issue detected from the latest sleep record.",
    recurring
      ? "This contributor appears to be recurring in recent entries."
      : "This does not yet look like a recurring pattern.",
    reasonForCategory(dominantCategory),
  ];

  const actions = [
    `Tonight's recommended protocol: ${recommendedProtocol}`,
    ...base.actions,
  ];

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
    protocolReason: reasonForCategory(dominantCategory),
    secondaryFactors,
    protocolConfidence,
    protocolEvaluation,
    why,
    actions,
  };
}

