// lib/rrsm/engine.ts

export type RRSMConfidence = "low" | "medium" | "high";

export type RRSMInputs = {
  sleepQuality?: number; // 1-10
  latencyBand?: "low" | "medium" | "high"; // or your exact enum
  wakeBand?: "low" | "medium" | "high";
  mindTags?: string[];
  envTags?: string[];
  bodyTags?: string[];
  affectedTonight?: string[]; // e.g. "late caffeine", "late meal", "screens", "hot room"
  notes?: string; // only used if tag-linked
  validNightsLast7?: number; // for confidence
};

export type RRSMInsight = {
  primaryDriver: string;
  why: string[];
  actions: string[];
  avoid: string[];
  protocolFamily: string;
  protocolName: string;
  confidence: RRSMConfidence;
  confidenceExplain: string;
};

function norm(arr?: string[]) {
  return (arr ?? []).map(s => s.trim().toLowerCase()).filter(Boolean);
}

function notesLooksTagRelated(notes?: string) {
  if (!notes) return false;
  const n = notes.toLowerCase();
  const keywords = [
    "caffeine","coffee","alcohol","late meal","heavy meal","screens","phone","scroll",
    "hot","heat","cold","noise","bright","stress","anx","anxiety","rumination","wired",
    "exercise","nap","travel"
  ];
  return keywords.some(k => n.includes(k));
}

function computeConfidence(validNightsLast7?: number): { c: RRSMConfidence; explain: string } {
  const n = validNightsLast7 ?? 0;
  if (n >= 6) return { c: "high", explain: "high — consistent pattern across nights" };
  if (n >= 3) return { c: "medium", explain: "medium — enough data for a basic pattern" };
  return { c: "low", explain: "low — too little data; treat this as a rough guess" };
}

function hasAny(tags: string[], needles: string[]) {
  return needles.some(x => tags.includes(x));
}

