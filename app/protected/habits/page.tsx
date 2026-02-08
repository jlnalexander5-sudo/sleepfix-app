"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type DailyHabitRow = {
  id: string; // uuid
  created_at: string;
  user_id: string;
  day: string; // date (YYYY-MM-DD)
  actual_bedtime: string | null; // time (HH:MM:SS)
  actual_wake_time: string | null; // time (HH:MM:SS)
  sleep_quality: number | null; // 1..5
  notes: string | null;
};

function toYYYYMMDDLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toHHMM(t: string | null) {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t; // "22:30:00" -> "22:30"
}

export default function HabitsPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [row, setRow] = useState<DailyHabitRow | null>(null);

  // Form fields
  const [day, setDay] = useState<string>(toYYYYMMDDLocal());
  const [actualBedtime, setActualBedtime] = useState<string>("");
  const [actualWakeTime, setActualWakeTime] = useState<string>("");
  const [sleepQuality, setSleepQuality] = useState<number>(3);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
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
      setEmail(user.email ?? null);

      const localDay = toYYYYMMDDLocal();
      setDay(localDay);

      setStatus("Loading today's log...");

      // 1) Try read today's row
      const { data: existing, error: readErr } = await supabase
        .from("daily_habits")
        .select(
          "id, created_at, user_id, day, actual_bedtime, actual_wake_time, sleep_quality, notes"
        )
        .eq("user_id", user.id)
        .eq("day", localDay)
        .maybeSingle<DailyHabitRow>();

      if (readErr) {
        if (!cancelled) {
          setError(readErr.message);
          setStatus("Failed to load daily log.");
          setLoading(false);
        }
        return;
      }

      let finalRow = existing;

      // 2) If missing, create it
      if (!finalRow) {
        setStatus("Creating today's log...");
        const { data: created, error: createErr } = await supabase
          .from("daily_habits")
          .insert({
            user_id: user.id,
            day: localDay,
            sleep_quality: 3,
          })
          .select(
            "id, created_at, user_id, day, actual_bedtime, actual_wake_time, sleep_quality, notes"
          )
          .single<DailyHabitRow>();

        if (createErr) {
          if (!cancelled) {
            setError(createErr.message);
            setStatus("Failed to create daily log.");
            setLoading(false);
          }
          return;
        }

        finalRow = created;
      }

      if (cancelled) return;

      setRow(finalRow);
      setActualBedtime(toHHMM(finalRow.actual_bedtime));
      setActualWakeTime(toHHMM(finalRow.actual_wake_time));
      setSleepQuality(finalRow.sleep_quality ?? 3);
      setNotes(finalRow.notes ?? "");

      setStatus("Ready.");
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function save() {
    if (!userId) return;
    if (!row) return;

    setError(null);
    setStatus("Saving...");

    const bed = actualBedtime ? `${actualBedtime}:00` : null;
    const wake = actualWakeTime ? `${actualWakeTime}:00` : null;

    const { data, error: upErr } = await supabase
      .from("daily_habits")
      .update({
        actual_bedtime: bed,
        actual_wake_time: wake,
        sleep_quality: sleepQuality,
        notes: notes.trim() ? notes.trim() : null,
      })
      .eq("id", row.id)
      .select(
        "id, created_at, user_id, day, actual_bedtime, actual_wake_time, sleep_quality, notes"
      )
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
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Daily Sleep Log
      </h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        {email ? `Signed in as ${email}` : "Signed in"}
      </p>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 8 }}>
          Status: {status}
        </div>

        {loading && <div>Loading...</div>}

        {error && (
          <div style={{ marginTop: 8, color: "salmon" }}>Error: {error}</div>
        )}
      </div>

      {!loading && (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Today (local): {day}
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Actual bedtime</div>
              <input
                type="time"
                value={actualBedtime}
                onChange={(e) => setActualBedtime(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 8 }}
              />
            </label>

            <label style={{ display: "block" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Actual wake time</div>
              <input
                type="time"
                value={actualWakeTime}
                onChange={(e) => setActualWakeTime(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 8 }}
              />
            </label>
          </div>

          <label style={{ display: "block", marginTop: 12 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              Sleep quality (1–5)
            </div>
            <input
              type="range"
              min={1}
              max={5}
              value={sleepQuality}
              onChange={(e) => setSleepQuality(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 6 }}>
              Selected: {sleepQuality}
            </div>
          </label>

          <label style={{ display: "block", marginTop: 12 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes (caffeine, exercise, stress, naps, etc.)"
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

          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Raw daily_habits JSON
          </h3>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, opacity: 0.9 }}>
            {JSON.stringify(row, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}