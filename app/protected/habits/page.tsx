"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type DailyHabitRow = {
  id?: string;
  user_id: string;
  created_at?: string;
  date: string; // YYYY-MM-DD
  caffeine_after_2pm: boolean | null;
  alcohol: boolean | null;
  exercise: boolean | null;
  screens_last_hour: boolean | null;
};

type DailyRRSMFactorRow = {
  id?: string;
  user_id: string;
  created_at?: string;
  local_date: string; // YYYY-MM-DD
  ambient_heat_high: boolean | null;
  hot_drinks_late: boolean | null;
  heavy_food_late: boolean | null;
  intense_thinking_late: boolean | null;
  visualization_attempted: boolean | null;
  fought_wakefulness: boolean | null;
  cold_shower_evening: boolean | null;
  ice_water_evening: boolean | null;
  notes?: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function HabitsPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [status, setStatus] = useState<string>("Loading…");
  const [todayStr, setTodayStr] = useState<string>("");
  const [dayList, setDayList] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [rows, setRows] = useState<Record<string, DailyHabitRow | undefined>>(
    {}
  );

  const [rrsmRows, setRrsmRows] = useState<
    Record<string, DailyRRSMFactorRow | undefined>
  >({});

  // Build today + last 7 days on client only
  useEffect(() => {
    const today = new Date();
    const todayYMD = toYMD(today);
    setTodayStr(todayYMD);

    const start = startOfLocalDay(today);
    const out: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(start);
      d.setDate(d.getDate() - i);
      out.push(toYMD(d));
    }
    setDayList(out);
  }, []);

  // Load habits + rrsm factors
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
        if (!cancelled) setUserId(user.id);

        if (dayList.length !== 7) return;

        const fromYMD = dayList[0];
        const toYMDStr = dayList[dayList.length - 1];

        const { data: habitsData, error: habitsErr } = await supabase
          .from("daily_habits")
          .select(
            "id,user_id,created_at,date,caffeine_after_2pm,alcohol,exercise,screens_last_hour"
          )
          .eq("user_id", user.id)
          .gte("date", fromYMD)
          .lte("date", toYMDStr)
          .order("date", { ascending: true });

        if (habitsErr) throw habitsErr;

        const habitsMap: Record<string, DailyHabitRow | undefined> = {};
        for (const r of (habitsData ?? []) as DailyHabitRow[]) {
          habitsMap[r.date] = r;
        }

        const { data: rrsmData, error: rrsmErr } = await supabase
          .from("daily_rrsm_factors")
          .select(
            "id,user_id,created_at,local_date,ambient_heat_high,hot_drinks_late,heavy_food_late,intense_thinking_late,visualization_attempted,fought_wakefulness,cold_shower_evening,ice_water_evening,notes"
          )
          .eq("user_id", user.id)
          .gte("local_date", fromYMD)
          .lte("local_date", toYMDStr)
          .order("local_date", { ascending: true });

        if (rrsmErr) throw rrsmErr;

        const rrsmMap: Record<string, DailyRRSMFactorRow | undefined> = {};
        for (const r of (rrsmData ?? []) as DailyRRSMFactorRow[]) {
          rrsmMap[r.local_date] = r;
        }

        if (!cancelled) {
          setRows(habitsMap);
          setRrsmRows(rrsmMap);
          setStatus("Ready.");
        }
      } catch (e: any) {
        if (!cancelled) setStatus(e?.message ?? "Failed to load.");
      }
    }

    load();
    return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Habits</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Quick daily check-in (best done <span className="font-medium">today</span>, not backfilled).
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Today’s check-in</div>
              <div className="text-sm text-neutral-600">{dayList[dayList.length - 1]}</div>
            </div>
            <div className="text-sm text-neutral-600">Status: {status}</div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="font-medium">Simple habits (easy to remember)</div>
              <div className="space-y-2">
                {checkbox(dayList[dayList.length - 1], "caffeine_after_2pm", "Caffeine after 2pm")}
                {checkbox(dayList[dayList.length - 1], "alcohol", "Alcohol")}
                {checkbox(dayList[dayList.length - 1], "exercise", "Exercise")}
                {checkbox(dayList[dayList.length - 1], "screens_last_hour", "Screens in last hour")}
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                Tip: Use the Sleep page “drivers” for your best guess at causes. Habits are just the objective checkboxes.
              </p>
            </div>

            <div className="space-y-3">
              <details className="rounded-lg border bg-neutral-50 p-3">
                <summary className="cursor-pointer select-none font-medium">
                  More factors (optional)
                </summary>
                <div className="mt-3 space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-neutral-700">Other factors</div>
                    {rrsmCheckbox(dayList[dayList.length - 1], "hot_day_ambient_heat", "Hot day / ambient heat")}
                    {rrsmCheckbox(dayList[dayList.length - 1], "hot_drinks_late", "Hot drinks late")}
                    {rrsmCheckbox(dayList[dayList.length - 1], "heavy_food_late", "Heavy food late")}
                    {rrsmCheckbox(dayList[dayList.length - 1], "intense_thinking_late", "Intense thinking late")}
                    {rrsmCheckbox(dayList[dayList.length - 1], "tried_visualization_at_night", "Tried visualization at night")}
                    {rrsmCheckbox(dayList[dayList.length - 1], "fought_wakefulness_forced_sleep", "Fought wakefulness (forced sleep)")}
                    {rrsmCheckbox(dayList[dayList.length - 1], "cold_shower_evening", "Cold shower evening")}
                    {rrsmCheckbox(dayList[dayList.length - 1], "ice_water_evening", "Ice water evening")}
                  </div>
                </div>
              </details>
              <p className="text-xs text-neutral-500">
                Optional means optional — you can ignore this entirely and still use Sleep + Dashboard normally.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">History (last 7 days)</div>
              <div className="text-sm text-neutral-600">Read-only summary of what you logged each day.</div>
            </div>
            <div className="text-sm text-neutral-600">
              Good days: {dayList.filter((d) => {
                const r = rowsByDate[d];
                if (!r) return false;
                return !!(r.caffeine_after_2pm && r.alcohol && r.exercise && r.screens_last_hour);
              }).length}/{dayList.length}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {dayList.map((d) => {
              const r = rowsByDate[d];
              const pills: string[] = [];
              if (r?.caffeine_after_2pm) pills.push("Caffeine");
              if (r?.alcohol) pills.push("Alcohol");
              if (r?.exercise) pills.push("Exercise");
              if (r?.screens_last_hour) pills.push("Screens");
              return (
                <div key={d} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="font-mono text-sm">{d}</div>
                  <div className="flex flex-wrap gap-2">
                    {pills.length === 0 ? (
                      <span className="text-sm text-neutral-500">No habits logged</span>
                    ) : (
                      pills.map((p) => (
                        <span key={p} className="rounded-full border bg-neutral-50 px-2 py-0.5 text-xs">
                          {p}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-neutral-500 mt-3">
            This is not asking you to “remember 7 nights ago” — it only shows what you entered on those days.
          </p>
        </div>
      </div>
    </main>
  );
}
