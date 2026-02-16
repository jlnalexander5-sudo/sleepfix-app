

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type SleepLogRow = {
  id: string;
  user_id: string;
  created_at: string;
  sleep_start: string;
  sleep_end: string;
  quality: number | null;
  notes: string | null;
  sleep_day: string | null;
};

function minutesBetween(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const diffMs = end - start;
  return Math.round(diffMs / 60000);
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export default function SleepPage() {
  const supabase = createBrowserSupabaseClient();

  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SleepLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form state (for inserting a sleep log)
  const [sleepStartLocal, setSleepStartLocal] = useState<string>("");
  const [sleepEndLocal, setSleepEndLocal] = useState<string>("");
  const [quality, setQuality] = useState<string>("3");
  const [notes, setNotes] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // 1) Get the logged-in user (VERY IMPORTANT for RLS)
  useEffect(() => {
    let cancelled = false;

    async function getUser() {
      const { data, error } = await supabase.auth.getSession();
      if (!cancelled) {
        if (error) setError(error.message);
        setUserId(data.session?.user?.id ?? null);
      }
    }

    getUser();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // 2) Load latest logs for this user
  async function loadLogs(currentUserId: string) {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("sleep_logs")
      .select("id,user_id,created_at,sleep_start,sleep_end,quality,notes,sleep_day")
      .eq("user_id", currentUserId)
      .order("sleep_start", { ascending: false })
      .limit(7);

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as SleepLogRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    loadLogs(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const latest = rows[0] ?? null;

  const stats = useMemo(() => {
    if (!rows.length) return null;

    const durations = rows
      .map((r) => {
        try {
          const mins = minutesBetween(r.sleep_start, r.sleep_end);
          if (Number.isFinite(mins) && mins > 0) return mins;
          return null;
        } catch {
          return null;
        }
      })
      .filter((x): x is number => x !== null);

    const qualityVals = rows
      .map((r) => (typeof r.quality === "number" ? r.quality : null))
      .filter((x): x is number => x !== null);

    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    const avgQuality =
      qualityVals.length > 0
        ? Math.round((qualityVals.reduce((a, b) => a + b, 0) / qualityVals.length) * 10) / 10
        : null;

    return { avgDuration, avgQuality, count: rows.length };
  }, [rows]);

  // 3) Insert a new sleep log
  async function insertLog() {
    setSaveMsg(null);
    setError(null);

    if (!userId) {
      setError("You must be logged in to save sleep logs.");
      return;
    }
    if (!sleepStartLocal || !sleepEndLocal) {
      setError("Please enter both Sleep start and Sleep end.");
      return;
    }

    // datetime-local -> Date assumes LOCAL time, then we store ISO (UTC) into timestamptz
    const startIso = new Date(sleepStartLocal).toISOString();
    const endIso = new Date(sleepEndLocal).toISOString();

    // Basic sanity checks (your DB constraint also helps)
    const mins = minutesBetween(startIso, endIso);
    if (mins <= 0) {
      setError("Sleep end must be after sleep start.");
      return;
    }

    const qNum = Number(quality);
    const safeQuality = Number.isFinite(qNum) ? qNum : null;

    setSaving(true);
    try {
      const { error: insErr } = await supabase.from("sleep_logs").insert({
        user_id: userId,
        sleep_start: startIso,
        sleep_end: endIso,
        quality: safeQuality,
        notes: notes.trim() ? notes.trim() : null,
        // sleep_day is optional; leave it null unless you want it
      });

      if (insErr) throw insErr;

      setSaveMsg("Saved ✅");
      setSleepStartLocal("");
      setSleepEndLocal("");
      setQuality("3");
      setNotes("");

      await loadLogs(userId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save sleep log.");
    } finally {
      setSaving(false);
    }
  }

  // UI
  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Sleep</h1>

      {!userId && (
        <div className="border rounded-lg p-4">
          <div className="font-semibold">Not signed in</div>
          <div className="opacity-80 text-sm mt-1">
            You must be signed in for the app to read/write your sleep logs (because Row Level Security is on).
          </div>
        </div>
      )}

      {error && (
        <div className="border border-red-500/40 rounded-lg p-4 text-red-300">
          {error}
        </div>
      )}

      {/* Insert form */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="font-semibold">Add a sleep log</div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <div className="text-sm opacity-70">Sleep start (local time)</div>
            <input
              type="datetime-local"
              className="w-full rounded border bg-transparent p-2"
              value={sleepStartLocal}
              onChange={(e) => setSleepStartLocal(e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <div className="text-sm opacity-70">Sleep end (local time)</div>
            <input
              type="datetime-local"
              className="w-full rounded border bg-transparent p-2"
              value={sleepEndLocal}
              onChange={(e) => setSleepEndLocal(e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <div className="text-sm opacity-70">Quality (1–5)</div>
            <select
              className="w-full rounded border bg-transparent p-2"
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
            >
              <option value="1">1 (very bad)</option>
              <option value="2">2</option>
              <option value="3">3 (ok)</option>
              <option value="4">4</option>
              <option value="5">5 (great)</option>
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-sm opacity-70">Notes</div>
            <input
              type="text"
              className="w-full rounded border bg-transparent p-2"
              placeholder='e.g., "terrible sleep", "caffeine late", etc.'
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={insertLog}
            disabled={saving || !userId}
            className="rounded bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saveMsg && <div className="text-green-300 text-sm">{saveMsg}</div>}
        </div>

        <div className="text-xs opacity-70">
          Note: Because of your RLS policy, inserts will only work when{" "}
          <code className="px-1 py-0.5 bg-white/10 rounded">user_id</code> equals your logged-in{" "}
          <code className="px-1 py-0.5 bg-white/10 rounded">auth.uid()</code>.
        </div>
      </div>

      {/* Latest + stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border rounded-lg p-4 space-y-2">
          <div className="font-semibold">Latest entry</div>
          {!latest ? (
            <div className="opacity-70">No sleep logs yet.</div>
          ) : (
            <>
              <div className="text-sm opacity-70">Start</div>
              <div>{new Date(latest.sleep_start).toLocaleString()}</div>

              <div className="text-sm opacity-70 mt-2">End</div>
              <div>{new Date(latest.sleep_end).toLocaleString()}</div>

              <div className="text-sm opacity-70 mt-2">Duration</div>
              <div className="font-semibold">
                {formatMinutes(minutesBetween(latest.sleep_start, latest.sleep_end))}
              </div>

              <div className="text-sm opacity-70 mt-2">Quality</div>
              <div>{latest.quality ?? "-"}</div>

              {latest.notes && (
                <>
                  <div className="text-sm opacity-70 mt-2">Notes</div>
                  <div>{latest.notes}</div>
                </>
              )}
            </>
          )}
        </div>

        <div className="border rounded-lg p-4 space-y-2">
          <div className="font-semibold">Last 7 entries</div>
          {!stats ? (
            <div className="opacity-70">No stats yet.</div>
          ) : (
            <>
              <div className="text-sm opacity-70">Count</div>
              <div>{stats.count}</div>

              <div className="text-sm opacity-70 mt-2">Avg duration</div>
              <div className="font-semibold">
                {stats.avgDuration ? formatMinutes(stats.avgDuration) : "-"}
              </div>

              <div className="text-sm opacity-70 mt-2">Avg quality</div>
              <div className="font-semibold">{stats.avgQuality ?? "-"}</div>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg p-4">
        <div className="font-semibold mb-3">Recent logs</div>
        {!rows.length ? (
          <div className="opacity-70">No rows.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const mins = minutesBetween(r.sleep_start, r.sleep_end);
              return (
                <div key={r.id} className="rounded border border-white/10 p-3">
                  <div className="text-sm opacity-70">
                    {new Date(r.sleep_start).toLocaleDateString()} •{" "}
                    {formatMinutes(mins)} • quality {r.quality ?? "-"}
                  </div>
                  {r.notes && <div className="mt-1">{r.notes}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}