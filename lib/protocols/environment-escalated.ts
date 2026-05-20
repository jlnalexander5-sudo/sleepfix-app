import type { SleepFixProtocol } from "./types";

export const environmentEscalatedProtocol: SleepFixProtocol = {
  id: "sleep-environment-reset-deep",
  title: "Sleep Environment Reset Protocol — Deep Version",
  related: "External sleep field — escalated heat, humidity, cold, or room disruption",
  bestFor:
    "Use when room temperature, humidity, cold, or environmental disturbance continues after the standard environment protocol was followed.",
  focus:
    "Adjust the strongest environmental disruptor without creating a rebound effect that wakes the body later.",
  steps: [
    "For hot or humid nights: soak your feet in cool water for about 10 minutes. Use cool water, not cold water.",
    "For cold or freezing nights: warm the feet gently before bed.",
    "Use polyester socks if helpful. Avoid overheating the feet.",
    "Keep the rest of the room setup stable so you can tell whether the change worked.",
    "If the same issue continues, record the room condition and what you changed in the diary.",
  ],
  doNot: [
    "Do not use very cold showers or very cold baths for overheated nights.",
    "Do not use cold drinks as the main cooling strategy before bed.",
    "Do not use hot water bottles or electric blankets directly on the feet if they cause overheating later.",
  ],
  diaryPrompt:
    "Record room temperature, humidity, bedding, noise, light, and the exact change you made so you can identify the real factor.",
  escalationNote:
    "This is the deeper version used when the standard environment protocol was followed but sleep did not improve.",
};
