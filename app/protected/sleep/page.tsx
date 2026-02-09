"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type SleepLogRow = {
  id: string; // uuid
  user_id: string; // uuid
  created_at: string;
  sleep_start: string | null; // timestamptz
  sleep_end: string | null; // timestamptz
  quality: number | null; // smallint
  notes: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  // datetime-local expects local time: YYYY-MM-DDTHH:mm
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null;
  // value like "2026-02-09T22:30" interpreted as local time
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function startOfTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function startOfTomorrowLocal(): Date {
  const t = startOfTodayLocal();
  t.setDate(t.getDate() + 1);
  return t;
}

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [row, setRow] = useState<SleepLogRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // update this if we found today's row

  // form fields
  const [sleepStartLocal, setSleepStartLocal] = useState<string>("");
  const [sleepEndLocal, setSleepEndLocal] = useState<string>("");
  const [quality, setQuality] = useState<number>(3);
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

      // Prefer loading "today's" sleep log (based on sleep_start in local day),
      // otherwise load the latest entry for convenience.
      setStatus("Loading sleep log...");

      const todayStart = startOfTodayLocal().toISOString();
      const tomorrowStart = startOfTomorrowLocal().toISOString();

      const { data: todaysRow, error: todayErr } = await supabase
        .from("sleep_logs")
        .select("id, user_id, created_at, sleep_start, sleep_end, quality, notes")
        .eq("user_id", user.id)
        .gte("sleep_start", todayStart)
        .lt("sleep_start", tomorrowStart)
        .order("sleep_start", { ascending: false })
        .limit(1)
        .maybeSingle<SleepLogRow>();

      if (todayErr) {
        if (!cancelled) {
          setError(todayErr.message);
          setStatus("Failed to load sleep logs.");
          setLoading(false);
        }
        return;
      }

      let final = todaysRow;

      if (!final) {
        const { data: latestRow, error: latestErr } = await supabase
          .from("sleep_logs")
          .select("id, user_id, created_at, sleep_start, sleep_end, quality, notes")
          .eq("user_id", user.id)
          .order("sleep_start", { ascending: false })
          .limit(1)
          .maybeSingle<SleepLogRow>();

        if (latestErr) {
          if (!cancelled) {
            setError(latestErr.message);
            setStatus("Failed to load sleep logs.");
            setLoading(false);
          }
          return;
        }

        final = latestRow ?? null;
      }

      if (cancelled) return;

      setRow(final);

      // If we found a row for today, we "edit" it (update by id). Otherwise, Save will create a new one.
      if (todaysRow?.id) setEditingId(todaysRow.id);
      else setEditingId(null);

      // Pre-fill form if we have a row
      if (final) {
        setSleepStartLocal(toDatetimeLocalValue(final.sleep_start));
        setSleepEndLocal(toDatetimeLocalValue(final.sleep_end));
        setQuality(
          typeof final.quality === "number" && final.quality >= 1 && final.quality <= 5
            ? final.quality
            : 3
        );
        setNotes(final.notes ?? "");
      } else {
        setSleepStartLocal("");
        setSleepEndLocal("");
        setQuality(3);
        setNotes("");
      }

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
      sleep_start: fromDatetimeLocalValue(sleepStartLocal),
      sleep_end: fromDatetimeLocalValue(sleepEndLocal),
      quality: Math.max(1, Math.min(5, Number(quality) || 3)),
      notes: notes || null,
    };

    // If we found a "today" row, update it. Otherwise insert a new row.
    if (editingId) {
      const { data, error: upErr } = await supabase
        .from("sleep_logs")
        .update(payload)
        .eq("id", editingId)
        .select("id, user_id, created_at, sleep_start, sleep_end, quality, notes")
        .single<SleepLogRow>();

      if (upErr) {
        setError(upErr.message);
        setStatus("Save failed.");
        return;
      }

      setRow(data);
      setStatus("Saved ✅");
      return;
    }

    const { data, error: insErr } = await supabase
      .from("sleep_logs")
      .insert(payload)
      .select("id, user_id, created_at, sleep_start, sleep_end, quality, notes")
      .single<SleepLogRow>();

    if (insErr) {
      setError(insErr.message);
      setStatus("Save failed.");
      return;
    }

    // If the inserted row is for today (sleep_start today), treat it as editable on refresh
    setRow(data);
    setEditingId(data.id);
    setStatus("Saved ✅");
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Sleep log</h1>

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
          <label style={{ display: "block", marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Bed time</div>
            <input
              type="datetime-local"
              value={sleepStartLocal}
              onChange={(e) => setSleepStartLocal(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Wake time</div>
            <input
              type="datetime-local"
              value={sleepEndLocal}
              onChange={(e) => setSleepEndLocal(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Sleep quality (1–5)</div>
            <input
              type="number"
              min={1}
              max={5}
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value || "3", 10))}
              style={{ width: "100%", padding: 10, borderRadius: 10 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              style={{ width: "100%", padding: 10, borderRadius: 10 }}
            />
          </label>

          {/* Keep the same button */}
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
