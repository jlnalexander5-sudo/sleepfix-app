import type { SleepFixProtocol } from "./types";

export const bodyEscalatedProtocol: SleepFixProtocol = {
  id: "rrsm-body-recovery-deep",
  title: "RRSM Body Recovery Protocol — Deep Version",
  related: "RB1 — escalated body physiology, DOMS, inflammation, pain, tension",
  bestFor:
    "Use when body discomfort, DOMS, inflammation, pain, or tension continues after the standard body protocol was followed.",
  focus:
    "Use gentle region-specific movement to discharge body activation without overstimulating the system.",
  steps: [
    "If the issue is in shoulders, arms, or hands: gently shake one arm for about 20 seconds, then the other arm for about 20 seconds.",
    "The shake should travel from the hand up toward the shoulder, like shaking off discomfort, but keep it controlled.",
    "If the area is sore or inflamed, move slowly and carefully. Do not use abrupt movement.",
    "Repeat 2–3 gentle sets if it feels settling.",
    "If the issue is in legs, calves, or feet: gently shake one foot/leg up toward the thigh for about 20 seconds, then repeat on the other side.",
    "If the issue is in the neck or head: sit down and do very slow clockwise and anticlockwise neck rotations. Stop if dizzy or uncomfortable.",
    "A warm shower or warm bath may support the process. Water should be warm, not hot and not cold.",
    "If this does not work, another global system factor may be active beyond the local body area.",
  ],
  doNot: [
    "Do not use fast or forceful movement on inflamed or painful areas.",
    "Do not do neck movement while standing.",
    "Do not use this protocol for severe, new, worsening, or unexplained pain without appropriate medical advice.",
  ],
  diaryPrompt:
    "Record what area was affected, what movement you used, whether it helped, and whether another factor was present. Try one thing at a time so you know what made the difference.",
  escalationNote:
    "This is the deeper version used when the standard body protocol was followed but sleep did not improve.",
};
