"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DiaryEntry = {
  id?: string;
  user_id?: string;
  entry_date: string;
  day_good_factors: string;
  day_bad_factors: string;
  night_good_factors: string;
  night_bad_factors: string;
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
    day_good_factors: "",
    day_bad_factors: "",
    night_good_factors: "",
    night_bad_factors: "",
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
    Number(Boolean(entry.day_good_factors.trim())) +
    Number(Boolean(entry.day_bad_factors.trim())) +
    Number(Boolean(entry.night_good_factors.trim())) +
    Number(Boolean(entry.night_bad_factors.trim()));

  if (filled >= 3) return "Detailed diary entry";
  if (filled >= 1) return "Partial diary entry";
  return "No diary entry";
}

function hasDiaryEntry(entry: DiaryEntry) {
  return Boolean(
    entry.day_good_factors.trim() ||
      entry.day_bad_factors.trim() ||
      entry.night_good_factors.trim() ||
      entry.night_bad_factors.trim(),
  );
}

export default function HabitsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [todayYMD, setTodayYMD] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [diaryByDate, setDiaryByDate] = useState<Record<string, DiaryEntry>>({});
  const [draftDayGoodFactors, setDraftDayGoodFactors] = useState("");
  const [draftDayBadFactors, setDraftDayBadFactors] = useState("");
  const [draftNightGoodFactors, setDraftNightGoodFactors] = useState("");
  const [draftNightBadFactors, setDraftNightBadFactors] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [diarySavedMessage, setDiarySavedMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTodayYMD(toYMD(new Date()));
  }, []);

  const fromYMD = useMemo(
    () => (todayYMD ? addDays(todayYMD, -29) : ""),
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
          "id,user_id,entry_date,day_good_factors,day_bad_factors,night_good_factors,night_bad_factors",
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
          day_good_factors: row.day_good_factors ?? "",
          day_bad_factors: row.day_bad_factors ?? "",
          night_good_factors: row.night_good_factors ?? "",
          night_bad_factors: row.night_bad_factors ?? "",
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
    setDraftDayGoodFactors(savedEntry.day_good_factors);
    setDraftDayBadFactors(savedEntry.day_bad_factors);
    setDraftNightGoodFactors(savedEntry.night_good_factors);
    setDraftNightBadFactors(savedEntry.night_bad_factors);
    setIsDirty(false);
    setDiarySavedMessage("");
  }, [selectedDate, diaryByDate]);

  function updateDraftDayGoodFactors(value: string) {
    setDraftDayGoodFactors(value);
    setDiarySavedMessage("");
    setIsDirty(true);
  }

  function updateDraftDayBadFactors(value: string) {
    setDraftDayBadFactors(value);
    setDiarySavedMessage("");
    setIsDirty(true);
  }

  function updateDraftNightGoodFactors(value: string) {
    setDraftNightGoodFactors(value);
    setDiarySavedMessage("");
    setIsDirty(true);
  }

  function updateDraftNightBadFactors(value: string) {
    setDraftNightBadFactors(value);
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
      day_good_factors: draftDayGoodFactors.trim() || null,
      day_bad_factors: draftDayBadFactors.trim() || null,
      night_good_factors: draftNightGoodFactors.trim() || null,
      night_bad_factors: draftNightBadFactors.trim() || null,
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
        day_good_factors: draftDayGoodFactors,
        day_bad_factors: draftDayBadFactors,
        night_good_factors: draftNightGoodFactors,
        night_bad_factors: draftNightBadFactors,
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
          Record the specific factors that may have helped or disrupted sleep so
          you can compare good and poor nights and identify recurring patterns
          over time.
        </p>

        <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-sm font-bold text-neutral-900">
            Diary page = factor tracking and future reference.
          </div>
          <div className="mt-1 text-sm text-neutral-700">
            Focus on specific elements, not conditions. For example: write
            “used two blankets and a doona”, not just “too warm”.
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
              Choose the day/night, write the factor notes, then save before
              leaving.
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

        <div className="mt-5 grid gap-6">
          <section className="rounded-xl border border-neutral-200 p-4">
            <h3 className="text-lg font-bold">During the Day</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Record specific factors from the day that may have influenced sleep.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="font-semibold">Good Factors</span>
                <span className="text-sm text-neutral-600">
                  What factors may have contributed to a good night's sleep?
                  Write those factors in for future reference.
                </span>
                <textarea
                  value={draftDayGoodFactors}
                  onChange={(e) => updateDraftDayGoodFactors(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border p-3 text-base"
                  placeholder="Examples: finished dinner at 5pm; went for a 10-minute walk after dinner; did some gardening at 8pm; read a book before bed; turned the heater off at 7pm..."
                />
              </label>

              <label className="grid gap-2">
                <span className="font-semibold">Bad Factors</span>
                <span className="text-sm text-neutral-600">
                  What factors may have contributed to a poor night's sleep?
                  Write those factors in for future reference.
                </span>
                <textarea
                  value={draftDayBadFactors}
                  onChange={(e) => updateDraftDayBadFactors(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border p-3 text-base"
                  placeholder="Examples: ate dinner at 8pm instead of 5pm; exercised too late; drank tea at 9pm instead of 4pm; smoked at 10pm instead of finishing at 5pm; watched a horror movie..."
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 p-4">
            <h3 className="text-lg font-bold">During the Night / Just Before Bedtime</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Record specific factors from just before bedtime or during the night that appeared to help or disrupt sleep.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="font-semibold">Good Factors</span>
                <span className="text-sm text-neutral-600">
                  What factors do you think contributed to a good night's sleep?
                  Record the elements that appeared to help.
                </span>
                <textarea
                  value={draftNightGoodFactors}
                  onChange={(e) => updateDraftNightGoodFactors(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border p-3 text-base"
                  placeholder="Examples: used two blankets instead of one; opened the window slightly; used a different pillow; removed an extra blanket; rearranged bedding and slept comfortably afterwards..."
                />
              </label>

              <label className="grid gap-2">
                <span className="font-semibold">Bad Factors</span>
                <span className="text-sm text-neutral-600">
                  What factors do you think contributed to a poor night's sleep?
                  Record the elements that appeared to disturb sleep.
                </span>
                <textarea
                  value={draftNightBadFactors}
                  onChange={(e) => updateDraftNightBadFactors(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border p-3 text-base"
                  placeholder="Examples: added an extra bed cover before sleep; used doona plus two blankets plus main bed cover; heater stayed on too long; pillow was uncomfortable; bedding needed rearranging several times..."
                />
              </label>
            </div>
          </section>

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
        <h2 className="text-xl font-semibold">Diary History</h2>
        <p className="mt-2 text-base text-neutral-600">
          Only recorded diary entries are shown. Compare good and poor nights. Look for factors that stayed the same and factors that changed.
        </p>

        <div className="mt-4 grid gap-3">
          {dayList
            .slice()
            .reverse()
            .map((d) => diaryByDate[d] ?? emptyDiary(d))
            .filter(hasDiaryEntry)
            .map((entry) => (
              <div key={entry.entry_date} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold">
                    {formatDisplayDate(entry.entry_date)}
                  </div>
                  <div className="text-sm text-neutral-600">
                    {diarySignal(entry)}
                  </div>
                </div>

                <div className="mt-2 grid gap-2 text-sm text-neutral-700">
                  {entry.day_good_factors.trim() ? (
                    <div>
                      <strong>Day good factors:</strong>{" "}
                      {entry.day_good_factors}
                    </div>
                  ) : null}

                  {entry.day_bad_factors.trim() ? (
                    <div>
                      <strong>Day bad factors:</strong>{" "}
                      {entry.day_bad_factors}
                    </div>
                  ) : null}

                  {entry.night_good_factors.trim() ? (
                    <div>
                      <strong>Night good factors:</strong>{" "}
                      {entry.night_good_factors}
                    </div>
                  ) : null}

                  {entry.night_bad_factors.trim() ? (
                    <div>
                      <strong>Night bad factors:</strong>{" "}
                      {entry.night_bad_factors}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

          {!dayList.some((d) => hasDiaryEntry(diaryByDate[d] ?? emptyDiary(d))) ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-neutral-500">
              No diary entries recorded in the last 30 days.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
