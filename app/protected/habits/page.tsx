"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type DailyHabitRow = {
  id: string; // uuid
  user_id: string; // uuid
  created_at: string;
  date: string; // YYYY-MM-DD
  caffeine_after_2pm: boolean | null;
  alcohol: boolean | null;
  exercise: boolean | null;
  screens_last_hour: boolean | null;
};

function toYYYYMMDDLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function HabitsPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [date, setDate] = useState<string>(toYYYYMMDDLocal());
  const [row, setRow] = useState<DailyHabitRow | null>(null);

  // form fields
  const [caffeineAfter2pm, setCaffeineAfter2pm] = useState(false);
  const [alcohol, setAlcohol] = useState(false);
  const [exercise, setExercise] = useState(false);
  const [screensLastHour, setScreensLastHour] = useState(false);

  // Load auth + today's row
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
      setStatus("Loading today's habits...");

      const today = toYYYYMMDDLocal();
      setDate(today);

      const { data: existing, error: readErr } = await supabase
        .from("daily_habits")
        .select(
          "id, user_id, created_at, date, caffeine_after_2pm, alcohol, exercise, screens_last_hour"
        )
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle<DailyHabitRow>();

      if (readErr) {
        if (!cancelled) {
          setError(readErr.message);
          setStatus("Failed to load daily habits.");
          setLoading(false);
        }
        return;
      }

      let finalRow = existing;

      // Create if missing
      if (!finalRow) {
        setStatus("Creating today's habits row...");

        const { data: created, error: createErr } = await supabase
          .from("daily_habits")
          .insert({
            user_id: user.id,
            date: today,
            caffeine_after_2pm: false,
            alcohol: false,
            exercise: false,
            screens_last_hour: false,
          })
          .select(
            "id, user_id, created_at, date, caffeine_after_2pm, alcohol, exercise, screens_last_hour"
          )
          .single<DailyHabitRow>();

        if (createErr) {
          if (!cancelled) {
            setError(createErr.message);
            setStatus("Failed to create daily habits row.");
            setLoading(false);
          }
          return;
        }

        finalRow = created;
      }

      if (cancelled) return;

      setRow(finalRow);
      setCaffeineAfter2pm(!!finalRow.caffeine_after_2pm);
      setAlcohol(!!finalRow.alcohol);
      setExercise(!!finalRow.exercise);
      setScreensLastHour(!!finalRow.screens_last_hour);

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

    setError(null);
    setStatus("Saving...");

    const payload = {
      user_id: userId,
      date,
      caffeine_after_2pm: caffeineAfter2pm,
      alcohol,
      exercise,
      screens_last_hour: screensLastHour,
    };

    const { data, error: upErr } = await supabase
      .from("daily_habits")
      .upsert(payload, { onConflict: "user_id,date" })
      .select(
        "id, user_id, created_at, date, caffeine_after_2pm, alcohol, exercise, screens_last_hour"
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
        Daily habits
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        {email ? `Signed in as ${email}` : "Signed in"} • Date: {date}
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
            Today’s checklist
          </h2>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={caffeineAfter2pm}
              onChange={(e) => setCaffeineAfter2pm(e.target.checked)}
            />
            Caffeine after 2pm
          </label>

          <label
            style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}
          >
            <input
              type="checkbox"
              checked={alcohol}
              onChange={(e) => setAlcohol(e.target.checked)}
            />
            Alcohol
          </label>

          <label
            style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}
          >
            <input
              type="checkbox"
              checked={exercise}
              onChange={(e) => setExercise(e.target.checked)}
            />
            Exercise
          </label>

          <label
            style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}
          >
            <input
              type="checkbox"
              checked={screensLastHour}
              onChange={(e) => setScreensLastHour(e.target.checked)}
            />
            Screens in the last hour
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
