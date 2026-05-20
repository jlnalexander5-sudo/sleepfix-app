import type { SleepFixProtocol } from "./types";

export const hygieneEscalatedProtocol: SleepFixProtocol = {
  id: "rrsm-shutdown-ritual-deep",
  title: "RRSM Shutdown Ritual — Deep Version",
  related: "Personal sleep hygiene — escalated behaviour and shutdown timing",
  bestFor:
    "Use when caffeine, nicotine, alcohol, screens, late food, late exercise, or stimulation still appears to disrupt sleep after the standard shutdown ritual was followed.",
  focus:
    "Identify the timing threshold where a habit stops being harmless and starts disturbing sleep.",
  steps: [
    "Record the exact time the suspected factor stopped before bedtime.",
    "Record what the factor was: caffeine, tea, nicotine, alcohol, screen time, late food, late exercise, or another stimulant.",
    "Next time, move that factor earlier or replace it with a lower-stimulation alternative.",
    "Change only one factor at a time so the diary can show what actually made the difference.",
    "If the same issue continues, look for a second factor that may be combining with it.",
  ],
  doNot: [
    "Do not try to fix every habit at once.",
    "Do not frame this as failure. Treat it as finding your personal timing threshold.",
  ],
  diaryPrompt:
    "Write the time, substance/activity, bedtime, and result. This will show what timing works or does not work for you personally.",
  escalationNote:
    "This is the deeper version used when the standard shutdown ritual was followed but sleep did not improve.",
};
