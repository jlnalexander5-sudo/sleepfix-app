import type { SleepFixProtocol } from "./types";

export const hygieneStandardProtocol: SleepFixProtocol = {
  id: "rrsm-shutdown-ritual",
  title: "RRSM Shutdown Ritual",
  related: "Personal sleep hygiene — behaviour and shutdown timing",
  bestFor:
    "Best for: late caffeine, nicotine, alcohol, screens, late food, late exercise, or stimulation too close to bed.",
  focus:
    "Create a repeatable shutdown window so the body is not asked to sleep while still activated.",
  steps: [
    "Choose one target tonight, not five. Pick the most obvious disruptor from your sleep form.",
    "Create a 60-minute shutdown window before bed: dim light, reduce scrolling, reduce food/fluid load, and avoid stimulating tasks.",
    "Replace the habit with a low-effort alternative: shower, quiet reading, gentle breathing, or preparing tomorrow’s tasks.",
    "If you slip, do not reset the whole plan. Just restart the shutdown window the next night.",
  ],
  doNot: [
    "Do not treat this as punishment. It is a test to see whether your sleep stabilises.",
    "Do not change everything at once. One consistent change gives cleaner feedback.",
  ],
};
