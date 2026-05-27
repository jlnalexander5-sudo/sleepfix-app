// lib/rrsm/adaptive-reminder.ts
// SleepFix adaptive reminder helper — deterministic v2.
// Purpose: infer the user's usual sleep-log time from sleep_nights.created_at
// using the user's own IANA timezone, then trigger only when today's sleep entry is missing.
//
// Critical rule:
// If a user usually logs around 10:00am, do NOT remind them hours later.
// Reminder becomes due shortly after their normal logging window closes.

export type ReminderNight = {
  created_at: string | null;
  local_date?: string | null;
};

export type AdaptiveReminderState = {
  shouldShow: boolean;
  title: string;
  message: string;
  expectedWindowLabel: string | null;
  confidence: "low" | "medium" | "high";
  sampleSize: number;
  expectedStartMin: number | null;
  expectedEndMin: number | null;
  reminderDueMin: number | null;
  minutesLate: number | null;
  timezone: string;
  todayYMD: string;
  loggedToday: boolean;
};

const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_DUE_MIN = 10 * 60;
const GRACE_MIN = 15;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isValidTimeZone(timezone: string | null | undefined) {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function safeTimeZone(timezone?: string | null) {
  return isValidTimeZone(timezone) ? String(timezone) : DEFAULT_TIMEZONE;
}

function partsInTimeZone(date: Date, timezone?: string | null) {
  const tz = safeTimeZone(timezone);
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";

  let hour = Number(get("hour"));
  // Some engines can represent midnight as 24:00.
  if (hour === 24) hour = 0;

  return {
    timezone: tz,
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
  };
}

export function toLocalYMD(date: Date, timezone?: string | null) {
  const p = partsInTimeZone(date, timezone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function minutesSinceMidnightInTimeZone(date: Date, timezone?: string | null) {
  const p = partsInTimeZone(date, timezone);
  return p.hour * 60 + p.minute;
}

function formatTime(mins: number) {
  const clamped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(m)}${suffix}`;
}

function hasEntryForToday(nights: ReminderNight[], todayYMD: string, timezone?: string | null) {
  return nights.some((night) => {
    const local = String(night.local_date ?? "").slice(0, 10);
    if (local === todayYMD) return true;

    if (!night.created_at) return false;
    const created = new Date(night.created_at);
    if (!Number.isFinite(created.getTime())) return false;
    return toLocalYMD(created, timezone) === todayYMD;
  });
}

function circularMeanMinutes(values: number[]) {
  if (!values.length) return null;

  let sin = 0;
  let cos = 0;

  for (const value of values) {
    const angle = (value / 1440) * Math.PI * 2;
    sin += Math.sin(angle);
    cos += Math.cos(angle);
  }

  const angle = Math.atan2(sin / values.length, cos / values.length);
  const normalized = angle < 0 ? angle + Math.PI * 2 : angle;
  return (normalized / (Math.PI * 2)) * 1440;
}

function circularDistanceMinutes(a: number, b: number) {
  const diff = Math.abs(a - b) % 1440;
  return Math.min(diff, 1440 - diff);
}

export function buildAdaptiveReminderState(
  nights: ReminderNight[],
  now: Date = new Date(),
  timezone: string = DEFAULT_TIMEZONE,
): AdaptiveReminderState {
  const tz = safeTimeZone(timezone);
  const todayYMD = toLocalYMD(now, tz);
  const nowMin = minutesSinceMidnightInTimeZone(now, tz);

  const validCreatedTimes = nights
    .map((night) => (night.created_at ? new Date(night.created_at) : null))
    .filter((date): date is Date => !!date && Number.isFinite(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())
    .slice(0, 14)
    .map((date) => minutesSinceMidnightInTimeZone(date, tz));

  const sampleSize = validCreatedTimes.length;
  const loggedToday = hasEntryForToday(nights, todayYMD, tz);

  if (loggedToday) {
    return {
      shouldShow: false,
      title: "Sleep entry logged today",
      message: "Today's sleep entry is already saved.",
      expectedWindowLabel: null,
      confidence: sampleSize >= 7 ? "high" : sampleSize >= 3 ? "medium" : "low",
      sampleSize,
      expectedStartMin: null,
      expectedEndMin: null,
      reminderDueMin: null,
      minutesLate: null,
      timezone: tz,
      todayYMD,
      loggedToday,
    };
  }

  // New users: use a clear morning default until enough personal rhythm exists.
  if (sampleSize < 3) {
    const reminderDueMin = DEFAULT_DUE_MIN + GRACE_MIN;
    const shouldShow = nowMin >= reminderDueMin;

    return {
      shouldShow,
      title: "Log last night’s sleep",
      message: shouldShow
        ? "No sleep entry has been saved for today yet. Add last night’s sleep so SleepFix can keep the pattern clean."
        : "SleepFix will learn your usual logging rhythm after a few saved nights.",
      expectedWindowLabel: "around 10:00am",
      confidence: "low",
      sampleSize,
      expectedStartMin: DEFAULT_DUE_MIN - 15,
      expectedEndMin: DEFAULT_DUE_MIN,
      reminderDueMin,
      minutesLate: shouldShow ? nowMin - reminderDueMin : null,
      timezone: tz,
      todayYMD,
      loggedToday,
    };
  }

  const mean = circularMeanMinutes(validCreatedTimes) ?? DEFAULT_DUE_MIN;
  const distances = validCreatedTimes.map((value) => circularDistanceMinutes(value, mean));
  const avgDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;

  // Tighter window: enough to respect real habits, not so wide that reminders arrive too late.
  // If user normally logs 10:00–11:00, this should settle near that window and remind at ~11:15.
  const windowRadius = Math.max(15, Math.min(45, Math.round(avgDistance + 10)));
  const expectedStart = mean - windowRadius;
  const expectedEnd = mean + windowRadius;
  const reminderDueMin = expectedEnd + GRACE_MIN;

  const shouldShow = nowMin >= reminderDueMin;
  const confidence = sampleSize >= 7 && avgDistance <= 35 ? "high" : sampleSize >= 3 ? "medium" : "low";
  const expectedWindowLabel = `${formatTime(expectedStart)}–${formatTime(expectedEnd)}`;

  return {
    shouldShow,
    title: "Sleep entry due",
    message: shouldShow
      ? `You usually log between ${expectedWindowLabel}. No sleep entry is saved for today yet.`
      : `Your usual logging window is ${expectedWindowLabel}.`,
    expectedWindowLabel,
    confidence,
    sampleSize,
    expectedStartMin: Math.round(expectedStart),
    expectedEndMin: Math.round(expectedEnd),
    reminderDueMin: Math.round(reminderDueMin),
    minutesLate: shouldShow ? Math.max(0, Math.round(nowMin - reminderDueMin)) : null,
    timezone: tz,
    todayYMD,
    loggedToday,
  };
}
