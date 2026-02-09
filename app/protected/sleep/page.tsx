"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type SleepLogRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  sleep_quality: number | null; // 1..5
  sleep_latency_min: number | null;
  wake_ups: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function toYYYYMMDDLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function SleepLogPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [date, setDate] = useState<string>("");

  const [row, setRow] = useState<SleepLogRow | null>(null);

  // form fields
  const [sleepQuality, setSleepQuality] = useState<number>(3);
  const [latency, setLatency] = useState<number>(20);
  const [wakeUps, setWakeUps] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setStatus("Checking session...");

      const today = toYYYYMMDDLocal();
      setDate(today);

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

      setStatus("Loading today's sleep log...");

      const { data: existing, error: readErr } = await supabase
        .from("sleep_logs")
        .select(
          "id, user_id, date, sleep_quality, sleep_latency_min, wake_ups, notes, created_at, updated_at"
        )
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle<SleepLogRow>();

      if (readErr) {
        if (!cancelled) {
          setError(readErr.message);
          setStatus("Failed to load sleep log.");
          setLoading(false);
        }
        return;
      }

      // If none exists, create one with safe defaults
      let finalRow = existing;

      if (!finalRow) {
        setStatus("Creating today's sleep log...");
        const { data: created, error: createErr } = await supabase
          .from("sleep_logs")
          .insert({
            user_id: user.id,
            date: today,
            sleep_quality: null,
            sleep_latency_min: null,
            wake_ups: null,
            notes: null,
          })
          .select(
            "id, user_id, date, sleep_quality, sleep_latency_min, wake_ups, notes, created_at, updated_at"
          )
          .single<SleepLogRow>();

        if (createErr) {
          if (!cancelled) {
            setError(createErr.message);
            setStatus("Failed to create sleep log.");
            setLoading(false);
          }
          return;
        }

        finalRow = created;
      }

      if (cancelled) return;

      setRow(finalRow);
      setSleepQuality(finalRow.sleep_quality ?? 3);
      setLatency(finalRow.sleep_latency_min ?? 20);
      setWakeUps(finalRow.wake_ups ?? 0);
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
    if (!userId || !date) return;

    setError(null);
    setStatus("Saving...");

    const payload = {
      user_id: userId,
      date,
      sleep_quality: sleepQuality,
      sleep_latency_min: latency,
      wake_ups: wakeUps,
      notes: notes.trim() ? notes.trim() : null,
    };

    const { data, error: upErr } = await supabase
      .from("sleep_logs")
      .upsert(payload, { onConflict: "user_id,date" })
      .select(
        "id, user_id, date, sleep_quality, sleep_latency_min, wake_ups, notes, created_at, updated_at"
      )
      .single<SleepLogRow>();

    if (upErr) {
      setError(upErr.message);
      setStatus("Save failed.");
      return;
    }

    setRow(data);
    setStatus("Saved ✅");
  }

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Sleep log
      </h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        {email ? `Signed in as ${email}` : "Signed in"}
        {date ? ` • Date: ${date}` : ""}
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
            Today’s outcome
          </h2>

          <label style={{ display: "block", marginBottom: 12 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              Sleep quality (1–5)
            </div>
            <select
              value={sleepQuality}
              onChange={(e) => setSleepQuality(Number(e.target.value))}
              style={{ width: "100%", padding: 10, borderRadius: 8 }}
            >
              <option value={1}>1 — Bad</option>
              <option value={2}>2</option>
              <option value={3}>3 — OK</option>
              <option value={4}>4</option>
              <option value={5}>5 — Great</option>
            </select>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                Sleep latency (minutes)
              </div>
              <select
                value={latency}
                onChange={(e) => setLatency(Number(e.target.value))}
                style={{ width: "100%", padding: 10, borderRadius: 8 }}
              >
                {[5, 10, 20, 30, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "block" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Wake-ups</div>
              <select
                value={wakeUps}
                onChange={(e) => setWakeUps(Number(e.target.value))}
                style={{ width: "100%", padding: 10, borderRadius: 8 }}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ display: "block", marginTop: 12 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Notes (optional)</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything notable? Heat, pain, noise, stress, etc."
              rows={3}
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
            Raw sleep_logs JSON
          </h3>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, opacity: 0.9 }}>
            {JSON.stringify(row, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
