"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type DailyHabitRow = {
  id: string;
  user_id: string;
  created_at: string;
  date: string;
  caffeine_after_2pm: boolean | null;
  alcohol: boolean | null;
  exercise: boolean | null;
  screens_last_hour: boolean | null;
};

type SleepLogRow = {
  id: string;
  user_id: string;
  created_at: string;
  sleep_start: string;
  sleep_end: string;
  quality: number | null;
  notes: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function formatDateTime(dt: string) {
  const d = new Date(dt);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}, ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function yesNoIcon(v: boolean | null | undefined) {
  if (v === true) return "✅";
  if (v === false) return "❌";
  return "—";
}

function isGoodDay(r: DailyHabitRow | undefined) {
  if (!r) return false;
  return (
    r.caffeine_after_2pm === false &&
    r.alcohol === false &&
    r.exercise === true &&
    r.screens_last_hour === false
  );
}

export default function DashboardPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [status, setStatus] = useState("Loading…");
  const [todayStr, setTodayStr] = useState("");
  const [dayList, setDayList] = useState<string[]>([]);
  const [habits7, setHabits7] = useState<DailyHabitRow[]>([]);
  const [latestSleep, setLatestSleep] = useState<SleepLogRow | null>(null);
  const [avgQuality7, setAvgQuality7] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus("Loading...");

        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;

        if (!user) {
          if (!cancelled) setStatus("Not signed in.");
          return;
        }

        const today = new Date();
        const todayYMD = toYMD(today);
        if (!cancelled) setTodayStr(todayYMD);

        const start = startOfLocalDay(today);
        const days: string[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(start);
          d.setDate(d.getDate() - i);
          days.push(toYMD(d));
        }

        if (!cancelled) setDayList(days);

        const fromYMD = days[0];
        const toYMDStr = days[days.length - 1];

        const { data: habitsData, error: habitsErr } = await supabase
          .from("daily_habits")
          .select(
            "id,user_id,created_at,date,caffeine_after_2pm,alcohol,exercise,screens_last_hour"
          )
          .gte("date", fromYMD)
          .lte("date", toYMDStr)
          .order("date", { ascending: true });

        if (habitsErr) throw habitsErr;

        const { data: sleepData, error: sleepErr } = await supabase
          .from("sleep_logs")
          .select("id,user_id,created_at,sleep_start,sleep_end,quality,notes")
          .order("sleep_start", { ascending: false })
          .limit(1);

        if (sleepErr) throw sleepErr;

        const { data: sleep7Data, error: sleep7Err } = await supabase
          .from("sleep_logs")
          .select("quality")
          .order("sleep_start", { ascending: false })
          .limit(7);

        if (!sleep7Err && sleep7Data) {
          const vals = sleep7Data
            .map((r) => r.quality)
            .filter((q): q is number => typeof q === "number");

          const avg =
            vals.length > 0
              ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) /
                10
              : null;

          if (!cancelled) setAvgQuality7(avg);
        } else {
          console.warn("sleep7Err", sleep7Err);
          if (!cancelled) setAvgQuality7(null);
        }

        if (!cancelled) {
          setHabits7((habitsData ?? []) as DailyHabitRow[]);
          setLatestSleep((sleepData?.[0] ?? null) as SleepLogRow | null);
          setStatus("Ready.");
        }
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setStatus(e?.message ?? "Error loading dashboard.");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const habitsByDate = useMemo(() => {
    const m = new Map<string, DailyHabitRow>();
    for (const r of habits7) m.set(r.date, r);
    return m;
  }, [habits7]);

  const habitsToday = habitsByDate.get(todayStr);

  const goodDays = useMemo(() => {
    return dayList.filter((d) => isGoodDay(habitsByDate.get(d))).length;
  }, [dayList, habitsByDate]);

  return (
    <main style={{ maxWidth: 820, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
        Dashboard
      </h1>

      <div style={{ opacity: 0.8, marginBottom: 14 }}>
        Today: {todayStr}
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 18,
        }}
      >
        Status: {status}
      </div>

      <section
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
            Today’s habits
          </h2>
          <a href="/protected/habits" style={{ opacity: 0.85 }}>
            Open habits →
          </a>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div>
            {yesNoIcon(habitsToday?.caffeine_after_2pm === false)} Caffeine after
            2pm
          </div>
          <div>{yesNoIcon(habitsToday?.alcohol === false)} Alcohol</div>
          <div>{yesNoIcon(habitsToday?.exercise)} Exercise</div>
          <div>
            {yesNoIcon(habitsToday?.screens_last_hour === false)} Screens last
            hour
          </div>
        </div>

        <hr style={{ margin: "16px 0", opacity: 0.2 }} />

        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Last 7 days (good days): {goodDays}/7
        </div>

        <div style={{ fontSize: 13, opacity: 0.8 }}>
          Avg sleep quality (last 7): {avgQuality7 ?? "–"}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {dayList.map((d) => {
            const ok = isGoodDay(habitsByDate.get(d));
            const short = d.slice(5);
            return (
              <div
                key={d}
                title={d}
                style={{
                  width: 64,
                  height: 56,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.8 }}>{short}</div>
                <div style={{ fontSize: 18 }}>{ok ? "✅" : "❌"}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
          Rule used: a “good day” means all 4 boxes are ticked.
        </div>
      </section>

      <section
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
            Latest sleep log
          </h2>
          <a href="/protected/sleep" style={{ opacity: 0.85 }}>
            Open sleep →
          </a>
        </div>

        {!latestSleep ? (
          <div style={{ opacity: 0.8 }}>No sleep logs yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            <div>Start: {formatDateTime(latestSleep.sleep_start)}</div>
            <div>End: {formatDateTime(latestSleep.sleep_end)}</div>
            <div>Quality: {latestSleep.quality ?? "—"} / 5</div>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700 }}>Notes:</div>
              <div style={{ whiteSpace: "pre-wrap" }}>
                {latestSleep.notes?.trim() || "—"}
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700 }}>
                Last 7 days average quality
              </div>
              <div>
                {avgQuality7 === null ? "—" : `${avgQuality7.toFixed(1)} / 5`}
              </div>
            </div>
          </div>
        )}
      </section>

      <div style={{ display: "flex", gap: 10 }}>
        <a
          href="/protected/habits"
          style={{
            border: "1px solid rgba(255,255,255,0.16)",
            padding: "10px 14px",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          Go to Habits
        </a>
        <a
          href="/protected/sleep"
          style={{
            border: "1px solid rgba(255,255,255,0.16)",
            padding: "10px 14px",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          Go to Sleep
        </a>
      </div>
    </main>
  );
}
