"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DiaryEntry = {
  id?: string;
  user_id?: string;
  entry_date: string;
  before_sleep: string;
  during_night: string;
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
    during_night: "",
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
    Number(Boolean(entry.during_night.trim()));

  if (filled >= 2) return "Saved diary entry";
  if (filled >= 1) return "Partial diary entry";
  return "No diary entry";
}

export default function HabitsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [todayYMD, setTodayYMD] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [diaryByDate, setDiaryByDate] = useState<Record<string, DiaryEntry>>({});
  const [draftBeforeSleep, setDraftBeforeSleep] = useState("");
  const [draftDuringNight, setDraftDuringNight] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [diarySavedMessage, setDiarySavedMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTodayYMD(toYMD(new Date()));
  }, []);

  const fromYMD = useMemo(
    () => (todayYMD ? addDays(todayYMD, -6) : ""),
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
        .select("id,user_id,entry_date,before_sleep,during_night")
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
          during_night: row.during_night ?? "",
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

  useEffect(() => {
    if (!selectedDate) return;

    const savedEntry = diaryByDate[selectedDate] ?? emptyDiary(selectedDate);
    setDraftBeforeSleep(savedEntry.before_sleep);
    setDraftDuringNight(savedEntry.during_night);
    setIsDirty(false);
    setDiarySavedMessage("");
  }, [selectedDate, diaryByDate]);

  function updateDraftBeforeSleep(value: string) {
    setDraftBeforeSleep(value);
    setDiarySavedMessage("");
    setIsDirty(true);
  }

  function updateDraftDuringNight(value: string) {
    setDraftDuringNight(value);
    setDiarySavedMessage("");
    setIsDirty(true);
  }

  async function saveDiary() {
    if (!userId || !selectedDate) return;

    setSaving(true);
    setError(null);

    const payload = {
      user_id: userId,
      entry_date: selectedDate,
      before_sleep: draftBeforeSleep.trim() || null,
      during_night: draftDuringNight.trim() || null,
      what_helped: null,
      personal_note: null,
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

    setDiaryByDate((prev) => ({
      ...prev,
      [selectedDate]: {
        ...(prev[selectedDate] ?? emptyDiary(selectedDate)),
        id: existing?.id ?? prev[selectedDate]?.id,
        user_id: userId,
        entry_date: selectedDate,
        before_sleep: draftBeforeSleep,
        during_night: draftDuringNight,
      },
    }));

    setDiarySavedMessage("Saved ✅");
    setIsDirty(false);
    setSaving(false);
    window.setTimeout(() => setDiarySavedMessage(""), 2500);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-base">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Sleep Diary</h1>
        <p className="mt-2 text-base text-neutral-600">
          Record what happened before sleep and during the night. Over time, this
          becomes a useful history for spotting what is helping or working
          against your sleep.
        </p>

        <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-sm font-bold text-neutral-900">
            Diary page = nightly observations and pattern tracking.
          </div>
          <div className="mt-1 text-sm text-neutral-700">
            Keep it simple: write what happened before bed and what happened
            during the night.
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
              Choose the day/night, write the entry, then save before leaving.
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
              value={draftBeforeSleep}
              onChange={(e) => updateDraftBeforeSleep(e.target.value)}
              rows={4}
              className="w-full rounded-lg border p-3 text-base"
              placeholder="Example: screen time, food, drink, caffeine, exercise, stress, relaxation, room temperature..."
            />
          </label>

          <label className="grid gap-2">
            <span className="font-semibold">During the night / after waking</span>
            <textarea
              value={draftDuringNight}
              onChange={(e) => updateDraftDuringNight(e.target.value)}
              rows={5}
              className="w-full rounded-lg border p-3 text-base"
              placeholder="Example: woke up at 3am, bathroom trip, cold/hot, noise, pain, dreams, racing thoughts, how you felt after waking..."
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveDiary}
              disabled={!userId || !selectedDate || saving}
              className="rounded-xl bg-black px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save diary entry before leaving"}
            </button>

            {isDirty ? (
              <span className="text-sm font-semibold text-red-700">
                Unsaved changes
              </span>
            ) : null}

            {diarySavedMessage ? (
              <span className="text-sm font-semibold text-green-700">
                {diarySavedMessage}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-xl border bg-white p-4">
        <h2 className="text-xl font-semibold">Diary history — last 7 days</h2>
        <p className="mt-2 text-base text-neutral-600">
          Only saved diary entries appear here.
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

                  {entry.before_sleep.trim() || entry.during_night.trim() ? (
                    <div className="mt-2 grid gap-1 text-sm text-neutral-700">
                      {entry.before_sleep.trim() ? (
                        <div>
                          <strong>Before sleep:</strong> {entry.before_sleep}
                        </div>
                      ) : null}

                      {entry.during_night.trim() ? (
                        <div>
                          <strong>During the night:</strong>{" "}
                          {entry.during_night}
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
