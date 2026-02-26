"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DailyHabitRow = {
  id?: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  caffeine_after_2pm?: boolean | null;
  alcohol?: boolean | null;
  exercise?: boolean | null;
  screens_last_hour?: boolean | null;
};

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + delta);
  return toYMD(dt);
}

function buildDayList(fromYMD: string, toYMDStr: string) {
  const out: string[] = [];
  let cur = fromYMD;
  while (cur <= toYMDStr) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export default function HabitsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [todayYMD, setTodayYMD] = useState<string>("");

  useEffect(() => {
    // Use Date() only on the client after mount to avoid Next.js prerender errors
    setTodayYMD(toYMD(new Date()));
  }, []);

  const fromYMD = useMemo(() => (todayYMD ? addDays(todayYMD, -6) : ""), [todayYMD]);
  const dayList = useMemo(() => (todayYMD ? buildDayList(fromYMD, todayYMD) : []), [fromYMD, todayYMD]);

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowsByDate, setRowsByDate] = useState<Record<string, DailyHabitRow>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load user + last 7 days of habits
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        if (!cancelled) {
          setError(authErr?.message ?? "Not signed in.");
          setLoading(false);
        }
        return;
      }

      const uid = authData.user.id;
      if (!cancelled) setUserId(uid);

      const { data, error: fetchErr } = await supabase
        .from("daily_habits")
        .select("user_id,date,caffeine_after_2pm,alcohol,exercise,screens_last_hour")
        .eq("user_id", uid)
        .gte("date", fromYMD)
        .lte("date", todayYMD)
        .order("date", { ascending: true });

      if (fetchErr) {
        if (!cancelled) {
          setError(fetchErr.message);
          setLoading(false);
        }
        return;
      }

      const map: Record<string, DailyHabitRow> = {};
      (data ?? []).forEach((r: any) => {
        map[r.date] = r as DailyHabitRow;
      });

      // ensure each date has a row shape (even if empty)
      dayList.forEach((d) => {
        if (!map[d]) {
          map[d] = { user_id: uid, date: d };
        }
      });

      if (!cancelled) {
        setRowsByDate(map);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, fromYMD, todayYMD, dayList]);

  async function setHabit(date: string, field: keyof DailyHabitRow, value: boolean) {
    if (!userId) return;

    setSavingKey(`${date}:${String(field)}`);
    setError(null);

    // optimistic update
    setRowsByDate((prev) => ({
      ...prev,
      [date]: {
        ...(prev[date] ?? { user_id: userId, date }),
        [field]: value,
      },
    }));

    const existing = (rowsByDate[date] ?? {}) as DailyHabitRow;
    // Remove keys that would cause duplicate properties in an object literal
    const { user_id: _u, date: _d, ...rest } = existing as any;

    const payload: DailyHabitRow = {
      ...rest,
      user_id: userId,
      date,
      [field]: value,
    } as DailyHabitRow;

    const { error: upsertErr } = await supabase
      .from("daily_habits")
      .upsert(payload, { onConflict: "user_id,date" });

    if (upsertErr) {
      setError(upsertErr.message);
    }

    setSavingKey(null);
  }

  const todayRow = rowsByDate[todayYMD] ?? (userId ? { user_id: userId, date: todayYMD } : null);

  function HabitCheckbox(props: {
    date: string;
    field: keyof DailyHabitRow;
    label: string;
  }) {
    const row = rowsByDate[props.date];
    const checked = Boolean(row?.[props.field]);

    return (
      <label className="flex items-center gap-3 rounded-lg border p-3">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={checked}
          onChange={(e) => setHabit(props.date, props.field, e.target.checked)}
          disabled={!userId || loading}
        />
        <div className="flex-1">
          <div className="font-medium">{props.label}</div>
          {savingKey === `${props.date}:${String(props.field)}` ? (
            <div className="text-xs text-neutral-500">Saving…</div>
          ) : null}
        </div>
      </label>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Habits</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Simple daily checkboxes. This is just “what happened today”, saved per date.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Today ({todayYMD})</h2>
          {loading ? <span className="text-sm text-neutral-500">Loading…</span> : null}
        </div>

        <div className="mt-4 grid gap-3">
          <HabitCheckbox date={todayYMD} field="caffeine_after_2pm" label="Caffeine after 2pm" />
          <HabitCheckbox date={todayYMD} field="alcohol" label="Alcohol" />
          <HabitCheckbox date={todayYMD} field="exercise" label="Exercise" />
          <HabitCheckbox date={todayYMD} field="screens_last_hour" label="Screens in last hour" />
        </div>

        <p className="text-xs text-neutral-500 mt-4">
          Tip: These are “binary” signals used for pattern detection later. You don’t need to overthink them.
        </p>
      </section>

      <section className="mt-6 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Last 7 days</h2>
        <p className="text-sm text-neutral-600 mt-1">
          Shows what you ticked on each day (not asking you to remember anything).
        </p>

        <div className="mt-4 grid gap-2">
          {dayList.map((d) => {
            const r = rowsByDate[d];
            const score =
              Number(Boolean(r?.caffeine_after_2pm)) +
              Number(Boolean(r?.alcohol)) +
              Number(Boolean(r?.exercise)) +
              Number(Boolean(r?.screens_last_hour));
            return (
              <div key={d} className="flex items-center justify-between rounded-lg border p-3">
                <div className="font-medium">{d}</div>
                <div className="text-sm text-neutral-600">
                  ticks: <span className="font-semibold">{score}</span>/4
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
