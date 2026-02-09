"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
// other imports...

export default function DashboardPage() {
}

type DailyHabitRow = {
  id: string;
  user_id: string;
  created_at: string;
  date: string; // YYYY-MM-DD
  caffeine_after_2pm: boolean | null;
  alcohol: boolean | null;
  exercise: boolean | null;
  screens_last_hour: boolean | null;
};

type SleepLogRow = {
  id: string;
  user_id: string;
  created_at: string;
  sleep_start: string | null; // timestamptz
  sleep_end: string | null; // timestamptz
  quality: number | null; // smallint
  notes: string | null;
};

function toYYYYMMDDLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysLocal(dateStr: string, deltaDays: number) {
  // dateStr is YYYY-MM-DD interpreted as local date at midnight
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + deltaDays);
  return toYYYYMMDDLocal(dt);
}

function fmtLocal(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function yesNoIcon(v: boolean | null | undefined) {
  return v ? "✅" : "❌";
}

function addDaysLocal(yyyyMmDd: string, deltaDays: number) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatDurationFromMs(ms: number) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function toMinutesSinceMidnightLocal(isoOrDate: string | Date) {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins; // 0..1439
}

function circularDistanceMinutes(a: number, b: number) {
  const diff = Math.abs(a - b);
  return Math.min(diff, 1440 - diff);
}
// circular mean for times-of-day (handles around midnight)
function circularMeanMinutes(values: number[]) {
  if (values.length === 0) return 0;
  let sumSin = 0;
  let sumCos = 0;
  for (const v of values) {
    const angle = (v / 1440) * 2 * Math.PI;
    sumSin += Math.sin(angle);
    sumCos += Math.cos(angle);
  }
  const meanAngle = Math.atan2(sumSin / values.length, sumCos / values.length);
  const normalized = meanAngle < 0 ? meanAngle + 2 * Math.PI : meanAngle;
  return Math.round((normalized / (2 * Math.PI)) * 1440) % 1440;
}

function formatTimeOfDay(mins: number) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")}${ampm}`;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [today, setToday] = useState<string>("");

  const [habitsToday, setHabitsToday] = useState<DailyHabitRow | null>(null);
  const [sleepLatest, setSleepLatest] = useState<SleepLogRow | null>(null);

  // NEW: 7-day summaries
  const [habits7, setHabits7] = useState<DailyHabitRow[]>([]);
  const [sleep7Avg, setSleep7Avg] = useState<number | null>(null);
  const [sleep7Count, setSleep7Count] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setStatus("Checking session...");

      const t = toYYYYMMDDLocal();
      setToday(t);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        if (!cancelled) {
          setError(userErr.message);
          setStatus("Failed to get user.");
          setLoading(false);
        }
        return;
      }

      const user = userData.user;
      if (!user) {
        if (!cancelled) {
          setStatus("Not logged in.");
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;
      setUserId(user.id);
      setEmail(user.email ?? null);

      // --- 1) Habits: load / create today's row
      setStatus("Loading today's habits...");
      const { data: existingHabits, error: habitsErr } = await supabase
        .from("daily_habits")
        .select(
          "id, user_id, created_at, date, caffeine_after_2pm, alcohol, exercise, screens_last_hour"
        )
        .eq("user_id", user.id)
        .eq("date", t)
        .maybeSingle<DailyHabitRow>();

      if (habitsErr) {
        if (!cancelled) {
          setError(habitsErr.message);
          setStatus("Failed to load habits.");
          setLoading(false);
        }
        return;
      }

      let todaysRow = existingHabits;

      if (!todaysRow) {
        setStatus("Creating today's habits row...");
        const { data: created, error: createErr } = await supabase
          .from("daily_habits")
          .insert({
            user_id: user.id,
            date: t,
            caffeine_after_2pm: false,
            alcohol: false,
            exercise: false,
            screens_last_hour: false,
          })
          .select(
            "id, user_id, created_at, date, caffeine_after_2pm, alcohol, exercise, screens_last_hour"
          )
          .single<DailyHabitRow>();

        if (createErr) {
          if (!cancelled) {
            setError(createErr.message);
            setStatus("Failed to create habits row.");
            setLoading(false);
          }
          return;
        }
        todaysRow = created;
      }

      // --- 2) Latest sleep log
      setStatus("Loading latest sleep log...");
      const { data: latestSleep, error: sleepErr } = await supabase
        .from("sleep_logs")
        .select("id, user_id, created_at, sleep_start, sleep_end, quality, notes")
        .eq("user_id", user.id)
        .order("sleep_start", { ascending: false })
        .limit(1)
        .maybeSingle<SleepLogRow>();

      if (sleepErr) {
        if (!cancelled) {
          setError(sleepErr.message);
          setStatus("Failed to load sleep log.");
          setLoading(false);
        }
        return;
      }

      // --- 3) NEW: last 7 days of habits (including today)
      setStatus("Loading 7-day habits...");
      const startDate = addDaysLocal(t, -6); // last 7 days inclusive
      const { data: habitsRows, error: habits7Err } = await supabase
        .from("daily_habits")
        .select(
          "id, user_id, created_at, date, caffeine_after_2pm, alcohol, exercise, screens_last_hour"
        )
        .eq("user_id", user.id)
        .gte("date", startDate)
        .lte("date", t)
        .order("date", { ascending: true });

      if (habits7Err) {
        if (!cancelled) {
          setError(habits7Err.message);
          setStatus("Failed to load 7-day habits.");
          setLoading(false);
        }
        return;
      }

      // --- 4) NEW: 7-day average sleep quality (based on sleep_start in last 7 days)
      setStatus("Loading 7-day sleep quality...");
      const startLocal = new Date();
      startLocal.setDate(startLocal.getDate() - 6);
      startLocal.setHours(0, 0, 0, 0);
      const startISO = startLocal.toISOString();

      const { data: sleepRows, error: sleep7Err } = await supabase
        .from("sleep_logs")
        .select("quality, sleep_start")
        .eq("user_id", user.id)
        .gte("sleep_start", startISO)
        .order("sleep_start", { ascending: true });

      if (sleep7Err) {
        if (!cancelled) {
          setError(sleep7Err.message);
          setStatus("Failed to load 7-day sleep logs.");
          setLoading(false);
        }
        return;
      }

      const qualities = (sleepRows ?? [])
        .map((r: any) => r?.quality)
        .filter((q: any) => typeof q === "number") as number[];

      const avg =
        qualities.length > 0
          ? Math.round((qualities.reduce((a, b) => a + b, 0) / qualities.length) * 10) / 10
          : null;

      if (cancelled) return;
      setHabitsToday(todaysRow ?? null);
      setSleepLatest(latestSleep ?? null);

      setHabits7((habitsRows ?? []) as DailyHabitRow[]);
      setSleep7Count(qualities.length);
      setSleep7Avg(avg);

      setStatus("Ready.");
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Build a 7-day strip for habits: each day gets a dot ✅/❌ based on ALL habits completed that day
  const startDate = today ? addDaysLocal(today, -6) : "";
  const dayList = today
    ? Array.from({ length: 7 }, (_, i) => addDaysLocal(today, -6 + i))
    : [];

  const habitsByDate = new Map(habits7.map((r) => [r.date, r]));

  function dayScore(d: string) {
  const r = habitsByDate.get(d);
  if (!r) return { symbol: "—", label: d, ok: false };

  const ok =
    r.caffeine_after_2pm === false &&
    r.alcohol === false &&
    r.exercise === true &&
    r.screens_last_hour === false;

  return { symbol: ok ? "✅" : "❌", label: d, ok };
}

  const goodDays = dayList.filter((d) => dayScore(d).ok).length;

  return (
    <main style={{ maxWidth: 820, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Dashboard
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        {email ? `Signed in as ${email}` : "Signed in"}
        {today ? ` • Today: ${today}` : ""}
      </p>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.8 }}>Status: {status}</div>
        {loading && <div style={{ marginTop: 8 }}>Loading...</div>}
        {error && (
          <div style={{ marginTop: 8, color: "salmon" }}>Error: {error}</div>
        )}
      </div>

      {!loading && (
        <div style={{ display: "grid", gap: 16 }}>
          {/* Habits card */}
          <section
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Today’s habits
              </h2>
              <Link href="/protected/habits" style={{ opacity: 0.9 }}>
                Open habits →
              </Link>
            </div>

            <div style={{ marginTop: 12, lineHeight: 1.9 }}>
              <div>
                {yesNoIcon(habitsToday?.caffeine_after_2pm)} Caffeine after 2pm
              </div>
              <div>{yesNoIcon(habitsToday?.alcohol)} Alcohol</div>
              <div>{yesNoIcon(habitsToday?.exercise)} Exercise</div>
              <div>
                {yesNoIcon(habitsToday?.screens_last_hour)} Screens last hour
              </div>
            </div>

            {/* NEW: 7-day streak */}
            <hr style={{ margin: "16px 0", opacity: 0.2 }} />
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Last 7 days (good days): {goodDays}/7
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {dayList.map((d) => {
                const s = dayScore(d);
                const short = d.slice(5); // MM-DD
                return (
                  <div
                    key={d}
                    title={d}
                    style={{
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 10,
                      padding: "8px 10px",
                      minWidth: 74,
                      textAlign: "center",
                      opacity: s.symbol === "—" ? 0.7 : 1,
                    }}
                  >
                    <div style={{ fontSize: 14, opacity: 0.85 }}>{short}</div>
                    <div style={{ fontSize: 18, marginTop: 4 }}>{s.symbol}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
              Rule used: a “good day” means no caffeine after 2pm, no alcohol, exercise done, and no screens in the last hour.
            </div>
          </section>

          {/* Sleep card */}
          <section
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Latest sleep log
              </h2>
              <Link href="/protected/sleep" style={{ opacity: 0.9 }}>
                Open sleep →
              </Link>
            </div>

            {!sleepLatest ? (
              <div style={{ marginTop: 12, opacity: 0.85 }}>
                No sleep logs yet.
              </div>
            ) : (
              <div style={{ marginTop: 12, lineHeight: 1.9 }}>
                <div>
                  <span style={{ opacity: 0.8 }}>Start:</span>{" "}
                  {fmtLocal(sleepLatest.sleep_start)}
                </div>
                <div>
                  <span style={{ opacity: 0.8 }}>End:</span>{" "}
                  {fmtLocal(sleepLatest.sleep_end)}
                </div>
                <div>
                  <span style={{ opacity: 0.8 }}>Quality:</span>{" "}
                  {sleepLatest.quality ?? "—"} / 5
                </div>

                {sleepLatest.notes ? (
                  <div style={{ marginTop: 10, opacity: 0.9 }}>
                    <div style={{ opacity: 0.8, marginBottom: 4 }}>Notes:</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {sleepLatest.notes}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* NEW: 7-day avg */}
            <hr style={{ margin: "16px 0", opacity: 0.2 }} />
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Last 7 days average quality
            </div>
            <div style={{ opacity: 0.9 }}>
              {sleep7Avg === null ? "— (no logs yet)" : `${sleep7Avg} / 5`}{" "}
              <span style={{ opacity: 0.7 }}>
                {sleep7Count > 0 ? `(${sleep7Count} log${sleep7Count === 1 ? "" : "s"})` : ""}
              </span>
            </div>
          </section>

          {/* quick nav */}
          <section style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link
              href="/protected/habits"
              style={{
                display: "inline-block",
                padding: "10px 14px",
                borderRadius: 10,
                fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              Go to Habits
            </Link>
            <Link
              href="/protected/sleep"
              style={{
                display: "inline-block",
                padding: "10px 14px",
                borderRadius: 10,
                fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              Go to Sleep
            </Link>
          </section>
        </div>
      )}
    </main>
  );
}
