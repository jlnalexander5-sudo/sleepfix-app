// lib/rrsm/adaptive-reminder.ts
// SleepFix adaptive reminder helper — deterministic v2.
// Purpose:
// - infer the user's usual sleep-log time from sleep_nights.created_at
// - use the user's local timezone, not Vercel/server UTC
// - trigger shortly after the user's normal logging window is missed

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
  minutesLate: number | null;
};

const DEFAULT_TIME_ZONE = "Australia/Sydney";
const NEW_USER_DEFAULT_DUE_MIN = 10 * 60;
const REMINDER_GRACE_MIN = 15;
const MAX_TIGHT_WINDOW_SPREAD_MIN = 90;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function partsInTimeZone(date: Date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function toLocalYMD(date: Date, timeZone = DEFAULT_TIME_ZONE) {
  const p = partsInTimeZone(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

function minutesSinceMidnight(date: Date, timeZone = DEFAULT_TIME_ZONE) {
  const p = partsInTimeZone(date, timeZone);
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

function hasEntryForToday(nights: ReminderNight[], todayYMD: string, timeZone = DEFAULT_TIME_ZONE) {
  return nights.some((night) => {
    const local = String(night.local_date ?? "").slice(0, 10);
    if (local === todayYMD) return true;

    // Fallback only for old rows that may not have local_date.
    if (!night.created_at) return false;
    const created = new Date(night.created_at);
    if (!Number.isFinite(created.getTime())) return false;
    return toLocalYMD(created, timeZone) === todayYMD;
  });
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function confidenceFor(sampleSize: number, spread: number | null): "low" | "medium" | "high" {
  if (sampleSize >= 7 && spread !== null && spread <= 45) return "high";
  if (sampleSize >= 3) return "medium";
  return "low";
}

export function buildAdaptiveReminderState(
  nights: ReminderNight[],
  now: Date = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): AdaptiveReminderState {
  const todayYMD = toLocalYMD(now, timeZone);
  const nowMin = minutesSinceMidnight(now, timeZone);

  const validCreatedTimes = nights
    .map((night) => (night.created_at ? new Date(night.created_at) : null))
    .filter((date): date is Date => !!date && Number.isFinite(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())
    .slice(0, 14)
    .map((date) => minutesSinceMidnight(date, timeZone));

  const sampleSize = validCreatedTimes.length;
  const loggedToday = hasEntryForToday(nights, todayYMD, timeZone);

  if (loggedToday) {
    return {
      shouldShow: false,
      title: "Sleep entry logged today",
      message: "Today's sleep entry is already saved.",
      expectedWindowLabel: null,
      confidence: confidenceFor(sampleSize, null),
      sampleSize,
      expectedStartMin: null,
      expectedEndMin: null,
      minutesLate: null,
    };
  }

  // New users: send after 10:15am local time if today's entry is missing.
  if (sampleSize < 3) {
    const dueMin = NEW_USER_DEFAULT_DUE_MIN + REMINDER_GRACE_MIN;
    const shouldShow = nowMin >= dueMin;

    return {
      shouldShow,
      title: "Log last night’s sleep",
      message: shouldShow
        ? "No sleep entry has been saved for today yet. Add last night’s sleep so SleepFix can keep the pattern clean."
        : "SleepFix will learn your usual logging rhythm after a few saved nights.",
      expectedWindowLabel: "around 10:00am",
      confidence: "low",
      sampleSize,
      expectedStartMin: NEW_USER_DEFAULT_DUE_MIN,
      expectedEndMin: NEW_USER_DEFAULT_DUE_MIN,
      minutesLate: shouldShow ? nowMin - dueMin : null,
    };
  }

  const recentTimes = validCreatedTimes.slice(0, 10).sort((a, b) => a - b);
  const minTime = recentTimes[0];
  const maxTime = recentTimes[recentTimes.length - 1];
  const spread = maxTime - minTime;

  let expectedStart: number;
  let expectedEnd: number;

  if (spread <= MAX_TIGHT_WINDOW_SPREAD_MIN) {
    // If the user normally logs between 10:00–11:00, use that real window.
    // If they log exactly 10:00 every day, expectedEnd remains 10:00.
    expectedStart = minTime;
    expectedEnd = maxTime;
  } else {
    // For messy users, use a tighter median-based window rather than a huge lazy window.
    const mid = median(recentTimes) ?? NEW_USER_DEFAULT_DUE_MIN;
    expectedStart = mid - 30;
    expectedEnd = mid + 30;
  }

  const dueMin = expectedEnd + REMINDER_GRACE_MIN;
  const shouldShow = nowMin >= dueMin;
  const expectedWindowLabel =
    expectedStart === expectedEnd
      ? `around ${formatTime(expectedEnd)}`
      : `${formatTime(expectedStart)}–${formatTime(expectedEnd)}`;

  return {
    shouldShow,
    title: "Sleep entry due",
    message: shouldShow
      ? `You usually log ${expectedWindowLabel}. No sleep entry is saved for today yet.`
      : `Your usual logging window is ${expectedWindowLabel}.`,
    expectedWindowLabel,
    confidence: confidenceFor(sampleSize, spread),
    sampleSize,
    expectedStartMin: Math.round(expectedStart),
    expectedEndMin: Math.round(expectedEnd),
    minutesLate: shouldShow ? Math.max(0, Math.round(nowMin - dueMin)) : null,
  };
}
