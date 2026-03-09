
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

type HabitGuide = {
  field: keyof DailyHabitRow;
  label: string;
  sensitive: string;
  nonsensitive: string;
  note?: string;
};

const habitGuide: HabitGuide[] = [
  {
    field: "caffeine_after_2pm",
    label: "Caffeine",
    sensitive: "Sensitive RB2: avoid after 2pm.",
    nonsensitive: "Less sensitive: many people tolerate it until about 6pm.",
    note: "Keep tracking your personal cut-off time. The engine should learn this over time.",
  },
  {
    field: "alcohol",
    label: "Alcohol",
    sensitive: "Sensitive RB2: evening alcohol often disrupts sleep.",
    nonsensitive: "Less sensitive: some tolerate earlier alcohol better, but close-to-bed still often affects sleep.",
    note: "Notice your own timing threshold instead of assuming a universal rule.",
  },
  {
    field: "exercise",
    label: "Heavy exercise",
    sensitive: "Sensitive RB2: avoid heavy exercise after 5pm.",
    nonsensitive: "Less sensitive: some tolerate heavy exercise until about 3 hours before sleep.",
    note: "Light movement is different from intense exercise. Log what actually applied.",
  },
  {
    field: "screens_last_hour",
    label: "Screens / heavy light",
    sensitive: "Sensitive RB2: avoid screens in the last hour before sleep.",
    nonsensitive: "Less sensitive: some tolerate screens better, but many still feel the effect in the final hour.",
    note: "This includes heavy lights and high visual stimulation.",
  },
];

export default function HabitsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [todayYMD, setTodayYMD] = useState<string>("");

  useEffect(() => {
    setTodayYMD(toYMD(new Date()));
  }, []);

  const fromYMD = useMemo(() => (todayYMD ? addDays(todayYMD, -6) : ""), [todayYMD]);
  const dayList = useMemo(() => (todayYMD ? buildDayList(fromYMD, todayYMD) : []), [fromYMD, todayYMD]);

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowsByDate, setRowsByDate] = useState<Record<string, DailyHabitRow>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      dayList.forEach((d) => {
        if (!map[d]) map[d] = { user_id: uid, date: d };
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

    setRowsByDate((prev) => ({
      ...prev,
      [date]: {
        ...(prev[date] ?? { user_id: userId, date }),
        [field]: value,
      },
    }));

    const existing = (rowsByDate[date] ?? {}) as DailyHabitRow;
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

    if (upsertErr) setError(upsertErr.message);
    setSavingKey(null);
  }

  function HabitCheckbox(props: { date: string; field: keyof DailyHabitRow; label: string }) {
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
            <div className="text-base text-neutral-500">Saving…</div>
          ) : null}
        </div>
      </label>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-base">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Habits</h1>
        <p className="text-base text-neutral-600 mt-2">
          Quick “day factors” log. Tick what actually happened today (objective inputs), saved per date.
        </p>
        <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-sm font-bold text-neutral-900">Habits page = objective daily behaviour</div>
          <div className="mt-1 text-sm text-neutral-700">
            Record what actually happened during the day, independent of your sleep perception.
          </div>
          <div className="mt-2 text-sm text-neutral-600">This data feeds the RRSM Engine.</div>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-700">{error}</div>
      ) : null}

      <section className="rounded-xl border p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Today ({todayYMD})</h2>
          {loading ? <span className="text-base text-neutral-500">Loading…</span> : null}
        </div>

        <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-sm font-bold text-neutral-900">Timing guide for common sleep drivers</div>
          <div className="mt-1 text-sm text-neutral-700">
            The left column is stricter and fits more sensitive RB2 prototypes. The right column is more flexible and fits less sensitive people.
          </div>
          <div className="mt-2 text-sm text-neutral-600">
            These are approximate thresholds only. Keep logging so SleepFixMe can learn your personal cut-off times.
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-neutral-50">
                  <th className="border p-2 text-left">Driver</th>
                  <th className="border p-2 text-left">Sensitive RB2 prototype</th>
                  <th className="border p-2 text-left">Less sensitive prototype</th>
                </tr>
              </thead>
              <tbody>
                {habitGuide.map((item) => (
                  <tr key={String(item.field)}>
                    <td className="border p-2 font-semibold align-top">{item.label}</td>
                    <td className="border p-2 align-top">{item.sensitive}</td>
                    <td className="border p-2 align-top">{item.nonsensitive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-sm text-neutral-700">
            Monitor these timings for yourself. Your own threshold matters more than a generic rule.
          </div>
        </div>

        <div className="mt-4 grid gap-3">
        <HabitCheckbox date={todayYMD} field="caffeine_after_2pm" label="Caffeine" />
        <HabitCheckbox date={todayYMD} field="alcohol" label="Alcohol" />
        <HabitCheckbox date={todayYMD} field="exercise" label="Heavy exercise" />
        <HabitCheckbox date={todayYMD} field="screens_last_hour" label="Screens / heavy lights" />
        </div>

        <p className="text-base text-neutral-500 mt-4">
          Tip: These are “binary” signals used for pattern detection later. You don’t need to overthink them.
        </p>
      </section>

      <section className="mt-6 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Last 7 days</h2>
        <p className="text-base text-neutral-600 mt-2">Shows what you ticked on each day (not asking you to remember anything).</p>

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
                <div className="text-base text-neutral-600">
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


