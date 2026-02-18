"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type NightMetricsRow = {
  night_id: string;
  user_id: string;
  sleep_start?: string | null;
  sleep_end?: string | null;
  duration_hours?: number | null;
  latency_mins?: number | null;
  wakeups_count?: number | null;
  quality_num?: number | null;
};

type NightScoresRow = {
  night_id: string;
  user_id: string;
  computed_at?: string;
  model_version?: string | null;

  duration_hours?: number | null;
  latency_mins?: number | null;
  wakeups_count?: number | null;
  quality_num?: number | null;

  duration_score?: number | null;
  latency_score?: number | null;
  wakeups_score?: number | null;
  quality_score?: number | null;

  sleep_success_score?: number | null;
  sleep_success_band?: string | null;
  sleep_status?: string | null;

  raw_duration_hours?: number | null;
};

type NightInsight = {
  night_id: string;
  user_id: string;
  score: number;
  band: string;
  status: string;
};

type DriverOption = { key: string; label: string };

const DRIVER_OPTIONS: DriverOption[] = [
  { key: "noise", label: "Noise" },
  { key: "light", label: "Light" },
  { key: "temp", label: "Temperature" },
  { key: "stress", label: "Stress" },
  { key: "caffeine", label: "Caffeine" },
  { key: "alcohol", label: "Alcohol" },
  { key: "late_meal", label: "Late meal" },
  { key: "exercise", label: "Exercise timing" },
  { key: "screen_time", label: "Screen time" },
  { key: "schedule", label: "Schedule shift" },
  { key: "pain", label: "Pain / discomfort" },
  { key: "other", label: "Other" },
];

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [userId, setUserId] = useState<string | null>(null);

  const [latestNight, setLatestNight] = useState<NightMetricsRow | null>(null);
  const [latestScore, setLatestScore] = useState<NightScoresRow | null>(null);
  const [latestInsight, setLatestInsight] = useState<NightInsight | null>(null);

  const [loading, setLoading] = useState(true);

  const [primaryDriver, setPrimaryDriver] = useState<string>("");
  const [secondaryDriver, setSecondaryDriver] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let alive = true;

    async function init() {
      setLoading(true);
      setErrorMsg("");

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;

      if (!alive) return;
      setUserId(uid);

      if (!uid) {
        setLatestNight(null);
        setLatestScore(null);
        setLatestInsight(null);
        setLoading(false);
        return;
      }

      // Latest night from your view
      const { data: night, error: nightErr } = await supabase
        .from("v_sleep_night_metrics")
        .select("*")
        .eq("user_id", uid)
        .order("sleep_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (nightErr) {
        if (!alive) return;
        setErrorMsg(nightErr.message);
        setLoading(false);
        return;
      }

      if (!alive) return;
      setLatestNight((night as NightMetricsRow) ?? null);

      if (!night?.night_id) {
        setLatestScore(null);
        setLatestInsight(null);
        setLoading(false);
        return;
      }

      const { data: score, error: scoreErr } = await supabase
        .from("night_scores")
        .select("*")
        .eq("user_id", uid)
        .eq("night_id", night.night_id)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!alive) return;

      if (scoreErr) {
        setErrorMsg(scoreErr.message);
      } else {
        setLatestScore((score as NightScoresRow) ?? null);
      }

      // Optional: your insights view/table if you have one
      const { data: insight } = await supabase
        .from("v_night_insights_source")
        .select("night_id,user_id,score,band,status")
        .eq("user_id", uid)
        .eq("night_id", night.night_id)
        .limit(1)
        .maybeSingle();

      if (!alive) return;
      setLatestInsight((insight as NightInsight) ?? null);

      setLoading(false);
    }

    init();
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function saveDriverConfirmation() {
    setSaving(true);
    setSavedMsg("");
    setErrorMsg("");

    try {
      if (!userId) {
        setSavedMsg("Not signed in.");
        return;
      }

      if (!latestNight?.night_id) {
        setSavedMsg("No latest night found yet.");
        return;
      }

      if (!primaryDriver) {
        setSavedMsg("Pick a primary driver first.");
        return;
      }

      // 1) Store the selected drivers for correlation (THIS TABLE HAS NO driver_type)
      const nightDriversPayload = {
        night_id: latestNight.night_id,
        user_id: userId,
        primary_driver: primaryDriver,
        secondary_driver: secondaryDriver || null,
      };

      const { error: nudErr } = await supabase
        .from("night_user_drivers")
        .upsert(nightDriversPayload, { onConflict: "night_id,user_id" });

      if (nudErr) throw nudErr;

      // 2) Store confirmation record (keep your existing table too)
      const confirmPayload = {
        night_id: latestNight.night_id,
        user_id: userId,
        proposed_driver_1: primaryDriver,
        proposed_driver_2: secondaryDriver || null,
        selected_driver: primaryDriver,
      };

      const { error: confErr } = await supabase
        .from("rrsm_driver_confirmations")
        .upsert(confirmPayload, { onConflict: "night_id,user_id" });

      if (confErr) throw confErr;

      setSavedMsg("Saved ✅");
    } catch (e: any) {
      console.log("SAVE ERROR:", e);
      setErrorMsg(e?.message ?? "Failed to save.");
      setSavedMsg("Save failed ❌");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Sleep</h1>

      {loading ? (
        <div>Loading...</div>
      ) : !userId ? (
        <div>Please sign in.</div>
      ) : (
        <>
          {!latestNight ? (
            <div style={{ marginBottom: 16 }}>
              No nights yet. Save a night first so metrics populate.
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div>
                <b>Latest night:</b> {latestNight.sleep_start ?? "?"} →{" "}
                {latestNight.sleep_end ?? "?"}
              </div>
              <div>
                Duration: {latestNight.duration_hours ?? "?"}h | Latency:{" "}
                {latestNight.latency_mins ?? "?"}m | Wakeups:{" "}
                {latestNight.wakeups_count ?? "?"} | Quality:{" "}
                {latestNight.quality_num ?? "?"}
              </div>

              {latestScore && (
                <div style={{ marginTop: 8 }}>
                  <b>Success:</b> {latestScore.sleep_success_score ?? "?"} (
                  {latestScore.sleep_success_band ?? "?"}) —{" "}
                  {latestScore.sleep_status ?? "?"}
                </div>
              )}

              {latestInsight && (
                <div style={{ marginTop: 8 }}>
                  <b>Insight:</b> {latestInsight.score} ({latestInsight.band}) —{" "}
                  {latestInsight.status}
                </div>
              )}
            </div>
          )}

          <hr style={{ margin: "16px 0" }} />

          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
            Driver Confirmation
          </h2>

          <div style={{ marginBottom: 10 }}>
            <div style={{ marginBottom: 6 }}>Primary driver</div>
            <select
              value={primaryDriver}
              onChange={(e) => setPrimaryDriver(e.target.value)}
              style={{ width: "100%", padding: 10 }}
            >
              <option value="">Select...</option>
              {DRIVER_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ marginBottom: 6 }}>Secondary driver (optional)</div>
            <select
              value={secondaryDriver}
              onChange={(e) => setSecondaryDriver(e.target.value)}
              style={{ width: "100%", padding: 10 }}
            >
              <option value="">None</option>
              {DRIVER_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={saveDriverConfirmation}
            disabled={saving}
            style={{ width: "100%", padding: 10, fontWeight: 800 }}
          >
            {saving ? "Saving..." : "Save confirmation"}
          </button>

          {savedMsg && <div style={{ marginTop: 10 }}>{savedMsg}</div>}
          {errorMsg && (
            <div style={{ marginTop: 10, color: "red" }}>{errorMsg}</div>
          )}
        </>
      )}
    </div>
  );
}
