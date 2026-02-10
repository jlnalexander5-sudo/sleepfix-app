"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type SleepLogRow = {
  id: string;
  user_id: string;
  created_at: string;
  sleep_start: string | null; // ISO
  sleep_end: string | null; // ISO
  quality: number | null; // 1-5
  notes: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmt(dtIso: string | null) {
  if (!dtIso) return "—";
  const d = new Date(dtIso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}, ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function durationMinutes(startIso: string | null, endIso: string | null) {
  if (!startIso || !endIso) return null;
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const mins = Math.round((b - a) / 60000);
  return mins > 0 ? mins : null;
}

function formatMinutesHuman(mins: number | null) {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [status, setStatus] = useState("Loading…");
  const [userId, setUserId] = useState<string | null>(null);

  const [logs, setLogs] = useState<SleepLogRow[]>([]);

  // form state
  const [startLocal, setStartLocal] = useState<string>("");
  const [endLocal, setEndLocal] = useState<string>("");
  const [quality, setQuality] = useState<number>(3);
  const [notes, setNotes] = useState<string>("");

  // set default times on client only
  useEffect(() => {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    start.setHours(start.getHours() - 8);

    const toLocalInput = (d: Date) => {
      // YYYY-MM-DDTHH:mm (local)
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
        d.getHours()
      )}:${pad2(d.getMinutes())}`;
    };

    setStartLocal(toLocalInput(start));
    setEndLocal(toLocalInput(end));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus("Loading…");

        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          if (!cancelled) setStatus("Not signed in.");
          return;
        }
        if (!cancelled) setUserId(user.id);

        const { data, error } = await supabase
          .from("sleep_logs")
          .select("id,user_id,created_at,sleep_start,sleep_end,quality,notes")
          .eq("user_id", user.id)
          .order("sleep_start", { ascending: false })
          .limit(20);

        if (error) throw error;

        if (!cancelled) {
          setLogs((data ?? []) as SleepLogRow[]);
          setStatus("Ready.");
        }
      } catch (e: any) {
        if (!cancelled) setStatus(e?.message ?? "Failed to load.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function addLog() {
    if (!userId) return;

    try {
      setStatus("Saving…");

      const startIso = startLocal ? new Date(startLocal).toISOString() : null;
      const endIso = endLocal ? new Date(endLocal).toISOString() : null;

      const payload = {
        user_id: userId,
        sleep_start: startIso,
        sleep_end: endIso,
        quality: Number.isFinite(quality) ? quality : null,
        notes: notes.trim() ? notes.trim() : null,
      };

      const { error } = await supabase.from("sleep_logs").insert(payload as any);
      if (error) throw error;

      // reload list
      const { data, error: err2 } = await supabase
        .from("sleep_logs")
        .select("id,user_id,created_at,sleep_start,sleep_end,quality,notes")
        .eq("user_id", userId)
        .order("sleep_start", { ascending: false })
        .limit(20);

      if (err2) throw err2;

      setLogs((data ?? []) as SleepLogRow[]);
      setStatus("Ready.");
      setNotes("");
    } catch (e: any) {
      setStatus(e?.message ?? "Save failed.");
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Sleep</h1>
          <div style={{ marginTop: 6, opacity: 0.8 }}>Log your sleep + quality</div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.03)",
              minWidth: 180,
            }}
          >
            <div style={{ fontWeight: 700 }}>Status</div>
            <div style={{ opacity: 0.9 }}>{status}</div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <a href="/protected/dashboard" style={{ textDecoration: "underline" }}>
              Dashboard →
            </a>
            <a href="/protected/habits" style={{ textDecoration: "underline" }}>
              Habits →
            </a>
          </div>
        </div>
      </div>

      {/* Add form */}
      <div
        style={{
          marginTop: 18,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
          padding: 14,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Add sleep log</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ opacity: 0.85 }}>Start</span>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              style={{ padding: 10, borderRadius: 10 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ opacity: 0.85 }}>End</span>
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              style={{ padding: 10, borderRadius: 10 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ opacity: 0.85 }}>Quality (1–5)</span>
            <input
              type="number"
              min={1}
              max={5}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              style={{ padding: 10, borderRadius: 10 }}
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
          <span style={{ opacity: 0.85 }}>Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ padding: 10, borderRadius: 10 }}
            placeholder="e.g., terrible sleep, woke up twice…"
          />
        </label>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={addLog}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Save
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ marginTop: 14 }}>
        <div style={{ opacity: 0.75, marginBottom: 10 }}>Latest 20 logs</div>

        <div style={{ display: "grid", gap: 10 }}>
          {logs.map((r) => {
            const mins = durationMinutes(r.sleep_start, r.sleep_end);
            return (
              <div
                key={r.id}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.03)",
                  padding: 14,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 800 }}>{fmt(r.sleep_start)} → {fmt(r.sleep_end)}</div>
                  <div style={{ opacity: 0.85 }}>
                    Duration: {formatMinutesHuman(mins)}
                  </div>
                </div>

                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  Quality: {r.quality ?? "—"} / 5
                </div>

                {r.notes ? (
                  <div style={{ marginTop: 8, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                    Notes: {r.notes}
                  </div>
                ) : null}
              </div>
            );
          })}

          {logs.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No sleep logs yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
