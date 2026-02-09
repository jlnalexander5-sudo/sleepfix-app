"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type DailyHabitRow = {
  id: string;
  created_at: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  actual_bedtime: string | null; // "HH:MM:SS"
  actual_wake_time: string | null; // "HH:MM:SS"
  sleep_quality: number | null; // 1..5
  notes: string | null;
};

function toYYYYMMDDLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${date}`;
}

function toHHMM(t: string | null) {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function HabitsPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  // Form fields
  const [date, setDate] = useState<string>(toYYYYMMDDLocal());
  const [bedtime, setBedtime] = useState<string>("");
  const [wakeTime, setWakeTime] = useState<string>("");
  const [quality, setQuality] = useState<number>(3);
  const [notes, setNotes] = useState<string>("");

  const [row, setRow] = useState<DailyHabitRow | null>(null);

  async function loadForDate(uid: string, selectedDate: string) {
    setError(null);
    setStatus("Loading habit...");

    const { data, error: qErr } = await supabase
      .from("daily_habits")
      .select("id, created_at, user_id, date, actual_bedtime, actual_wake_time, sleep_quality, notes")
      .eq("user_id", uid)
      .eq("date", selectedDate)
      .maybeSingle<DailyHabitRow>();

    if (qErr) {
      setError(qErr.message);
      setStatus("Failed to load habit.");
      return;
    }

    if (!data) {
      setRow(null);
      setBedtime("");
      setWakeTime("");
      setQuality(3);
      setNotes("");
      setStatus("No entry for this date yet.");
      return;
    }

    setRow(data);
    setBedtime(toHHMM(data.actual_bedtime));
    setWakeTime(toHHMM(data.actual_wake_time));
    setQuality(data.sleep_quality ?? 3);
    setNotes(data.notes ?? "");
    setStatus("Ready.");
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      setStatus("Checking session...");

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

      await loadForDate(user.id, date);

      if (!cancelled) setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [supabase]); // only run once

  // When date changes (after initial load)
  useEffect(() => {
    if (!userId) return;
    loadForDate(userId, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function save() {
    if (!userId) return;

    setError(null);
    setStatus("Saving...");

    const bed = bedtime ? `${bedtime}:00` : null;
    const wake = wakeTime ? `${wakeTime}:00` : null;

    // Use UPSERT so one row per (user_id, date)
    const { data, error: upErr } = await supabase
      .from("daily_habits")
      .upsert(
        {
          user_id: userId,
          date,
          actual_bedtime: bed,
          actual_wake_time: wake,
          sleep_quality: quality,
          notes: notes || null,
        },
        { onConflict: "user_id,date" }
      )
      .select("id, created_at, user_id, date, actual_bedtime, actual_wake_time, sleep_quality, notes")
      .single<DailyHabitRow>();

    if (upErr) {
      setError(upErr.message);
      setStatus("Save failed.");
      return;
    }

    setRow(data);
    setStatus("Saved ✅");
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Habits</h1>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 8 }}>Status: {status}</div>
        {loading && <div>Loading...</div>}
        {error && <div style={{ marginTop: 8, color: "salmon" }}>Error: {error}</div>}
      </div>

      {!loading && (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <label style={{ display: "block", marginBottom: 12 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>date</div>
            <input
              type="date"
              value={date}
              onChange={(date) => setdate(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8 }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Actual bedtime</div>
              <input
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 8 }}
              />
            </label>

            <label style={{ display: "block" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Actual wake time</div>
              <input
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 8 }}
              />
            </label>
          </div>

          <label style={{ display: "block", marginTop: 12 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Sleep quality (1–5)</div>
            <select
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              style={{ width: "100%", padding: 10, borderRadius: 8 }}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </label>

          <label style={{ display: "block", marginTop: 12 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              style={{ width: "100%", padding: 10, borderRadius: 8 }}
            />
          </label>

          <button
            onClick={save}
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Save
          </button>

          <hr style={{ margin: "18px 0", opacity: 0.2 }} />

          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Raw habit JSON</h3>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, opacity: 0.9 }}>
            {JSON.stringify(row, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}


