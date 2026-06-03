export type { SleepFixProtocol } from "./types";

export { mindStandardProtocol } from "./mind-standard";
export { mindEscalatedProtocol } from "./mind-escalated";

export { bodyStandardProtocol } from "./body-standard";
export { bodyEscalatedProtocol } from "./body-escalated";

export { bodyDownshiftStandardProtocol } from "./body-downshift-standard";
export { bodyDownshiftEscalatedProtocol } from "./body-downshift-escalated";

export { environmentStandardProtocol } from "./environment-standard";
export { environmentEscalatedProtocol } from "./environment-escalated";

export { hygieneStandardProtocol } from "./hygiene-standard";
export { hygieneEscalatedProtocol } from "./hygiene-escalated";

export { rhythmSupportProtocol } from "./rhythm-support";
export { noProtocolNeeded } from "./no-protocol-needed";

import { mindStandardProtocol } from "./mind-standard";
import { mindEscalatedProtocol } from "./mind-escalated";
import { bodyStandardProtocol } from "./body-standard";
import { bodyEscalatedProtocol } from "./body-escalated";
import { bodyDownshiftStandardProtocol } from "./body-downshift-standard";
import { bodyDownshiftEscalatedProtocol } from "./body-downshift-escalated";
import { environmentStandardProtocol } from "./environment-standard";
import { environmentEscalatedProtocol } from "./environment-escalated";
import { hygieneStandardProtocol } from "./hygiene-standard";
import { hygieneEscalatedProtocol } from "./hygiene-escalated";
import { rhythmSupportProtocol } from "./rhythm-support";
import { noProtocolNeeded } from "./no-protocol-needed";

export function getStandardProtocolByTitle(title: string) {
  const lower = title.toLowerCase();

  if (lower.includes("quieting")) return mindStandardProtocol;
  if (lower.includes("body recovery")) return bodyStandardProtocol;
  if (lower.includes("body downshift")) return bodyDownshiftStandardProtocol;
  if (lower.includes("environment")) return environmentStandardProtocol;
  if (lower.includes("shutdown")) return hygieneStandardProtocol;
  if (lower.includes("rhythm")) return rhythmSupportProtocol;
  if (lower.includes("no protocol")) return noProtocolNeeded;
  if (lower.includes("good recovery")) return noProtocolNeeded;
  if (lower.includes("keep current setup stable")) return noProtocolNeeded;

  return noProtocolNeeded;
}

export function getEscalatedProtocolForTitle(title: string) {
  const lower = title.toLowerCase();

  if (lower.includes("quieting")) return mindEscalatedProtocol;
  if (lower.includes("body recovery")) return bodyEscalatedProtocol;
  if (lower.includes("body downshift")) return bodyDownshiftEscalatedProtocol;
  if (lower.includes("environment")) return environmentEscalatedProtocol;
  if (lower.includes("shutdown")) return hygieneEscalatedProtocol;
  if (lower.includes("rhythm")) return rhythmSupportProtocol;
  if (lower.includes("no protocol")) return noProtocolNeeded;
  if (lower.includes("good recovery")) return noProtocolNeeded;
  if (lower.includes("keep current setup stable")) return noProtocolNeeded;

  return noProtocolNeeded;
}
