// lib/rrsm/protocols.ts
// Central registry for RRSM protocols shown in the UI.
// Keep this file small + readable; you can expand it from your PDF later.

export type RRSMProtocol = {
  id: string;               // stable key (used for analytics later)
  name: string;             // what the user sees
  family: "Recovery" | "Pre-Sleep Discharge" | "Stabilization" | "Optimization";
  oneLine: string;          // short promise / intent
  steps: string[];          // what to do tonight
  avoid?: string[];         // optional: what to avoid tonight
  notes?: string[];         // optional: extra context
};

const PROTOCOLS: RRSMProtocol[] = [
  {
    id: "rb2-deceleration",
    name: "RB2 Deceleration",
    family: "Pre-Sleep Discharge",
    oneLine: "Slow the nervous system down so sleep starts faster.",
    steps: [
      "Dim lights 60–90 min before bed.",
      "Screens off or on lowest brightness + warm mode in the last 45 min.",
      "10–15 min slow breathing (longer exhales).",
      "Warm shower or wash face/hands with warm water.",
      "In bed: keep it boring—no problem-solving or planning."
    ],
    avoid: ["Late caffeine", "Late intense exercise", "Heavy meals close to bed"],
  },
  {
    id: "sleep-continuity-reset",
    name: "Sleep Continuity Reset",
    family: "Stabilization",
    oneLine: "Reduce wake-ups and make the night more continuous.",
    steps: [
      "Keep the room cool and dark (reduce noise/light disturbances).",
      "If you wake up: avoid checking the time; keep lights low.",
      "Use a short, repeatable reset cue (slow breathing / body scan).",
      "If awake > 20–30 min: get up briefly, dim light, calm activity, then return to bed."
    ],
    avoid: ["Alcohol close to bed", "Overheating the room", "Scrolling during wake-ups"],
  },
  {
    id: "low-stimulation-recovery",
    name: "Low-Stimulation Recovery Night",
    family: "Recovery",
    oneLine: "Protect sleep quality by reducing stimulation and load.",
    steps: [
      "Tonight is a low-demand night: keep evening plans simple.",
      "Early dinner; keep it lighter than usual.",
      "Wind-down routine (same order, same timing).",
      "Gentle stretch or short walk—no intensity.",
      "Earlier bedtime if sleepy (don’t fight it)."
    ],
    avoid: ["Late work bursts", "Arguments / stressful content", "Big routine changes"],
  },
  {
    id: "maintain-routine",
    name: "Maintain Routine",
    family: "Optimization",
    oneLine: "Repeat what’s working and aim for consistency.",
    steps: [
      "Keep bedtime/wake time consistent.",
      "Repeat the same wind-down routine.",
      "Keep the room environment stable."
    ],
  }
];

export function getProtocolByName(name?: string | null): RRSMProtocol | null {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  return (
    PROTOCOLS.find(p => p.name.toLowerCase() === needle) ??
    PROTOCOLS.find(p => p.id === needle.replace(/\s+/g, "-")) ??
    null
  );
}

export function listProtocols(): RRSMProtocol[] {
  return PROTOCOLS.slice();
}
