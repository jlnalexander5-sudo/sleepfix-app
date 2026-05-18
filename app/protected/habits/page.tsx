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

type DiaryEntry = {
  date: string;
  sleepContext: string;
  whatHelped: string;
  whatWorkedAgainst: string;
  stressLevel: string;
  energyNextDay: string;
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

function emptyDiary(date: string): DiaryEntry {
  return {
    date,
    sleepContext: "",
    whatHelped: "",
    whatWorkedAgainst: "",
    stressLevel: "",
    energyNextDay: "",
  };
}

function diaryStorageKey(userId: string, date: string) {
  return `sleepfixme-diary-v1:${userId}:${date}`;
}

type HabitGuide = {
  field: keyof DailyHabitRow;
  label: string;
  explanation: string;
};

const habitGuide: HabitGuide[] = [
  {
    field: "caffeine_after_2pm",
    label: "Caffeine after 2pm",
    explanation: "Can affect latency, alertness, and sleep depth for some people.",
  },
  {
    field: "alcohol",
    label: "Alcohol",
    explanation: "Can fragment sleep and reduce recovery quality even when it helps sleep onset.",
  },
  {
    field: "exercise",
    label: "Heavy exercise",
    explanation: "Can improve sleep for some people, but late intense exercise may increase arousal.",
  },
  {
    field: "screens_last_hour",
    label: "Screens / heavy lights",
    explanation: "Can delay sleep onset or increase mental activation before bed.",
  },
];

export default function HabitsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [todayYMD, setTodayYMD] = useState<string>("");

  useEffect(() => {
    setTodayYMD(toYMD(new Date()));
  }, []);

  // Diary is more useful over two weeks than seven days.
  const fromYMD = useMemo(() => (todayYMD ? addDays(todayYMD, -13) : ""), [todayYMD]);
  const dayList = useMemo(() => (todayYMD ? buildDayList(fromYMD, todayYMD) : []), [fromYMD, todayYMD]);

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowsByDate, setRowsByDate] = useState<Record<string, DailyHabitRow>>({});
  const [diaryByDate, setDiaryByDate] = useState<Record<string, DiaryEntry>>({});
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [diarySavedMessage, setDiarySavedMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (todayYMD && !selectedDate) setSelectedDate(todayYMD);
  }, [todayYMD, selectedDate]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!todayYMD || !fromYMD) return;

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

      const habitMap: Record<string, DailyHabitRow> = {};
      (data ?? []).forEach((r: any) => {
        habitMap[r.date] = r as DailyHabitRow;
      });

      dayList.forEach((d) => {
        if (!habitMap[d]) habitMap[d] = { user_id: uid, date: d };
      });

      const diaryMap: Record<string, DiaryEntry> = {};
      dayList.forEach((d) => {
        try {
          const raw = window.localStorage.getItem(diaryStorageKey(uid, d));
          diaryMap[d] = raw ? ({ ...emptyDiary(d), ...JSON.parse(raw), date: d } as DiaryEntry) : emptyDiary(d);
        } catch {
          diaryMap[d] = emptyDiary(d);
        }
      });

      if (!cancelled) {
        setRowsByDate(habitMap);
        setDiaryByDate(diaryMap);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, fromYMD, todayYMD, dayList]);

  const selectedDiary = diaryByDate[selectedDate] ?? emptyDiary(selectedDate || todayYMD);

  function updateDiaryField(field: keyof DiaryEntry, value: string) {
    if (!selectedDate) return;

    setDiarySavedMessage("");
    setDiaryByDate((prev) => ({
      ...prev,
      [selectedDate]: {
        ...(prev[selectedDate] ?? emptyDiary(selectedDate)),
        [field]: value,
      },
    }));
  }

  function saveDiary() {
    if (!userId || !selectedDate) return;

    const entry = diaryByDate[selectedDate] ?? emptyDiary(selectedDate);
    window.localStorage.setItem(diaryStorageKey(userId, selectedDate), JSON.stringify(entry));

    setDiarySavedMessage("Diary saved on this device.");
    window.setTimeout(() => setDiarySavedMessage(""), 2500);
  }

  async function setHabit(date: string, field: keyof DailyHabitRow, value: boolean) {
    if (!userId || !date) return;

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

  function HabitCheckbox(props: { date: string; field: keyof DailyHabitRow; label: string; explanation: string }) {
    const row = rowsByDate[props.date];
    const checked = Boolean(row?.[props.field]);

    return (
      <label className="flex items-start gap-3 rounded-lg border p-3 bg-white">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={checked}
          onChange={(e) => setHabit(props.date, props.field, e.target.checked)}
          disabled={!userId || loading || !props.date}
        />
        <div className="flex-1">
          <div className="font-semibold">{props.label}</div>
          <div className="text-sm text-neutral-600">{props.explanation}</div>
          {savingKey === `${props.date}:${String(props.field)}` ? (
            <div className="text-sm text-neutral-500 mt-1">Saving…</div>
          ) : null}
        </div>
      </label>
    );
  }

  function diarySignal(entry: DiaryEntry) {
    const filled =
      Number(Boolean(entry.sleepContext.trim())) +
      Number(Boolean(entry.whatHelped.trim())) +
      Number(Boolean(entry.whatWorkedAgainst.trim())) +
      Number(Boolean(entry.stressLevel)) +
      Number(Boolean(entry.energyNextDay));

    if (filled >= 4) return "Strong diary entry";
    if (filled >= 2) return "Partial diary entry";
    return "No diary notes yet";
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-base">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Sleep Diary</h1>
        <p className="text-base text-neutral-600 mt-2">
          Record your nightly observations, thoughts, and sleep patterns. Over time, this becomes a useful history for
          spotting what is helping or working against your sleep.
        </p>

        <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-sm font-bold text-neutral-900">Diary page = nightly observations and pattern tracking.</div>
          <div className="mt-1 text-sm text-neutral-700">
            Use this space to record what happened before sleep, during the night, and how you felt the next day.
          </div>
          <div className="mt-2 text-sm text-neutral-600">
            The checkboxes are kept as quick signals, but the main value is the diary history.
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-700">{error}</div>
      ) : null}

      <section className="rounded-xl border p-4 bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Diary entry</h2>
            <p className="text-base text-neutral-600 mt-1">
              Choose the day/night and write what actually happened.
            </p>
          </div>

          <label className="text-sm font-semibold">
            Date
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="ml-2 rounded-lg border px-3 py-2 text-base"
              disabled={loading || dayList.length === 0}
            >
              {dayList
                .slice()
                .reverse()
                .map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4">
          <label className="grid gap-2">
            <span className="font-semibold">What happened before sleep?</span>
            <textarea
              value={selectedDiary.sleepContext}
              onChange={(e) => updateDiaryField("sleepContext", e.target.value)}
              rows={4}
              className="w-full rounded-lg border p-3 text-base"
              placeholder="Example: late screen time, heavy meal, racing thoughts, relaxed evening, warm room..."
            />
          </label>

          <label className="grid gap-2">
            <span className="font-semibold">What helped?</span>
            <textarea
              value={selectedDiary.whatHelped}
              onChange={(e) => updateDiaryField("whatHelped", e.target.value)}
              rows={3}
              className="w-full rounded-lg border p-3 text-base"
              placeholder="Example: cooler room, earlier bedtime, no caffeine, walk, breathing, less screen time..."
            />
          </label>

          <label className="grid gap-2">
            <span className="font-semibold">What worked against your sleep?</span>
            <textarea
              value={selectedDiary.whatWorkedAgainst}
              onChange={(e) => updateDiaryField("whatWorkedAgainst", e.target.value)}
              rows={3}
              className="w-full rounded-lg border p-3 text-base"
              placeholder="Example: stress, heat, noise, pain, alcohol, late work, late food..."
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="font-semibold">Stress level today (1–10)</span>
              <input
                type="number"
                min="1"
                max="10"
                value={selectedDiary.stressLevel}
                onChange={(e) => updateDiaryField("stressLevel", e.target.value)}
                className="w-full rounded-lg border p-3 text-base"
                placeholder="1–10"
              />
            </label>

            <label className="grid gap-2">
              <span className="font-semibold">Energy level next day (1–10)</span>
              <input
                type="number"
                min="1"
                max="10"
                value={selectedDiary.energyNextDay}
                onChange={(e) => updateDiaryField("energyNextDay", e.target.value)}
                className="w-full rounded-lg border p-3 text-base"
                placeholder="1–10"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={saveDiary}
              disabled={!userId || !selectedDate}
              className="rounded-xl bg-black px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              Save diary entry
            </button>
            {diarySavedMessage ? <span className="text-sm font-semibold text-green-700">{diarySavedMessage}</span> : null}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-xl border p-4 bg-white">
        <h2 className="text-xl font-semibold">Quick sleep factors</h2>
        <p className="text-base text-neutral-600 mt-2">
          These are quick checkboxes. They support pattern detection, but they are secondary to the diary notes.
        </p>

        <div className="mt-4 grid gap-3">
          {habitGuide.map((item) => (
            <HabitCheckbox
              key={String(item.field)}
              date={selectedDate || todayYMD}
              field={item.field}
              label={item.label}
              explanation={item.explanation}
            />
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border p-4 bg-white">
        <h2 className="text-xl font-semibold">Diary history — last 14 days</h2>
        <p className="text-base text-neutral-600 mt-2">
          This is the useful part: a short history of what you recorded, so patterns can start to stand out.
        </p>

        <div className="mt-4 grid gap-3">
          {dayList
            .slice()
            .reverse()
            .map((d) => {
              const r = rowsByDate[d];
              const entry = diaryByDate[d] ?? emptyDiary(d);
              const tickCount =
                Number(Boolean(r?.caffeine_after_2pm)) +
                Number(Boolean(r?.alcohol)) +
                Number(Boolean(r?.exercise)) +
                Number(Boolean(r?.screens_last_hour));

              return (
                <div key={d} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold">{d}</div>
                    <div className="text-sm text-neutral-600">
                      {diarySignal(entry)} · quick factors: <span className="font-semibold">{tickCount}</span>/4
                    </div>
                  </div>

                  {entry.sleepContext.trim() ||
                  entry.whatHelped.trim() ||
                  entry.whatWorkedAgainst.trim() ||
                  entry.stressLevel ||
                  entry.energyNextDay ? (
                    <div className="mt-2 grid gap-1 text-sm text-neutral-700">
                      {entry.sleepContext.trim() ? <div><strong>Before sleep:</strong> {entry.sleepContext}</div> : null}
                      {entry.whatHelped.trim() ? <div><strong>Helped:</strong> {entry.whatHelped}</div> : null}
                      {entry.whatWorkedAgainst.trim() ? (
                        <div><strong>Worked against:</strong> {entry.whatWorkedAgainst}</div>
                      ) : null}
                      {entry.stressLevel ? <div><strong>Stress:</strong> {entry.stressLevel}/10</div> : null}
                      {entry.energyNextDay ? <div><strong>Next-day energy:</strong> {entry.energyNextDay}/10</div> : null}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-neutral-500">No diary notes recorded for this date.</div>
                  )}
                </div>
              );
            })}
        </div>
      </section>
    </main>
  );
}
