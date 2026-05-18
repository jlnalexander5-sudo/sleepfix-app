"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DiaryEntry = {
  id?: string;
  user_id?: string;
  entry_date: string;
  before_sleep: string;
  what_helped: string;
  during_night: string;
  personal_note: string;
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
    entry_date: date,
    before_sleep: "",
    what_helped: "",
    during_night: "",
    personal_note: "",
  };
}

function formatDisplayDate(ymd: string) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function diarySignal(entry: DiaryEntry) {
  const filled =
    Number(Boolean(entry.before_sleep.trim())) +
    Number(Boolean(entry.what_helped.trim())) +
    Number(Boolean(entry.during_night.trim())) +
    Number(Boolean(entry.personal_note.trim())) +
  Number(Boolean(entry.personal_note.trim()))
  if (filled >= 4) return "Strong diary entry";
  if (filled >= 2) return "Partial diary entry";
  return "No diary entry";
}

export default function HabitsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [todayYMD, setTodayYMD] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [diaryByDate, setDiaryByDate] = useState<Record<string, DiaryEntry>>(
    {},
  );
  const [diarySavedMessage, setDiarySavedMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTodayYMD(toYMD(new Date()));
  }, []);

  const fromYMD = useMemo(
    () => (todayYMD ? addDays(todayYMD, -13) : ""),
    [todayYMD],
  );
  const dayList = useMemo(
    () => (todayYMD ? buildDayList(fromYMD, todayYMD) : []),
    [fromYMD, todayYMD],
  );

  useEffect(() => {
    if (todayYMD && !selectedDate) setSelectedDate(todayYMD);
  }, [todayYMD, selectedDate]);

  useEffect(() => {
    let cancelled = false;

    async function loadDiary() {
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
        .from("sleep_diary_entries")
        .select(
          "id,user_id,entry_date,before_sleep,what_helped,during_night,personal_note,morning_feeling",
        )
        .eq("user_id", uid)
        .gte("entry_date", fromYMD)
        .lte("entry_date", todayYMD)
        .order("entry_date", { ascending: true });

      if (fetchErr) {
        if (!cancelled) {
          setError(fetchErr.message);
          setLoading(false);
        }
        return;
      }

      const map: Record<string, DiaryEntry> = {};

      dayList.forEach((d) => {
        map[d] = emptyDiary(d);
      });

      (data ?? []).forEach((row: any) => {
        map[row.entry_date] = {
          id: row.id,
          user_id: row.user_id,
          entry_date: row.entry_date,
          before_sleep: row.before_sleep ?? "",
          what_helped: row.what_helped ?? "",
          during_night: row.during_night ?? "",
          personal_note: row.personal_note ?? "",
          morning_feeling: row.morning_feeling ?? "",
        };
      });

      if (!cancelled) {
        setDiaryByDate(map);
        setLoading(false);
      }
    }

    loadDiary();

    return () => {
      cancelled = true;
    };
  }, [supabase, fromYMD, todayYMD, dayList]);

  const selectedDiary =
    diaryByDate[selectedDate] ?? emptyDiary(selectedDate || todayYMD);

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

  async function saveDiary() {
    if (!userId || !selectedDate) return;

    setSaving(true);
    setError(null);

    const entry = diaryByDate[selectedDate] ?? emptyDiary(selectedDate);

    const payload = {
      user_id: userId,
      entry_date: selectedDate,
      before_sleep: entry.before_sleep.trim() || null,
      what_helped: entry.what_helped.trim() || null,
      during_night: entry.during_night.trim() || null,
      personal_note: entry.personal_note.trim() || null,
      morning_feeling: entry.morning_feeling || null,
    };

    const { data: existing, error: existingErr } = await supabase
      .from("sleep_diary_entries")
      .select("id")
      .eq("user_id", userId)
      .eq("entry_date", selectedDate)
      .maybeSingle();

    if (existingErr) {
      setError(existingErr.message);
      setSaving(false);
      return;
    }

    const result = existing?.id
      ? await supabase
          .from("sleep_diary_entries")
          .update(payload)
          .eq("id", existing.id)
      : await supabase.from("sleep_diary_entries").insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setDiarySavedMessage("Diary saved.");
    setSaving(false);
    window.setTimeout(() => setDiarySavedMessage(""), 2500);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-base">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Sleep Diary</h1>
        <p className="mt-2 text-base text-neutral-600">
          Record your nightly observations, thoughts, and sleep patterns. Over
          time, this becomes a useful history for spotting what is helping or
          working against your sleep.
        </p>

        <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-sm font-bold text-neutral-900">
            Diary page = nightly observations and pattern tracking.
          </div>
          <div className="mt-1 text-sm text-neutral-700">
            Use this space to record what happened before sleep, during the
            night, and how you felt the next day.
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Diary entry</h2>
            <p className="mt-1 text-base text-neutral-600">
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
                    {formatDisplayDate(d)}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4">
          <label className="grid gap-2">
            <span className="font-semibold">Before sleep</span>
            <textarea
              value={selectedDiary.before_sleep}
              onChange={(e) => updateDiaryField("before_sleep", e.target.value)}
              rows={4}
              className="w-full rounded-lg border p-3 text-base"
              placeholder="Example: late screen time, heavy meal, racing thoughts, relaxed evening, warm room..."
            />
          </label>

          <label className="grid gap-2">
            <span className="font-semibold">What seemed to help?</span>
            <textarea
              value={selectedDiary.what_helped}
              onChange={(e) => updateDiaryField("what_helped", e.target.value)}
              rows={3}
              className="w-full rounded-lg border p-3 text-base"
              placeholder="Example: cooler room, earlier bedtime, no caffeine, walk, breathing, less screen time..."
            />
          </label>

          <label className="grid gap-2">
            <span className="font-semibold">During the night</span>
            <textarea
              value={selectedDiary.during_night}
              onChange={(e) => updateDiaryField("during_night", e.target.value)}
              rows={3}
              className="w-full rounded-lg border p-3 text-base"
              placeholder="Example: woke up at 3am, bathroom trip, heat, noise, pain, dreams, restlessness..."
            />
          </label>

          <label className="grid gap-2">
            <span className="font-semibold">
              My own notes / lesson from this night
            </span>
            <textarea
              value={selectedDiary.personal_note}
              onChange={(e) =>
                updateDiaryField("personal_note", e.target.value)
              }
              rows={4}
              className="w-full rounded-lg border p-3 text-base"
              placeholder="Example: I woke up to use the bathroom 3 times. I probably drank too many fluids before bed. Next time I should stop drinking after 7pm if sleeping at 10pm."
            />
          </label>

            <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={saveDiary}
              disabled={!userId || !selectedDate || saving}
              className="rounded-xl bg-black px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save diary entry"}
            </button>
            {diarySavedMessage ? (
              <span className="text-sm font-semibold text-green-700">
                {diarySavedMessage}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-xl border bg-white p-4">
        <h2 className="text-xl font-semibold">Diary history — last 14 days</h2>
        <p className="mt-2 text-base text-neutral-600">
          A short history of what you recorded, so patterns can start to stand
          out.
        </p>

        <div className="mt-4 grid gap-3">
          {dayList
            .slice()
            .reverse()
            .map((d) => {
              const entry = diaryByDate[d] ?? emptyDiary(d);

              return (
                <div key={d} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold">{formatDisplayDate(d)}</div>
                    <div className="text-sm text-neutral-600">
                      {diarySignal(entry)}
                    </div>
                  </div>

                  {entry.before_sleep.trim() ||
                  entry.what_helped.trim() ||
                  entry.during_night.trim() ||
                  entry.personal_note.trim() ||
                  entry.morning_feeling ? (
                    <div className="mt-2 grid gap-1 text-sm text-neutral-700">
                      {entry.before_sleep.trim() ? (
                        <div>
                          <strong>Before sleep:</strong> {entry.before_sleep}
                        </div>
                      ) : null}
                      {entry.what_helped.trim() ? (
                        <div>
                          <strong>What helped:</strong> {entry.what_helped}
                        </div>
                      ) : null}
                      {entry.during_night.trim() ? (
                        <div>
                          <strong>During the night:</strong>{" "}
                          {entry.during_night}
                        </div>
                      ) : null}
                      {entry.personal_note.trim() ? (
                        <div>
                          <strong>My note:</strong> {entry.personal_note}
                        </div>
                      ) : null}
                      {entry.morning_feeling ? (
                        <div>
                          <strong>Morning feeling:</strong>{" "}
                          {entry.morning_feeling}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-neutral-500">
                      No diary entry recorded.
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </section>
    </main>
  );
}
