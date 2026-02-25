"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import RRSMInsightCard from "@/components/RRSMInsightCard";

type DriverOption = { value: string; label: string };

type NightRow = {
  id: string;
  user_id: string;
  sleep_start: string;
  sleep_end: string;
  created_at: string;
};

type NightMetricsRow = {
  night_id: string;
  user_id: string;
  created_at: string;
  duration_min: number | null;
  latency_min: number | null;
  wakeups_count: number | null;
  quality_num: number | null;
};

type RRSMInsight = {
  code: string;
  title: string;
  why: string[];
  actions: string[];
  confidence: "low" | "medium" | "high";
};

function parseLocalDateTime(dateStr: string, timeStr: string) {
  // dateStr: DD/MM/YYYY
  // timeStr: HH:MM AM/PM
  const [d, m, y] = dateStr.split("/").map((s) => Number(s));
  const [time, ampm] = timeStr.trim().split(" ");
  const [hh, mm] = time.split(":").map((s) => Number(s));

  let hours = hh;
  const isPM = ampm?.toUpperCase() === "PM";
  const isAM = ampm?.toUpperCase() === "AM";
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return new Date(y, m - 1, d, hours, mm, 0, 0);
}

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  // Inputs
  const [sleepStartDate, setSleepStartDate] = useState("23/02/2026");
  const [sleepStartTime, setSleepStartTime] = useState("11:30 PM");
  const [sleepEndDate, setSleepEndDate] = useState("24/02/2026");
  const [sleepEndTime, setSleepEndTime] = useState("08:30 AM");

  const driverOptions: DriverOption[] = [
    { value: "", label: "(none)" },
    { value: "Late meal", label: "Late meal" },
    { value: "Too much screen time", label: "Too much screen time" },
    { value: "Exercise timing", label: "Exercise timing" },
    { value: "Stress / worry", label: "Stress / worry" },
    { value: "Temperature / environment", label: "Temperature / environment" },
  ];

  const [primaryDriver, setPrimaryDriver] = useState(driverOptions[1].value);
  const [secondaryDriver, setSecondaryDriver] = useState(driverOptions[2].value);
  const [notes, setNotes] = useState("");

  // Data
  const [userId, setUserId] = useState<string | null>(null);
  const [latestNightId, setLatestNightId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<NightMetricsRow[]>([]);

  // RRSM state
  const [rrsmInsightLoading, setRrsmInsightLoading] = useState(false);
  const [rrsmInsightError, setRrsmInsightError] = useState<string | null>(null);
  const [rrsmInsight, setRrsmInsight] = useState<RRSMInsight | null>(null);

  // ---------- Auth / user ----------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, [supabase]);

  // ---------- Load metrics + initial insight ----------
  useEffect(() => {
    if (!userId) return;

    (async () => {
      // Load last 7 nights from the view
      const { data: rows, error } = await supabase
        .from("v_sleep_night_metrics")
        .select(
          "night_id,user_id,created_at,duration_min,latency_min,wakeups_count,quality_num"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(7);

      if (!error && rows) {
        setMetrics(rows as any);
        setLatestNightId((rows as any)?.[0]?.night_id ?? null);
      }

      // Initial analysis (C: replaces the old metrics block)
      await runRrsmAnalyze();
    })();
  }, [supabase, userId]);

  async function runRrsmAnalyze(override?: {
    sleepStart?: string;
    sleepEnd?: string;
    primaryDriver?: string;
    secondaryDriver?: string;
    notes?: string;
  }) {
    setRrsmInsightLoading(true);
    setRrsmInsightError(null);

    try {
      const payload = {
        days: 7,
        // what the user thinks (helps RRSM reasoning)
        primaryDriver: override?.primaryDriver ?? primaryDriver,
        secondaryDriver: override?.secondaryDriver ?? secondaryDriver,
        notes: override?.notes ?? notes,
        // what the user just entered (A: supports "rerun after save")
        sleepStart: override?.sleepStart,
        sleepEnd: override?.sleepEnd,
      };

      const res = await fetch("/api/rrsm/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json?.error || `RRSM analyze failed (${res.status}). ${JSON.stringify(json)}`
        );
      }

      const insight = json?.insights?.[0] ?? null;
      setRrsmInsight(insight);
    } catch (e: any) {
      setRrsmInsightError(String(e?.message ?? e));
      setRrsmInsight(null);
    } finally {
      setRrsmInsightLoading(false);
    }
  }

  async function saveNight() {
    if (!userId) return;

    const start = parseLocalDateTime(sleepStartDate, sleepStartTime);
    const end = parseLocalDateTime(sleepEndDate, sleepEndTime);

    // Insert / upsert (adjust to your actual table)
    const { data: inserted, error } = await supabase
      .from("sleep_nights")
      .insert({
        user_id: userId,
        sleep_start: start.toISOString(),
        sleep_end: end.toISOString(),
      })
      .select("id")
      .single();

    if (!error) {
      setLatestNightId(inserted?.id ?? null);
    }

    // A: Re-run analysis immediately using what the user just entered
    await runRrsmAnalyze({
      sleepStart: start.toISOString(),
      sleepEnd: end.toISOString(),
      primaryDriver,
      secondaryDriver,
      notes,
    });

    // Refresh raw metrics for debug (optional)
    const { data: rows } = await supabase
      .from("v_sleep_night_metrics")
      .select(
        "night_id,user_id,created_at,duration_min,latency_min,wakeups_count,quality_num"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(7);
    if (rows) setMetrics(rows as any);
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: 18 }}>
      <h1 style={{ fontSize: 48, fontWeight: 900, marginBottom: 10 }}>Sleep</h1>

      {/* Inputs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          alignItems: "end",
        }}
      >
        <div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Sleep Start</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={sleepStartDate}
              onChange={(e) => setSleepStartDate(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 10 }}
            />
            <input
              value={sleepStartTime}
              onChange={(e) => setSleepStartTime(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 10 }}
            />
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Sleep End</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={sleepEndDate}
              onChange={(e) => setSleepEndDate(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 10 }}
            />
            <input
              value={sleepEndTime}
              onChange={(e) => setSleepEndTime(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 10 }}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>
          What do YOU think affected tonight?
        </div>

        <div style={{ fontWeight: 800, marginTop: 10, marginBottom: 6 }}>
          Primary driver
        </div>
        <select
          value={primaryDriver}
          onChange={(e) => setPrimaryDriver(e.target.value)}
          style={{ width: "100%", padding: 14, borderRadius: 10 }}
        >
          {driverOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div style={{ fontWeight: 800, marginTop: 12, marginBottom: 6 }}>
          Secondary driver
        </div>
        <select
          value={secondaryDriver}
          onChange={(e) => setSecondaryDriver(e.target.value)}
          style={{ width: "100%", padding: 14, borderRadius: 10 }}
        >
          {driverOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div style={{ fontWeight: 800, marginTop: 12, marginBottom: 6 }}>
          Notes (optional)
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="e.g., neighbor noise until midnight, but slept well after"
          style={{ width: "100%", padding: 14, borderRadius: 10 }}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <button
          onClick={saveNight}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Save night
        </button>
      </div>

      {/* A + C: Show RRSM insight right under save */}
      <div style={{ marginTop: 18 }}>
        {rrsmInsightLoading ? (
          <div style={{ opacity: 0.85 }}>Analyzing last 7 days...</div>
        ) : rrsmInsightError ? (
          <div style={{ color: "tomato", fontWeight: 700 }}>{rrsmInsightError}</div>
        ) : rrsmInsight ? (
          <RRSMInsightCard insight={rrsmInsight} />
        ) : (
          <div style={{ opacity: 0.85 }}>No RRSM insight yet.</div>
        )}
      </div>

      {/* B: Always show the user's input summary */}
      <div
        style={{
          marginTop: 14,
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 14,
          padding: 14,
          background: "rgba(255,255,255,0.75)",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>
          Your input (tonight)
        </div>
        <div style={{ opacity: 0.9 }}>
          <div>
            Primary: <b>{primaryDriver || "(none)"}</b>
          </div>
          <div style={{ marginTop: 6 }}>
            Secondary: <b>{secondaryDriver || "(none)"}</b>
          </div>
          <div style={{ marginTop: 6 }}>
            Notes: <b>{notes?.trim() ? notes.trim() : "(none)"}</b>
          </div>
        </div>
      </div>

      {/* D: Debug block */}
      <details style={{ marginTop: 14, opacity: 0.9 }}>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>
          Debug (show raw sleep metrics)
        </summary>

        <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 13 }}>
          <div style={{ opacity: 0.9 }}>latestNightId: {latestNightId ?? "(none)"}</div>
          <pre style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(metrics, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}
