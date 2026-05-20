import type { SleepFixProtocol } from "./types";

export const environmentStandardProtocol: SleepFixProtocol = {
  id: "sleep-environment-reset",
  title: "Sleep Environment Reset Protocol",
  related: "External sleep field — room and environmental interference",
  bestFor:
    "Best for: heat, cold, humidity, light, noise, mosquitoes, bedding discomfort, or repeated room disturbance.",
  focus: "Remove obvious external interference before trying deeper protocols.",
  steps: [
    "Fix the strongest room problem first: temperature, noise, light, bedding, or insects.",
    "Prepare the room before bedtime, not after you are already frustrated or awake.",
    "Keep one stable setup for 2–3 nights so the app can compare the result.",
    "If the environment cannot be fixed, use the diary to record exactly what disturbed the night.",
  ],
  doNot: [
    "Do not keep changing several room variables at once if you are trying to learn what helps.",
  ],
};
