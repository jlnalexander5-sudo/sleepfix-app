import type { SleepFixProtocol } from "./types";

export const mindEscalatedProtocol: SleepFixProtocol = {
  id: "rrsm-zero-zone",
  title: "RRSM Zero Zone Protocol",
  related: "RB2 / RB3 — escalated mind and emotional activation",
  bestFor:
    "Use when racing thoughts, emotional turbulence, or high excitement continue even after the standard quieting protocol was followed.",
  focus:
    "Move attention away from external noise and internal thought loops until the system reaches a neutral transition state.",
  steps: [
    "Take one slow breath and settle your posture.",
    "Focus on breathing in. Then focus on breathing out. Keep attention only on the breath cycle.",
    "Continue for at least 5 minutes. If thoughts appear, do not follow them. Restart with the next breath.",
    "Let external noises become irrelevant. You do not need to fight them; simply do not engage them.",
    "After several minutes, soften the focus on breathing itself. Do not chase thoughts and do not force sleep.",
    "Allow yourself to rest in the neutral zone between external attention and internal thinking.",
    "If sleep still does not come, another factor may be keeping the system active.",
  ],
  doNot: [
    "Do not try to force the mind blank.",
    "Do not analyse whether it is working while doing it.",
    "Do not restart phone use or problem-solving after beginning this protocol.",
  ],
  diaryPrompt:
    "If this does not work, write what thoughts, emotions, body sensations, room factors, or habits were still active that night.",
  escalationNote:
    "This is the deeper version used when the standard RRSM Quieting Protocol was followed but sleep did not improve.",
};
