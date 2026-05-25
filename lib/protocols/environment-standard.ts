import type { SleepFixProtocol } from "./types";

export const roomCoolingStandardProtocol: SleepFixProtocol = {
  id: "room-cooling-standard",
  title: "Room Cooling Protocol",
  related: "External sleep field — hot room, humidity, poor airflow, or heat build-up",
  bestFor:
    "Use when the room itself felt too hot, humid, stuffy, or poorly ventilated and this disrupted sleep.",
  focus:
    "Reduce ambient room heat without overcooling the body or changing several sleep variables at once.",
  steps: [
    "Improve airflow before bed if the room is hot or stuffy.",
    "Reduce humidity or heat build-up where possible.",
    "Keep bedding and sleepwear unchanged tonight unless they are clearly part of the heat problem.",
    "Cool the room gradually rather than shocking the body with cold.",
    "Record whether the room cooled and whether wake-ups reduced."
  ],
  doNot: [
    "Do not use ice-cold showers or extreme cooling as the first move.",
    "Do not change AC, fan, bedding, pillow, and clothing all in one night.",
    "Do not confuse hot bedding with hot room temperature."
  ],
};

export const roomWarmingStandardProtocol: SleepFixProtocol = {
  id: "room-warming-standard",
  title: "Room Warming Protocol",
  related: "External sleep field — cold room, drafts, cold air movement, or poor insulation",
  bestFor:
    "Use when the room itself felt too cold or drafty and this disrupted sleep.",
  focus:
    "Stabilise ambient warmth without creating bed heat later in the night.",
  steps: [
    "Reduce drafts and cold air movement before bed.",
    "Warm the room slightly before sleep if possible, then keep it stable.",
    "Warm feet gently before bed if cold feet are part of the pattern.",
    "Use one targeted warmth layer only if needed.",
    "Record whether warmth stayed stable through the night."
  ],
  doNot: [
    "Do not pile on several blankets at once.",
    "Do not overheat the room.",
    "Do not use noisy heating if the heater noise wakes you."
  ],
};

export const bedHeatStandardProtocol: SleepFixProtocol = {
  id: "bed-heat-standard",
  title: "Bed Heat Reduction Protocol",
  related: "Bed thermal field — heat trapped in covers, pillow, mattress, sleepwear, or partner body heat",
  bestFor:
    "Use when the bed setup felt hot even if the room itself was not hot.",
  focus:
    "Reduce trapped bed heat without cooling the whole room or body.",
  steps: [
    "Keep the room stable tonight.",
    "Remove or thin only one bedding layer.",
    "Check pillow heat and swap only the pillow or pillowcase if that is the heat source.",
    "Use lighter sleepwear if sleepwear was the heat source.",
    "Record which bed variable changed and whether wake-ups reduced."
  ],
  doNot: [
    "Do not cool the whole body if the room is already cold.",
    "Do not change room temperature, covers, pillow, and sleepwear all at once.",
    "Do not add heavy blankets just because the room feels cold if the bed itself overheats."
  ],
};

export const bedThermalRetentionStandardProtocol: SleepFixProtocol = {
  id: "bed-thermal-retention-standard",
  title: "Bed Thermal Retention Protocol",
  related: "Bed thermal field — unstable warmth from bedding, sleepwear, pillow, or covers",
  bestFor:
    "Use when the bed setup felt cold or failed to hold warmth through the night.",
  focus:
    "Hold stable warmth in the bed without overheating later.",
  steps: [
    "Add warmth through one stable layer, not several random layers.",
    "Warm feet gently before bed if they are cold.",
    "Check whether pillow, sleepwear, or cover level is the cold source.",
    "Keep the room setting unchanged so the bed change can be read clearly.",
    "Record whether warmth stayed stable after wake-ups."
  ],
  doNot: [
    "Do not overcorrect with too many blankets.",
    "Do not use high electric-blanket heat as the main solution.",
    "Do not change several thermal variables at once."
  ],
};

export const environmentStandardProtocol: SleepFixProtocol = {
  id: "sleep-environment-reset",
  title: "Sleep Environment Reset Protocol",
  related: "External sleep field — mixed or unclear room/environment interference",
  bestFor:
    "Use only when the environment signal is real but SleepFix cannot yet separate room heat, room cold, bed heat, bed cold, noise, light, humidity, or airflow.",
  focus:
    "Change one clear external disruptor only, then keep the rest stable so SleepFix can identify the real factor.",
  steps: [
    "Pick the strongest single disruptor: temperature, noise, light, humidity, airflow, bedding, or insects.",
    "Fix that one disruptor before bedtime.",
    "Keep all other room and bed variables unchanged tonight.",
    "Use the diary to record exactly what changed and whether wake-ups reduced.",
  ],
  doNot: [
    "Do not change several room or bed variables at once.",
    "Do not use cooling advice for a cold-room problem.",
    "Do not use warming advice for a hot-room problem."
  ],
};
