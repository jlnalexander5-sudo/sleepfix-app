"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type SleepLogRow = {
  id: string;
  user_id: string;
  sleep_start: string | null;
  sleep_end: string | null;
  quality: number | null;
  notes: string | null;
};

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [row, setRow] = useState<SleepLogRow | null>(null);

  const [sleepStart, setSleepStart] = useState("");
  const [sleepEnd, setSleepEnd] = useState("");
  const [quality, setQuality] = useState<number>(3);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setStatus("Checking session...");

      const { data: userData, error: userErr } =
        await supabase.auth.getUser();

      if (userErr || !userData.user) {
        if (!cancelled) {
          setStatus("Not logged in.");
          setLoading(false);
        }
        return;
      }

      const userId = userData.user.id;

      const { data, error } = await supabase
        .from("sleep_logs")
        .select("id,user_id,sleep_start,sleep_end,quality,notes")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SleepLogRow>();

      if (error) {
        if (!cancelled) {
          setError(error.message);
          setStatus("Failed to load sleep log.");
          setLoading(false);
        }
        return;
      }

      if (data) {
        setRow(data);
        setSleepStart(data.sleep_start ?? "");
        setSleepEnd(data.sleep_end ?? "");
        setQuality(data.quality ?? 3);
        setNotes(data.notes ?? "");
      }

      if (!cancelled) {
        setStatus("Ready.");
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function save() {
    setStatus("Saving...");
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setStatus("Not logged in.");
      return;
    }

    const payload = {
      user_id: user.id,
      sleep_start: sleepStart || null,
      sleep_end: sleepEnd || null,
      quality,
      notes: notes || null,
    };

    let result;

    if (row) {
      result = await supabase
        .from("sleep_logs")
        .update(payload)
        .eq("id", row.id)
        .select()
        .single<SleepLogRow>();
    } else {
      result = await supabase
        .from("sleep_logs")
        .insert(payload)
        .select()
        .single<SleepLogRow>();
    }

    if (result.error) {
      setError(result.error.message);
      setStatus("Save failed.");
      return;
    }

    setRow(result.data);
    setStatus("Saved ✅");
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Sleep log
      </h1>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        Status: {status}
        {error && (
          <div style={{ marginTop: 8, color: "salmon" }}>
            Error: {error}
          </div>
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
          <label style={{ display: "block", marginBottom: 12 }}>
            Bed time
            <input
              type="datetime-local"
              value={sleepStart}
              onChange={(e) => setSleepStart(e.target.value)}
              style={{ display: "block", marginTop: 4 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 12 }}>
            Wake time
            <input
              type="datetime-local"
              value={sleepEnd}
              onChange={(e) => setSleepEnd(e.target.value)}
              style={{ display: "block", marginTop: 4 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 12 }}>
            Sleep quality (1–5)
            <input
              type="number"
              min={1}
              max={5}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              style={{ display: "block", marginTop: 4 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 12 }}>
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>

          <button
            onClick={save}
            style={{
              marginTop: 8,
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Save
          </button>
        </div>
      )}
    </main>
  );
}