export function buildRRSMInsight(input: RRSMInputs): RRSMInsight {
  const mind = norm(input.mindTags);
  const env = norm(input.envTags);
  const body = norm(input.bodyTags);
  const affected = norm(input.affectedTonight);

  const allTags = [...mind, ...env, ...body, ...affected];

  const tagNoteOK = notesLooksTagRelated(input.notes);
  const noteBit = tagNoteOK ? ` Note: ${input.notes!.trim()}` : "";

  const { c, explain } = computeConfidence(input.validNightsLast7);

  const q = input.sleepQuality ?? 0;
  const latencyBad = input.latencyBand === "high";
  const wakesBad = input.wakeBand === "high";

  // --- Priority 1: Sleep quality ---
  if (q > 0 && q <= 5) {
    const amplifiers: string[] = [];
    if (hasAny(allTags, ["hot", "heat", "overheating", "hot room"])) amplifiers.push("Heat / overheating can keep arousal high.");
    if (hasAny(allTags, ["screens", "phone", "scrolling"])) amplifiers.push("Screens/fast visual input can keep the nervous system “up”.");
    if (hasAny(allTags, ["caffeine", "coffee"])) amplifiers.push("Late caffeine can raise arousal and fragment sleep.");
    if (hasAny(allTags, ["alcohol"])) amplifiers.push("Alcohol often worsens sleep depth and wake-ups.");

    return {
      primaryDriver: "Sleep quality is the main issue tonight.",
      why: [
        `Reported sleep quality is low (${q}/10).`,
        ...amplifiers,
        noteBit ? noteBit.trim() : ""
      ].filter(Boolean),
      actions: [
        "Keep tonight simple: repeat what worked before and aim for consistency.",
        "Do a short outbound discharge (e.g., 20–40 min steady walk).",
        "Do long-exhale breathing (no breath holds).",
        "Reduce contrast (dim lights, low stimulation) for the last hour."
      ],
      avoid: [
        "Avoid heavy food late, intense thinking, and late novelty.",
        "Avoid screens/fast scrolling close to bed."
      ],
      protocolFamily: "Sleep Quality Stabilization",
      protocolName: "Outbound discharge + low-stimulus wind-down",
      confidence: c,
      confidenceExplain: explain
    };
  }

  // --- Priority 2: Latency ---
  if (latencyBad) {
    return {
      primaryDriver: "Falling asleep is the main issue (high latency).",
      why: [
        "This usually looks like a wired/overstimulated pattern (RB2 overload).",
        hasAny(allTags, ["hot","heat","overheating"]) ? "Heat can compress pause reserve and keep arousal high." : "",
        hasAny(allTags, ["screens","phone","scrolling"]) ? "Screens/fast visual input can keep the system activated." : "",
        noteBit ? noteBit.trim() : ""
      ].filter(Boolean),
      actions: [
        "RB2 Deceleration: remove stimulation + use a steady breathing pattern (4 in / 2 pause / 6 out / 2 pause for ~12–15 cycles).",
        "If you feel ‘hot core / active mind’: shift awareness to soles/palms/elbows (spread the rhythm load).",
        "Once sleepy: don’t re-engage thought — return to breath if clarity spikes."
      ],
      avoid: [
        "No scrolling, no complex thought, no narrative replay right before bed.",
        "Avoid stimulants too close to sleep."
      ],
      protocolFamily: "RB2 Regulation",
      protocolName: "RB2 Deceleration + Sleep Entry Lock",
      confidence: c,
      confidenceExplain: explain
    };
  }

  // --- Priority 3: Wake-ups / fragmentation ---
  if (wakesBad) {
    return {
      primaryDriver: "Frequent wake-ups are the main issue (fragmented sleep).",
      why: [
        "This often matches an ‘early waking/light sleep’ pattern (RB3 narrative looping).",
        hasAny(allTags, ["stress","rumination","planning"]) ? "Stress/rumination can keep narrative loops running at night." : "",
        noteBit ? noteBit.trim() : ""
      ].filter(Boolean),
      actions: [
        "Do some external discharge before bed (movement).",
        "Write a ‘tomorrow list’ in the early evening (get planning out of your head).",
        "Use extended-exhale breathing to slow the loop.",
        "Keep the pre-sleep routine low-novelty and repetitive."
      ],
      avoid: [
        "Avoid planning and inward focus right before sleep.",
        "Avoid late novelty/stimulation."
      ],
      protocolFamily: "Sleep Continuity",
      protocolName: "RB3 Loop Break",
      confidence: c,
      confidenceExplain: explain
    };
  }

  // --- Priority 4: If core metrics are fine, optimize tags ---
  const improvements: string[] = [];
  if (hasAny(allTags, ["caffeine","coffee"])) improvements.push("Try moving caffeine earlier (or reduce dose) to protect sleep depth.");
  if (hasAny(allTags, ["late meal","heavy meal"])) improvements.push("Keep dinner lighter or earlier to reduce sleep disruption.");
  if (hasAny(allTags, ["screens","phone","scrolling"])) improvements.push("Reduce screens in the last hour; switch to low-stimulus input.");
  if (hasAny(allTags, ["hot","heat","overheating"])) improvements.push("Aim for cool-neutral (stable, not cold) bedroom conditions.");

  return {
    primaryDriver: "Core sleep metrics look OK — focus on small optimisations.",
    why: [
      "Sleep quality/latency/wake-ups are not showing a major issue tonight.",
      improvements.length ? "Your tags suggest a few easy levers to improve consistency." : "",
      noteBit ? noteBit.trim() : ""
    ].filter(Boolean),
    actions: [
      "Repeat what worked and keep timing consistent.",
      ...(improvements.length ? improvements : ["Pick one small lever and run it for 3 nights before changing anything."])
    ],
    avoid: [
      "Avoid changing multiple variables at once (it hides the real driver)."
    ],
    protocolFamily: "Optimization",
    protocolName: "One-lever improvement",
    confidence: c,
    confidenceExplain: explain
  };
}
