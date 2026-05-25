// lib/rrsm/adaptive-reminder.ts
// SleepFix adaptive reminder helper — deterministic v1.
// Purpose: infer the user's usual sleep-log time from sleep_nights.created_at
// and show an in-app reminder only when today's sleep entry is missing.

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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toLocalYMD(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function minutesSinceMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatTime(mins: number) {
  const clamped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(m)}${suffix}`;
}

function hasEntryForToday(nights: ReminderNight[], todayYMD: string) {
  return nights.some((night) => {
    const local = String(night.local_date ?? "").slice(0, 10);
    if (local === todayYMD) return true;

    if (!night.created_at) return false;
    const created = new Date(night.created_at);
    if (!Number.isFinite(created.getTime())) return false;
    return toLocalYMD(created) === todayYMD;
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
): AdaptiveReminderState {
  const todayYMD = toLocalYMD(now);

  const validCreatedTimes = nights
    .map((night) => (night.created_at ? new Date(night.created_at) : null))
    .filter((date): date is Date => !!date && Number.isFinite(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())
    .slice(0, 14)
    .map(minutesSinceMidnight);

  const sampleSize = validCreatedTimes.length;
  const loggedToday = hasEntryForToday(nights, todayYMD);

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
      minutesLate: null,
    };
  }

  // New users: show a gentle nudge after normal morning logging time.
  if (sampleSize < 3) {
    const defaultDueMin = 10 * 60;
    const nowMin = minutesSinceMidnight(now);
    const shouldShow = nowMin >= defaultDueMin;
    return {
      shouldShow,
      title: "Log last night’s sleep",
      message: shouldShow
        ? "No sleep entry has been saved for today yet. Add last night’s sleep so SleepFix can keep the pattern clean."
        : "SleepFix will learn your usual logging rhythm after a few saved nights.",
      expectedWindowLabel: "around 10:00am",
      confidence: "low",
      sampleSize,
      expectedStartMin: defaultDueMin - 30,
      expectedEndMin: defaultDueMin,
      minutesLate: shouldShow ? nowMin - defaultDueMin : null,
    };
  }

  const mean = circularMeanMinutes(validCreatedTimes) ?? 10 * 60;
  const distances = validCreatedTimes.map((value) => circularDistanceMinutes(value, mean));
  const avgDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;

  const windowRadius = Math.max(20, Math.min(90, Math.round(avgDistance + 15)));
  const expectedStart = mean - windowRadius;
  const expectedEnd = mean + windowRadius;
  const graceEnd = expectedEnd + 15;
  const nowMin = minutesSinceMidnight(now);
  const shouldShow = nowMin >= graceEnd;
  const confidence = sampleSize >= 7 && avgDistance <= 45 ? "high" : sampleSize >= 3 ? "medium" : "low";
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
    minutesLate: shouldShow ? Math.max(0, Math.round(nowMin - graceEnd)) : null,
  };
}
