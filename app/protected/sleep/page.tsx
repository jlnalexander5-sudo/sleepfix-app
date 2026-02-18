"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type NightMetricsRow = {
  night_id: string;
  user_id: string;
  created_at?: string | null;
  sleep_start?: string | null;
  sleep_end?: string | null;
  duration_min?: number | null;
  latency_min?: number | null;
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

type NightInsightsRow = {
  night_id: string;
  user_id: string;
  computed_at?: string;
  model_version?: string | null;

  risk_score?: number | null;
  risk_band?: string | null;

  risk_interpretation?: string | null;
  primary_risk?: string | null;
  dominant_factor?: string | null;

  what_factors?: string | null;
  what_protocol?: string | null;

  tonight_action?: string | null;
  avoid_tonight?: string | null;

  why_this_matters?: string | null;
  encouragement?: string | null;
};

type NightUserDriversRow = {
  night_id: string;
  user_id: string;
  primary_driver: string | null;
  secondary_driver: string | null;
};

const DRIVER_OPTIONS = [
  "Noise / environment",
  "Light exposure",
  "Temperature",
  "Caffeine",
  "Alcohol",
  "Nicotine",
  "Late meal",
  "Hydration / bathroom",
  "Exercise timing",
  "Stress / rumination",
  "Screen time",
  "Pain / discomfort",
  "Illness / congestion",
  "Medication / supplements",
  "Travel / jet lag",
  "Shift work",
  "Unknown / mixed",
] as const;

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [latestNight, setLatestNight] = useState<NightMetricsRow | null>(null);
  const [latestScore, setLatestScore] = useState<NightScoresRow | null>(null);
  const [latestInsights, setLatestInsights] = useState<NightInsightsRow | null>(null);

  const [primaryDriver, setPrimaryDriver] = useState<string>("");
  const [secondaryDriver, setSecondaryDriver] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        if (!user) {
          if (!cancelled) {
            setUserId(null);
            setLatestNight(null);
            setLatestScore(null);
            setLatestInsights(null);
            setPrimaryDriver("");
            setSecondaryDriver("");
          }
          return;
        }

        if (cancelled) return;
        setUserId(user.id);

        const { data: nightData, error: nightErr } = await supabase
          .from("v_sleep_night_metrics")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (nightErr) throw nightErr;

        if (!nightData) {
          if (!cancelled) {
            setLatestNight(null);
            setLatestScore(null);
            setLatestInsights(null);
          }
          return;
        }

        if (cancelled) return;
        setLatestNight(nightData as NightMetricsRow);

        const [
          { data: scoreData, error: scoreErr },
          { data: insData, error: insErr },
        ] = await Promise.all([
          supabase
            .from("night_scores")
            .select("*")
            .eq("night_id", nightData.night_id)
            .eq("user_id", user.id)
            .order("computed_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("night_insights")
            .select("*")
            .eq("night_id", nightData.night_id)
            .eq("user_id", user.id)
            .order("computed_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (scoreErr) throw scoreErr;
        if (insErr) throw insErr;

        if (cancelled) return;
        setLatestScore((scoreData ?? null) as NightScoresRow | null);
        setLatestInsights((insData ?? null) as NightInsightsRow | null);

        const { data: drvData, error: drvErr } = await supabase
          .from("night_user_drivers")
          .select("primary_driver, secondary_driver")
          .eq("night_id", nightData.night_id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (drvErr) throw drvErr;

        if (cancelled) return;
        setPrimaryDriver(drvData?.primary_driver ?? "");
        setSecondaryDriver(drvData?.secondary_driver ?? "");
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const saveDriverConfirmation = async () => {
    setSavedMsg(null);
    setError(null);

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

    setSaving(true);
    try {
      const payload: NightUserDriversRow = {
        night_id: latestNight.night_id,
        user_id: userId,
        primary_driver: primaryDriver || null,
        secondary_driver: secondaryDriver || null,
      };

      const { error: upsertErr } = await supabase
        .from("night_user_drivers")
        .upsert(payload, { onConflict: "night_id,user_id" });

      if (upsertErr) throw upsertErr;

      setSavedMsg("Saved ✅");
    } catch (e: any) {
      console.log("SAVE ERROR:", e);
      setError(e?.message ?? "Failed to save.");
      setSavedMsg("Save failed ❌");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 20, color: "#fff" }}>
        <h1>Sleep</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, color: "#fff", maxWidth: 720, margin: "0 auto" }}>
      <h1>Sleep</h1>

      {error && (
        <div style={{ marginTop: 10, color: "salmon", fontWeight: 700 }}>{error}</div>
      )}

      {!userId && <p>Please sign in.</p>}

      {userId && !latestNight && <p>No sleep nights yet. Save a night first.</p>}

      {userId && latestNight && (
        <>
          <div style={{ marginTop: 20, padding: 14, border: "1px solid #333", borderRadius: 8 }}>
            <h2 style={{ marginTop: 0 }}>Latest Night Metrics</h2>
            <div>Night ID: {latestNight.night_id}</div>
            <div>Duration (min): {latestNight.duration_min ?? "—"}</div>
            <div>Latency (min): {latestNight.latency_min ?? "—"}</div>
            <div>Wakeups: {latestNight.wakeups_count ?? "—"}</div>
            <div>Quality (1-5): {latestNight.quality_num ?? "—"}</div>
          </div>

          {latestInsights && (
            <div style={{ marginTop: 20, padding: 14, border: "1px solid #333", borderRadius: 8 }}>
              <h2 style={{ marginTop: 0 }}>Tonight&apos;s RRSM Output</h2>
              <div>
                <strong>Risk band:</strong> {latestInsights.risk_band ?? "—"}{" "}
                {latestInsights.risk_score != null ? `(score: ${latestInsights.risk_score})` : ""}
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Instruction:</strong> {latestInsights.tonight_action ?? "—"}
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Why:</strong> {latestInsights.why_this_matters ?? "—"}
              </div>
            </div>
          )}

          <div style={{ marginTop: 30, padding: 14, border: "1px solid #333", borderRadius: 8 }}>
            <h2 style={{ marginTop: 0 }}>What do YOU think affected tonight?</h2>

            <label style={{ display: "block", marginTop: 10 }}>
              Primary driver
              <select
                value={primaryDriver}
                onChange={(e) => setPrimaryDriver(e.target.value)}
                style={{ width: "100%", marginTop: 6, padding: 10 }}
              >
                <option value="">Select...</option>
                {DRIVER_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "block", marginTop: 14 }}>
              Secondary driver (optional)
              <select
                value={secondaryDriver}
                onChange={(e) => setSecondaryDriver(e.target.value)}
                style={{ width: "100%", marginTop: 6, padding: 10 }}
              >
                <option value="">Select...</option>
                {DRIVER_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={saveDriverConfirmation}
              disabled={saving}
              style={{ width: "100%", padding: 10, fontWeight: 800, marginTop: 18 }}
            >
              {saving ? "Saving..." : "Save confirmation"}
            </button>

            {savedMsg && <div style={{ marginTop: 10 }}>{savedMsg}</div>}
          </div>
        </>
      )}
    </div>
  );
}
