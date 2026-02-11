// NOTE: This file was patched to compute avg duration + bedtime consistency + RRSM from sleep7Data
// and to avoid the “snippets everywhere” problem.

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client"

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
  sleep_start: string | null; // ISO
  sleep_end: string | null; // ISO
  quality: number | null; // 1-5
  notes: string | null;
};

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function minutesOfDayFromISO(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// Circular mean for minutes-of-day (handles wraparound near midnight)
function circularMeanMinutes(values: number[]) {
  const toRad = (m: number) => (m / (24 * 60)) * 2 * Math.PI;
  const xs = values.map((m) => Math.cos(toRad(m)));
  const ys = values.map((m) => Math.sin(toRad(m)));
  const meanX = xs.reduce((a, b) => a + b, 0) / values.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / values.length;
  const ang = Math.atan2(meanY, meanX);
  const norm = ang < 0 ? ang + 2 * Math.PI : ang;
  const mins = (norm / (2 * Math.PI)) * (24 * 60);
  return mins;
}

// Circular standard deviation (minutes)
function circularStdMinutes(values: number[]) {
  const toRad = (m: number) => (m / (24 * 60)) * 2 * Math.PI;
  const xs = values.map((m) => Math.cos(toRad(m)));
  const ys = values.map((m) => Math.sin(toRad(m)));
  const meanX = xs.reduce((a, b) => a + b, 0) / values.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / values.length;
  const R = Math.sqrt(meanX * meanX + meanY * meanY);
  // circular std in radians:
  const stdRad = Math.sqrt(-2 * Math.log(Math.max(R, 1e-9)));
  // convert to minutes:
  return (stdRad / (2 * Math.PI)) * (24 * 60);
}

function formatDateTime(dt: string) {
  const d = new Date(dt);
  const day = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${mo}/${y}, ${hh}:${mm}`;
}

function durationMinutes(startIso?: string | null, endIso?: string | null) {
  if (!startIso || !endIso) return null;
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = Math.round((b - a) / 60000);
  if (!Number.isFinite(diff)) return null;
  return diff;
}

function formatMinutesHuman(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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
  const supabase = useMemo(() => createClient(), []);

  const [status, setStatus] = useState<string>("Loading…");
  const [todayStr, setTodayStr] = useState<string>("");
  const [dayList, setDayList] = useState<string[]>([]);
  const [habits7, setHabits7] = useState<DailyHabitRow[]>([]);
  const [latestSleep, setLatestSleep] = useState<SleepLogRow | null>(null);

  const [avgQuality7, setAvgQuality7] = useState<number | null>(null);
  const [avgDuration7, setAvgDuration7] = useState<number | null>(null); // minutes
  const [bedtimeMean7, setBedtimeMean7] = useState<number | null>(null); // minutes-of-day
  const [bedtimeVar7, setBedtimeVar7] = useState<number | null>(null); // minutes variability
  const [rrsmScore7, setRrsmScore7] = useState<number | null>(null);

  const latestDurationMins = durationMinutes(latestSleep?.sleep_start, latestSleep?.sleep_end);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus("Loading…");

        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          if (!cancelled) setStatus("Not signed in.");
          return;
        }

        const today = new Date();
        const todayYMD = toYMD(today);
        if (!cancelled) setTodayStr(todayYMD);

        // build last 7 days list (inclusive today), oldest -> newest
        const out: string[] = [];
        const start = startOfLocalDay(today);
        for (let i = 6; i >= 0; i--) {
          const d = new Date(start);
          d.setDate(d.getDate() - i);
          out.push(toYMD(d));
        }
        if (!cancelled) setDayList(out);

        const fromYMD = out[0];
        const toYMDStr = out[out.length - 1];

        // fetch habits for last 7 days
        const { data: habitsData, error: habitsErr } = await supabase
          .from("daily_habits")
          .select("id,user_id,created_at,date,caffeine_after_2pm,alcohol,exercise,screens_last_hour")
          .gte("date", fromYMD)
          .lte("date", toYMDStr)
          .order("date", { ascending: true });

        if (habitsErr) throw habitsErr;

        // fetch latest sleep log
        const { data: sleepData, error: sleepErr } = await supabase
          .from("sleep_logs")
          .select("id,user_id,created_at,sleep_start,sleep_end,quality,notes")
          .order("sleep_start", { ascending: false })
          .limit(1);

        if (sleepErr) throw sleepErr;

        const latest = (sleepData ?? [])[0] ?? null;

        // fetch last 7 sleep logs (for averages + consistency)
        const { data: sleep7Data, error: sleep7Err } = await supabase
          .from("sleep_logs")
          .select("sleep_start,sleep_end,quality")
          .order("sleep_start", { ascending: false })
          .limit(7);

        // compute: avg quality, avg duration, bedtime mean + variability, RRSM score (0-100)
        let avgQ: number | null = null;
        let avgDur: number | null = null; // minutes
        let bedMean: number | null = null; // minutes-of-day
        let bedVar: number | null = null; // minutes (circular std)
        let rrsm: number | null = null;

        if (sleep7Err) {
          console.warn("sleep7Err", sleep7Err);
        } else {
          const qualities = (sleep7Data ?? [])
            .map((r: any) => r?.quality)
            .filter((q: any) => typeof q === "number") as number[];
          if (qualities.length) {
            avgQ = Math.round((qualities.reduce((a, b) => a + b, 0) / qualities.length) * 10) / 10;
          }

          const durations = (sleep7Data ?? [])
            .map((r: any) => durationMinutes(r?.sleep_start ?? null, r?.sleep_end ?? null))
            .filter((m: any) => typeof m === "number" && Number.isFinite(m) && m > 0) as number[];
          if (durations.length) {
            avgDur = Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10;
          }

          const bedtimes = (sleep7Data ?? [])
            .map((r: any) => (r?.sleep_start ? minutesOfDayFromISO(r.sleep_start) : null))
            .filter((m: any) => typeof m === "number" && Number.isFinite(m)) as number[];
          if (bedtimes.length) {
            bedMean = circularMeanMinutes(bedtimes);
            bedVar = circularStdMinutes(bedtimes);
          }

          // RRSM v1 (tweak anytime)
          // Quality (1-5) -> 0..50
          const qScore = avgQ == null ? 0 : Math.max(0, Math.min(50, ((avgQ - 1) / 4) * 50));
          // Duration: target 8h, score drops to 0 at +/- 3h
          const durScore =
            avgDur == null
              ? 0
              : (() => {
                  const idealMin = 8 * 60;
                  const diff = Math.abs(avgDur - idealMin);
                  const score = 25 * Math.max(0, 1 - diff / (3 * 60));
                  return Math.max(0, Math.min(25, score));
                })();
          // Bedtime variability (circular std): 0min ->15, 120min+ ->0
          const varScore =
            bedVar == null ? 0 : Math.max(0, Math.min(15, 15 * (1 - Math.min(bedVar, 120) / 120)));

          rrsm = Math.round((qScore + durScore + varScore) * 10) / 10;
        }

        if (!cancelled) {
          setHabits7(habitsData ?? []);
          setLatestSleep(latest);
          setAvgQuality7(avgQ);
          setAvgDuration7(avgDur);
          setBedtimeMean7(bedMean);
          setBedtimeVar7(bedVar);
          setRrsmScore7(rrsm);
          setStatus("Ready.");
        }
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setStatus(e?.message ?? "Error");
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

  const goodDaysCount = useMemo(() => {
    let c = 0;
    for (const d of dayList) {
      if (isGoodDay(habitsByDate.get(d))) c++;
    }
    return c;
  }, [dayList, habitsByDate]);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="text-sm opacity-70">Today: {todayStr || "—"}</div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="font-medium">Status: {status}</div>
      </div>

      <div className="rounded-xl border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Today’s habits</h2>
          <Link className="underline opacity-80 hover:opacity-100" href="/protected/habits">
            Open habits →
          </Link>
        </div>

        <div className="space-y-2">
          {(() => {
            const r = habitsByDate.get(todayStr);
            return (
              <div className="text-sm space-y-2">
                <div> {r?.caffeine_after_2pm === false ? "✅" : "❌"} Caffeine after 2pm</div>
                <div> {r?.alcohol === false ? "✅" : "❌"} Alcohol</div>
                <div> {r?.exercise === true ? "✅" : "—"} Exercise</div>
                <div> {r?.screens_last_hour === false ? "✅" : "❌"} Screens last hour</div>
              </div>
            );
          })()}
        </div>

        <div className="pt-2 space-y-2">
          <div className="text-sm font-medium">Last 7 days (good days): {goodDaysCount}/{dayList.length || 7}</div>

          <div className="text-sm opacity-80">
            Avg sleep quality (last 7): {avgQuality7 == null ? "—" : avgQuality7}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {dayList.map((d) => {
              const ok = isGoodDay(habitsByDate.get(d));
              return (
                <div
                  key={d}
                  className="border rounded-lg px-3 py-2 text-xs flex items-center gap-2"
                  title={d}
                >
                  <div className="opacity-70">{d.slice(5)}</div>
                  <div>{ok ? "✅" : "❌"}</div>
                </div>
              );
            })}
          </div>

          <div className="text-xs opacity-70 pt-1">
            Rule used: a “good day” means all 4 boxes are ticked.
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Latest sleep log</h2>
          <Link className="underline opacity-80 hover:opacity-100" href="/protected/sleep">
            Open sleep →
          </Link>
        </div>

        {latestSleep ? (
          <div className="text-sm space-y-1">
            <div>Start: {latestSleep.sleep_start ? formatDateTime(latestSleep.sleep_start) : "—"}</div>
            <div>End: {latestSleep.sleep_end ? formatDateTime(latestSleep.sleep_end) : "—"}</div>
            <div>Quality: {latestSleep.quality ?? "—"} / 5</div>
            <div className="pt-2 font-semibold">Notes:</div>
            <div className="opacity-90 whitespace-pre-wrap">{latestSleep.notes || "—"}</div>

            <div className="pt-3 space-y-1">
              <div className="font-semibold">Last 7 days average quality</div>
              <div>{avgQuality7 == null ? "—" : `${avgQuality7} / 5`}</div>

              <div className="font-semibold pt-2">Last 7 days average duration</div>
              <div>{avgDuration7 == null ? "—" : formatMinutesHuman(Math.round(avgDuration7))}</div>

              <div className="font-semibold pt-2">Bedtime consistency</div>
              <div>
                {bedtimeVar7 == null
                  ? "—"
                  : `±${Math.round(bedtimeVar7)} min (lower = more consistent)`}
              </div>

              <div className="font-semibold pt-2">RRSM score (v1)</div>
              <div>{rrsmScore7 == null ? "—" : rrsmScore7}</div>
            </div>

            <div className="pt-3 text-xs opacity-70">
              Latest duration: {latestDurationMins == null ? "—" : formatMinutesHuman(latestDurationMins)}
            </div>
          </div>
        ) : (
          <div className="text-sm opacity-70">No sleep logs yet.</div>
        )}
      </div>

      <div className="flex gap-4">
        <Link className="underline" href="/protected/habits">
          Go to Habits
        </Link>
        <Link className="underline" href="/protected/sleep">
          Go to Sleep
        </Link>
      </div>
    </div>
  );
}
