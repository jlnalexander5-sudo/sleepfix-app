export type SleepFixProtocolCategory =
  | "mind"
  | "body"
  | "environment"
  | "hygiene"
  | "rhythm";

export type SleepFixProtocolLevel = "standard" | "escalated";

export type SleepFixProtocol = {
  id: string;
  title: string;
  category: SleepFixProtocolCategory;
  level: SleepFixProtocolLevel;
  related: string;
  bestFor: string;
  focus: string;
  steps: string[];
  doNot?: string[];
  diaryPrompt?: string;
  escalationNote?: string;
};
