import type { SleepFixProtocol } from "./types";

export const rhythmSupportProtocol: SleepFixProtocol = {
  id: "rrsm-rhythm-support",
  title: "RRSM Rhythm Support Protocol",
  related: "Context limitation — shift work, jet lag, irregular schedule, pregnancy, chronic illness",
  bestFor:
    "Best for: timing constraints that the app cannot fully control, such as shift work, jet lag, irregular work hours, pregnancy, or chronic illness.",
  focus:
    "Improve transition quality and recovery stability while recognising real physiological limits.",
  steps: [
    "Anchor the most stable part of the day: wake time, first light exposure, first meal, or pre-sleep routine.",
    "Protect a short shutdown window even if bedtime changes.",
    "Keep hydration steady during the day.",
    "Keep eating and activity windows as regular as possible.",
    "Aim for improvement, not perfection. The goal is less disruption, not miracle sleep under impossible conditions.",
    "Use the diary to record schedule constraints so SleepFix does not misread them as simple behaviour problems.",
  ],
  doNot: [
    "Do not fast aggressively if your system is already unstable.",
    "Do not add intense late exercise when rhythm disruption is already present.",
    "Do not add vitamins, minerals, electrolytes, aspirin, or supplements at night unless advised by a qualified clinician.",
  ],
  diaryPrompt:
    "Record the day routine, eating window, activity timing, travel/shift constraints, and what made sleep easier or harder.",
};
