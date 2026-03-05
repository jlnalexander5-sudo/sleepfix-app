// lib/rrsm/engine-v2.ts
// RRSM Engine v2 (practical scoring layer)
// - Works with the current SleepFix schema (sleep_nights “choice” fields already parsed to numbers)
// - Produces: domain scores, stability score, risk band, narrative (why/actions), driver summary
//
// Intended usage (Dashboard):
//   import { runRRSMEngineV2 } from "@/lib/rrsm/engine-v2";
//   const insight = runRRSMEngineV2(last7RowsMapped);
//
// Notes:
// - This engine is deliberately simple + deterministic (no ML).
// - It is designed to be stable while you iterate on RRSM domains/weights later.

export type RRSMMetricsNight = {
  dateKey?: string; // YYYY-MM-DD (optional, for display/debug)
  quality?: number | null; // 1-10
  latencyMin?: number | null; // minutes
  wakeUps?: number | null; // count
  primaryDriver?: string | null;
  secondaryDriver?: string | null;
};

export type RRSMV2Scores = {
  recovery: number;       // 0-100 (higher is better)
  onset: number;          // 0-100
  fragmentation: number;  // 0-100
  stability: number;      // 0-100
};

export type RRSMV2Risk = "low" | "moderate" | "high";

export type RRSMV2Insight = {
  title: string;
  risk: RRSMV2Risk;
  primaryIssue: "recovery" | "onset" | "fragmentation" | "mixed";
  topDriver: string; // “(no driver logged)” if none
  scores: RRSMV2Scores;
  why: string[];
  actions: string[];
  confidence: "low" | "medium" | "high";
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function mean(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(nums: number[]) {
  if (nums.length <= 1) return 0;
  const m = mean(nums);
  const v = mean(nums.map(x => (x - m) ** 2));
  return Math.sqrt(v);
}

function cleanDriver(s: string) {
  return s.trim().toLowerCase();
}

function isNullDriver(s?: string | null) {
  if (!s) return true;
  const t = cleanDriver(s);
  return (
    !t ||
    t === "none" ||
    t === "not sure" ||
    t === "unknown" ||
    t === "nothing" ||
    t === "nothing / no clear driver" ||
    t === "no clear driver" ||
    t === "(no driver logged)"
  );
}

function pickTopDriver(nights: RRSMMetricsNight[]): string {
  const counts = new Map<string, number>();
  for (const n of nights) {
    for (const raw of [n.primaryDriver, n.secondaryDriver]) {
      if (isNullDriver(raw)) continue;
      const t = String(raw).trim();
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  let best = "";
  let bestN = 0;
  for (const [k, v] of counts.entries()) {
    if (v > bestN) {
      bestN = v;
      best = k;
    }
  }
  return best || "(no driver logged)";
}

function confidenceFromValidNights(validN: number): "low" | "medium" | "high" {
  if (validN >= 14) return "high";
  if (validN >= 7) return "medium";
  return "low";
}

function riskFromScores(scores: RRSMV2Scores): RRSMV2Risk {
  const worst = Math.min(scores.recovery, scores.onset, scores.fragmentation);
  if (worst < 40 || scores.stability < 35) return "high";
  if (worst < 60 || scores.stability < 55) return "moderate";
  return "low";
}

function primaryIssueFromScores(scores: RRSMV2Scores): RRSMV2Insight["primaryIssue"] {
  const pairs: Array<[RRSMV2Insight["primaryIssue"], number]> = [
    ["recovery", scores.recovery],
    ["onset", scores.onset],
    ["fragmentation", scores.fragmentation],
  ];
  pairs.sort((a, b) => a[1] - b[1]); // ascending (worst first)

  const [worstKey, worstVal] = pairs[0];
  const secondVal = pairs[1][1];

  // If the bottom two are very close, call it mixed (pattern not clean yet)
  if (Math.abs(secondVal - worstVal) <= 7) return "mixed";
  return worstKey;
}

/**
 * Convert raw last-7 metrics into RRSM v2 scores.
 * We prefer simple, explainable transforms:
 * - Recovery score: quality average (scaled to 0-100)
 * - Onset score: latency average (lower is better; 0 min -> 100, 60+ -> 0)
 * - Fragmentation score: wakeups average (lower is better; 0 -> 100, 6+ -> 0)
 * - Stability score: variability penalty across the three measures.
 */
function computeScores(valid: Required<Pick<RRSMMetricsNight, "quality" | "latencyMin" | "wakeUps">>[]): RRSMV2Scores {
  const q = valid.map(n => n.quality ?? 0);
  const l = valid.map(n => n.latencyMin ?? 0);
  const w = valid.map(n => n.wakeUps ?? 0);

  const avgQ = mean(q); // 1-10
  const avgL = mean(l); // minutes
  const avgW = mean(w); // count

  const recovery = clamp((avgQ / 10) * 100);
  const onset = clamp(100 - (avgL / 60) * 100);          // 0 min -> 100, 60 min -> 0
  const fragmentation = clamp(100 - (avgW / 6) * 100);   // 0 -> 100, 6 -> 0

  // Variability penalty: normalize SDs into a 0..1 range, then invert to a 0..100 score
  const sdQn = clamp((stddev(q) / 3) * 100) / 100;    // SD 0..3 roughly
  const sdLn = clamp((stddev(l) / 25) * 100) / 100;   // SD 0..25 min roughly
  const sdWn = clamp((stddev(w) / 2) * 100) / 100;    // SD 0..2 roughly

  const variability = mean([sdQn, sdLn, sdWn]); // 0..1
  const stability = clamp(100 - variability * 100);

  return { recovery, onset, fragmentation, stability };
}

function fmt1(n: number) {
  return Number.isFinite(n) ? n.toFixed(1) : "—";
}

export function runRRSMEngineV2(nights: RRSMMetricsNight[]): RRSMV2Insight {
  // "Valid" nights: require at least one metric; for scoring we need all three,
  // but we’ll keep partial nights for driver counting.
  const withAnyMetric = nights.filter(n =>
    n.quality != null || n.latencyMin != null || n.wakeUps != null
  );

  const validForScoring = withAnyMetric
    .filter(n => n.quality != null && n.latencyMin != null && n.wakeUps != null)
    .map(n => ({ quality: n.quality!, latencyMin: n.latencyMin!, wakeUps: n.wakeUps! }));

  const validN = validForScoring.length;
  const conf = confidenceFromValidNights(validN);

  // If not enough data, return an “early signal” but still be useful.
  if (validN < 3) {
    const topDriver = pickTopDriver(withAnyMetric);
    return {
      title: "RRSM insight (v2 — early signal)",
      risk: "moderate",
      primaryIssue: "mixed",
      topDriver,
      scores: { recovery: 0, onset: 0, fragmentation: 0, stability: 0 },
      why: [
        `Not enough complete nights yet (${validN}/3).`,
        `Log 3 complete nights to unlock baseline scoring.`,
        `Most common driver logged so far: ${topDriver}.`,
      ],
      actions: [
        "Log a complete night (quality, latency, wake-ups).",
        "Keep logging at least 3 nights/week so patterns stabilize.",
      ],
      confidence: conf,
    };
  }

  const scores = computeScores(validForScoring);
  const risk = riskFromScores(scores);
  const primaryIssue = primaryIssueFromScores(scores);
  const topDriver = pickTopDriver(withAnyMetric);

  // Build narrative “why”
  const avgQ = mean(validForScoring.map(n => n.quality));
  const avgL = mean(validForScoring.map(n => n.latencyMin));
  const avgW = mean(validForScoring.map(n => n.wakeUps));

  const why: string[] = [
    `Avg sleep quality (last ${validN} valid nights): ${fmt1(avgQ)}/10.`,
    `Avg sleep latency: ${fmt1(avgL)} mins.`,
    `Avg wake ups: ${fmt1(avgW)}.`,
    `Stability score: ${Math.round(scores.stability)}/100 (variability across nights).`,
  ];

  if (topDriver !== "(no driver logged)") {
    why.push(`Most common driver logged: ${topDriver}.`);
  } else {
    why.push("Most common driver logged: Nothing / no clear driver.");
  }

  // Actions depend on primary issue
  const actions: string[] = [];
  if (primaryIssue === "onset") {
    actions.push("Prioritize sleep-onset support for 3 nights (wind-down, light control, consistent bedtime).");
    actions.push("Aim to reduce latency by 10 minutes; compare to baseline.");
  } else if (primaryIssue === "fragmentation") {
    actions.push("Prioritize fragmentation support for 3 nights (reduce awakenings: temperature, fluids, noise).");
    actions.push("Aim to reduce wake-ups by 1; compare to baseline.");
  } else if (primaryIssue === "recovery") {
    actions.push("Prioritize recovery quality for 3 nights (consistent schedule + morning light + no late heavy meals).");
    actions.push("Aim to raise quality by 1 point; compare to baseline.");
  } else {
    actions.push("Focus on one change for 2–3 nights (pick the strongest suspected driver) and compare.");
  }

  if (topDriver !== "(no driver logged)") {
    actions.push(`Test one targeted change around “${topDriver}” for 2–3 nights and compare.`);
  } else {
    actions.push("Try adding a primary driver tag when you can (even 'Not sure') to improve correlation.");
  }

  actions.push("Keep logging at least 3 nights/week to strengthen the pattern.");
  actions.push("After 14 valid nights, the confidence will upgrade to 'high'.");

  return {
    title: "RRSM insight (v2)",
    risk,
    primaryIssue,
    topDriver,
    scores,
    why,
    actions,
    confidence: conf,
  };
}
