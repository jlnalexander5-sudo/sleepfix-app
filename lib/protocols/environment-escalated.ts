import type { SleepFixProtocol } from "./types";

export const roomCoolingEscalatedProtocol: SleepFixProtocol = {
  id: "room-cooling-escalated",
  title: "Room Cooling Protocol — Deep Version",
  related: "External sleep field — persistent hot room, humidity, stuffiness, or poor airflow",
  bestFor:
    "Use when room heat or humidity continues after the standard room-cooling protocol was followed.",
  focus:
    "Lower room heat load without triggering rebound cold stress or changing the bed setup at the same time.",
  steps: [
    "Pre-cool or ventilate the room before bedtime rather than reacting after wake-ups.",
    "If overheated, use cool water on feet for about 10 minutes. Use cool water, not ice-cold water.",
    "Keep bedding stable so you can tell whether the room change worked.",
    "Record humidity, airflow, fan/AC use, and wake-up timing.",
  ],
  doNot: [
    "Do not use very cold showers or ice-cold baths before bed.",
    "Do not use cold drinks as the main cooling strategy before sleep.",
    "Do not combine strong AC, fan, bedding changes, and sleepwear changes in one night."
  ],
  diaryPrompt:
    "Record the room temperature/heat load, humidity, airflow change, and whether wake-ups reduced.",
  escalationNote:
    "Escalated room-cooling is used only when ambient room heat is the likely remaining problem.",
};

export const roomWarmingEscalatedProtocol: SleepFixProtocol = {
  id: "room-warming-escalated",
  title: "Room Warming Protocol — Deep Version",
  related: "External sleep field — persistent cold room, drafts, cold air movement, or poor insulation",
  bestFor:
    "Use when room cold continues after the standard room-warming protocol was followed.",
  focus:
    "Stabilise ambient warmth without causing bed overheating later.",
  steps: [
    "Block drafts or cold air movement before bedtime.",
    "Warm the room gently before sleep, then keep it stable.",
    "Warm feet gently before bed if cold feet are part of the wake-up pattern.",
    "Keep bedding unchanged unless bed cold is clearly separate from room cold.",
    "Record whether the cold-room signal remained after the room was stabilised."
  ],
  doNot: [
    "Do not pile on multiple blankets as the first solution.",
    "Do not overheat the room.",
    "Do not use a noisy heater if noise becomes the new disruption."
  ],
  diaryPrompt:
    "Record drafts, room warmth, feet temperature, heating method, and whether wake-ups reduced.",
  escalationNote:
    "Escalated room-warming is used only when ambient room cold is the likely remaining problem.",
};

export const bedHeatEscalatedProtocol: SleepFixProtocol = {
  id: "bed-heat-escalated",
  title: "Bed Heat Reduction Protocol — Deep Version",
  related: "Bed thermal field — persistent trapped heat in covers, pillow, sleepwear, mattress, or partner body heat",
  bestFor:
    "Use when bed heat continues after the standard bed-heat protocol was followed.",
  focus:
    "Remove trapped bed heat without cooling the whole room or creating cold rebound.",
  steps: [
    "Keep room temperature unchanged tonight.",
    "Change one bed heat source only: cover layer, pillow material, sleepwear, or partner heat management.",
    "If you wake hot, remove one cover layer and reset the bed without starting a full cooling routine.",
    "Record the exact bed variable changed and whether hot wake-ups reduced.",
  ],
  doNot: [
    "Do not use cold-water room-cooling strategies for a bed-only heat problem.",
    "Do not change room temperature and bedding at the same time.",
    "Do not overcorrect into cold exposure."
  ],
  diaryPrompt:
    "Record which bed heat source was changed and whether the wake-up pattern changed.",
  escalationNote:
    "Escalated bed-heat reduction is used when the heat source is trapped in the bed setup, not the room.",
};

export const bedThermalRetentionEscalatedProtocol: SleepFixProtocol = {
  id: "bed-thermal-retention-escalated",
  title: "Bed Thermal Retention Protocol — Deep Version",
  related: "Bed thermal field — persistent bed cold or unstable warmth",
  bestFor:
    "Use when bed cold continues after the standard bed-retention protocol was followed.",
  focus:
    "Hold stable bed warmth without causing heat build-up later in the night.",
  steps: [
    "Keep the room setting unchanged tonight.",
    "Add or adjust one bed warmth source only: covers, sleepwear, pillow warmth, or foot warmth.",
    "Warm feet gently before bed if feet are repeatedly cold during wake-ups.",
    "Record whether warmth held after the first wake-up.",
  ],
  doNot: [
    "Do not add several heavy layers at once.",
    "Do not use high electric-blanket heat as the main correction.",
    "Do not turn a bed-cold issue into a bed-heat issue."
  ],
  diaryPrompt:
    "Record the bed warmth variable changed and whether cold wake-ups reduced.",
  escalationNote:
    "Escalated bed-thermal-retention is used when the cold source is the bed setup, not the room.",
};

export const environmentEscalatedProtocol: SleepFixProtocol = {
  id: "sleep-environment-reset-deep",
  title: "Sleep Environment Reset Protocol — Deep Version",
  related: "External sleep field — mixed or unclear environmental disruption",
  bestFor:
    "Use only when an environment problem continues but SleepFix cannot yet separate room heat, room cold, bed heat, bed cold, light, noise, humidity, or airflow.",
  focus:
    "Escalate carefully by testing one environmental variable at a time without mixing hot and cold corrections.",
  steps: [
    "Choose one suspected disruptor only.",
    "Apply the matching correction for that disruptor before bedtime.",
    "Keep all other room and bed variables stable.",
    "If the issue continues, record the exact condition and exact change made.",
  ],
  doNot: [
    "Do not use cooling and warming corrections on the same night.",
    "Do not change room temperature and bedding at the same time unless safety requires it.",
    "Do not escalate from unclear data; get one cleaner night first."
  ],
  diaryPrompt:
    "Record the suspected disruptor, the single change made, and whether wake-ups reduced.",
  escalationNote:
    "This deep version is for unclear or mixed environment patterns. Specific hot/cold/bed/room protocols should be used when the source is known.",
};
