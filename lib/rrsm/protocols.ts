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
    id: "good-recovery-stability",
    name: "Good recovery — keep current setup stable tonight.",
    family: "Optimization",
    oneLine: "No corrective protocol. Protect the conditions that worked.",
    steps: [
      "Repeat the same sleep setup tonight.",
      "Avoid introducing new bedding, room, supplement, or schedule changes unless necessary.",
      "Keep the room and bed conditions stable so SleepFix can confirm the pattern.",
      "Log the next night normally so the app can detect whether recovery stays stable."
    ],
    avoid: [
      "Do not start a corrective protocol just because one is available.",
      "Do not change several variables after a good night.",
      "Do not overcorrect temperature, bedding, or routine when recovery is already good."
    ],
    notes: [
      "This is stability reinforcement mode: preserve the current setup rather than intervening."
    ],
  },

  {
    id: "bed-heat-reduction",
    name: "Bed Heat Reduction Protocol",
    family: "Stabilization",
    oneLine: "Reduce heat trapped in bedding without cooling the whole body or room.",
    steps: [
      "Keep the room stable. Do not use cold-water cooling if the room itself is cold.",
      "Remove or thin only one bedding layer tonight.",
      "Check pillow heat: use a cooler pillowcase/material or swap pillow if it retains heat.",
      "Avoid wrapping the feet/body too tightly if heat builds during the night.",
      "If you wake hot: remove one cover layer, reset the bedding, then return to bed."
    ],
    avoid: [
      "Do not cool the whole body if the room is cold.",
      "Do not change room temperature, pillow, covers, and sleepwear all at once.",
      "Do not add heavy blankets just because the room feels cold if the bed itself overheats."
    ],
  },
  {
    id: "bed-thermal-retention",
    name: "Bed Thermal Retention Protocol",
    family: "Stabilization",
    oneLine: "Hold stable warmth in the bed without overheating later.",
    steps: [
      "Add warmth through one stable layer, not several random layers.",
      "Warm feet gently before bed if they are cold.",
      "Use breathable bedding that holds warmth without trapping excessive heat.",
      "Check whether the mattress or pillow feels cold and adjust only that part if needed.",
      "If you wake cold: add one targeted layer and keep the rest of the setup unchanged."
    ],
    avoid: [
      "Do not overcorrect with too many blankets.",
      "Do not use high electric-blanket heat as the main solution.",
      "Do not change several thermal variables at once."
    ],
  },
  {
    id: "room-cooling",
    name: "Room Cooling Protocol",
    family: "Stabilization",
    oneLine: "Reduce hot-room or humid-room disruption without overcooling the body.",
    steps: [
      "Improve airflow before bed if the room is hot or stuffy.",
      "Reduce humidity or heat build-up in the room where possible.",
      "Use light breathable bedding so room heat does not compound with bed heat.",
      "Cool the room gradually rather than shocking the body with cold.",
      "Keep the same bedding setup so you can test whether the room change worked."
    ],
    avoid: [
      "Do not use very cold showers or ice-cold cooling as the first move.",
      "Do not combine strong AC, fan, bedding changes, and clothing changes in one night.",
      "Do not confuse hot bedding with hot room temperature."
    ],
  },
  {
    id: "room-warming",
    name: "Room Warming Protocol",
    family: "Stabilization",
    oneLine: "Reduce cold-room disruption without creating heavy bedding heat later.",
    steps: [
      "Reduce drafts and cold air movement before bed.",
      "Warm the room slightly before sleep if possible, then keep it stable.",
      "Use one targeted warmth layer rather than piling on multiple blankets.",
      "Warm feet gently before bed if cold feet are part of the wake-up pattern.",
      "Keep bedding breathable so room warming does not create bed overheating later."
    ],
    avoid: [
      "Do not overheat the room.",
      "Do not add several blanket layers at once.",
      "Do not use noisy heating if the noise itself wakes you."
    ],
  },

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
    oneLine: "Repeat what’s working and avoid unnecessary corrections.",
    steps: [
      "Keep bedtime/wake time consistent.",
      "Repeat the same wind-down routine.",
      "Keep the room and bed environment stable.",
      "Do not add a corrective protocol unless the next night shows a real issue."
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
