"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type BaselineRow = {
  id: string;
  user_id: string;
  local_date: string; // YYYY-MM-DD
  baseline_bedtime: string | null; // "HH:MM:SS"
  baseline_waketime: string | null; // "HH:MM:SS"
  baseline_sleep_latency_min: number | null;
  baseline_wakeups_count: number | null;
  baseline_total_sleep_min: number | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

function toYYYYMMDDLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toHHMM(t: string | null) {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t; // "HH:MM:SS" -> "HH:MM"
}

function hhmmToTimeOrNull(v: string) {
  // input type="time" gives "HH:MM"
  if (!v) return null;
  return `${v}:00`; // store as "HH:MM:SS"
}

export default function BaselinePage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [localDate, setLocalDate] = useState<string>("");

  // form fields
  const [baselineBedtime, setBaselineBedtime] = useState<string>(""); // HH:MM
  const [baselineWaketime, setBaselineWaketime] = useState<string>(""); // HH:MM
  const [baselineLatencyMin, setBaselineLatencyMin] = useState<number>(20);
  const [baselineWakeups, setBaselineWakeups] = useState<number>(1);
  const [baselineTotalSleepMin, setBaselineTotalSleepMin] = useState<number>(420); // 7h default
  const [notes, setNotes] = useState<string>("");

  const [row, setRow] = useState<BaselineRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setStatus("Checking session...");

      const today = toYYYYMMDDLocal();
      setLocalDate(today);

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
      setStatus("Loading baseline...");

      // Load baseline for today (one per user per local_date)
      const { data: existing, error: readErr } = await supabase
        .from("rrsm_baselines")
        .select(
          "id, user_id, local_date, baseline_bedtime, baseline_waketime, baseline_sleep_latency_min, baseline_wakeups_count, baseline_total_sleep_min, notes, created_at, updated_at"
        )
        .eq("user_id", user.id)
        .eq("local_date", today)
        .maybeSingle<BaselineRow>();

      if (readErr) {
        if (!cancelled) {
          setError(readErr.message);
          setStatus("Failed to load baseline.");
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;

      if (existing) {
        setRow(existing);
        setBaselineBedtime(toHHMM(existing.baseline_bedtime));
        setBaselineWaketime(toHHMM(existing.baseline_waketime));
        setBaselineLatencyMin(existing.baseline_sleep_latency_min ?? 20);
        setBaselineWakeups(existing.baseline_wakeups_count ?? 1);
        setBaselineTotalSleepMin(existing.baseline_total_sleep_min ?? 420);
        setNotes(existing.notes ?? "");
        setStatus("Ready.");
      } else {
        // No row yet — just show defaults; user saves to create it
        setStatus("Ready (no baseline saved for today yet).");
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function saveBaseline() {
    if (!userId || !localDate) return;

    setSaving(true);
    setError(null);
    setStatus("Saving baseline...");

    const payload = {
      user_id: userId,
      local_date: localDate,
      baseline_bedtime: hhmmToTimeOrNull(baselineBedtime),
      baseline_waketime: hhmmToTimeOrNull(baselineWaketime),
      baseline_sleep_latency_min: Number.isFinite(baselineLatencyMin)
        ? baselineLatencyMin
        : null,
      baseline_wakeups_count: Number.isFinite(baselineWakeups)
        ? baselineWakeups
        : null,
      baseline_total_sleep_min: Number.isFinite(baselineTotalSleepMin)
        ? baselineTotalSleepMin
        : null,
      notes: notes || null,
    };

    // NOTE: This expects a UNIQUE constraint on (user_id, local_date).
    // If it doesn't exist yet, Supabase will throw an error and we'll add it next.
    const { data, error: upErr } = await supabase
      .from("rrsm_baselines")
      .upsert(payload, { onConflict: "user_id,local_date" })
      .select(
        "id, user_id, local_date, baseline_bedtime, baseline_waketime, baseline_sleep_latency_min, baseline_wakeups_count, baseline_total_sleep_min, notes, created_at, updated_at"
      )
      .single<BaselineRow>();

    if (upErr) {
      setError(upErr.message);
      setStatus("Save failed.");
      setSaving(false);
      return;
    }

    setRow(data);
    setStatus("Saved ✅");
    setSaving(false);
  }

  return (
    <main
      style={{
        maxWidth: 820,
        margin: "32px auto",
        padding: "0 16px",
        fontSize: 18,
        lineHeight: 1.4,
      }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>
        RRSM Baseline
      </h1>

      <div style={{ opacity: 0.85, marginBottom: 14 }}>
        {email ? `Signed in as ${email}` : "Signed in"}
        {localDate ? ` • Date: ${localDate}` : ""}
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 14,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Status: {status}</div>
        {loading && <div>Loading...</div>}
        {error && <div style={{ color: "salmon" }}>Error: {error}</div>}
      </div>

      {!loading && (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 10 }}>
            Baseline inputs (5)
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <label style={{ display: "block" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                Baseline bedtime
              </div>
              <input
                type="time"
                value={baselineBedtime}
                onChange={(e) => setBaselineBedtime(e.target.value)}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 12,
                  fontSize: 18,
                }}
              />
            </label>

            <label style={{ display: "block" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                Baseline wake time
              </div>
              <input
                type="time"
                value={baselineWaketime}
                onChange={(e) => setBaselineWaketime(e.target.value)}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 12,
                  fontSize: 18,
                }}
              />
            </label>

            <label style={{ display: "block" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                Baseline sleep latency (min)
              </div>
              <input
                type="number"
                min={0}
                step={1}
                value={baselineLatencyMin}
                onChange={(e) => setBaselineLatencyMin(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 12,
                  fontSize: 18,
                }}
              />
            </label>

            <label style={{ display: "block" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                Baseline wake-ups (count)
              </div>
              <input
                type="number"
                min={0}
                step={1}
                value={baselineWakeups}
                onChange={(e) => setBaselineWakeups(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 12,
                  fontSize: 18,
                }}
              />
            </label>

            <label style={{ display: "block", gridColumn: "1 / -1" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                Baseline total sleep (minutes)
              </div>
              <input
                type="number"
                min={0}
                step={5}
                value={baselineTotalSleepMin}
                onChange={(e) =>
                  setBaselineTotalSleepMin(Number(e.target.value))
                }
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 12,
                  fontSize: 18,
                }}
              />
              <div style={{ opacity: 0.75, marginTop: 6 }}>
                Tip: 420 = 7h, 480 = 8h, 360 = 6h
              </div>
            </label>

            <label style={{ display: "block", gridColumn: "1 / -1" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Notes</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 12,
                  fontSize: 18,
                }}
                placeholder="Optional. Anything stable about your baseline sleep pattern?"
              />
            </label>
          </div>

          <button
            onClick={saveBaseline}
            disabled={saving}
            style={{
              width: "100%",
              padding: 16,
              borderRadius: 12,
              fontSize: 18,
              fontWeight: 900,
              cursor: "pointer",
              marginTop: 16,
            }}
          >
            {saving ? "Saving..." : "Save baseline"}
          </button>

          <hr style={{ margin: "18px 0", opacity: 0.2 }} />

          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            Debug (saved row)
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, opacity: 0.9 }}>
            {JSON.stringify(row, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
