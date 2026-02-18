"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type NightMetricsRow = {
  night_id: string;
  user_id: string;
  duration_hours?: number | null;
  latency_mins?: number | null;
  wakeups_count?: number | null;
  quality_num?: number | null;
};

type NightScoresRow = {
  sleep_success_score?: number | null;
  sleep_success_band?: string | null;
};

type NightInsightsRow = {
  risk_score?: number | null;
  risk_band?: string | null;
  tonight_action?: string | null;
  avoid_tonight?: string | null;
  why_this_matters?: string | null;
};

type DriverConfirmationRow = {
  night_id: string;
  user_id: string;
  proposed_driver_1?: string | null;
  proposed_driver_2?: string | null;
  selected_driver?: string | null;
};

const DRIVER_OPTIONS = [
  "Latency / Mind racing",
  "Wakeups / Environment",
  "Wakeups / Temperature",
  "Substance ingested",
  "Schedule / Late bedtime",
  "Stress / Emotional load",
  "Exercise timing (late)",
  "Food timing (late/heavy)",
  "Pain / Physical discomfort",
  "Unknown",
];

function fmt(n?: number | null, suffix = "") {
  if (n === null || n === undefined) return "—";
  return `${n}${suffix}`;
}

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [night, setNight] = useState<NightMetricsRow | null>(null);
  const [scores, setScores] = useState<NightScoresRow | null>(null);
  const [insights, setInsights] = useState<NightInsightsRow | null>(null);

  const [primaryDriver, setPrimaryDriver] = useState(DRIVER_OPTIONS[0]);
  const [secondaryDriver, setSecondaryDriver] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return;

      setUserId(user.id);
      setEmail(user.email ?? null);

      const { data: latest } = await supabase
        .from("night_scores")
        .select("night_id,user_id,duration_hours,latency_mins,wakeups_count,quality_num")
        .eq("user_id", user.id)
        .order("computed_at", { ascending: false })
        .limit(1);

      if (!latest || latest.length === 0) return;

      const latestNight = latest[0];
      setNight(latestNight);

      const { data: scoreRow } = await supabase
        .from("night_scores")
        .select("sleep_success_score,sleep_success_band")
        .eq("night_id", latestNight.night_id)
        .limit(1);

      setScores(scoreRow?.[0] ?? null);

      const { data: insightRow } = await supabase
        .from("night_insights")
        .select("risk_score,risk_band,tonight_action,avoid_tonight,why_this_matters")
        .eq("night_id", latestNight.night_id)
        .limit(1);

      setInsights(insightRow?.[0] ?? null);
    }

    load();
  }, [supabase]);

  async function saveDriverConfirmation() {
    if (!userId || !night) return;

    setSaving(true);
    setSavedMsg("");

    const payload: DriverConfirmationRow = {
      night_id: night.night_id,
      user_id: userId,
      proposed_driver_1: primaryDriver,
      proposed_driver_2: secondaryDriver || null,
      selected_driver: primaryDriver,
    };

    const { error } = await supabase
      .from("rrsm_driver_confirmations")
      .upsert(payload, { onConflict: "night_id,user_id" });

    if (!error) {
      setSavedMsg("Saved ✅");
    } else {
      setSavedMsg("Save failed ❌");
      console.log(error);
    }

    setSaving(false);
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>Sleep</h1>
      <div style={{ opacity: 0.7, marginBottom: 20 }}>
        {email ? `Signed in as ${email}` : ""}
      </div>

      {night && (
        <>
          <div style={{ marginBottom: 20 }}>
            <strong>Duration:</strong> {fmt(night.duration_hours, " h")} <br />
            <strong>Latency:</strong> {fmt(night.latency_mins, " min")} <br />
            <strong>Wakeups:</strong> {fmt(night.wakeups_count)} <br />
            <strong>Quality:</strong> {fmt(night.quality_num)}
          </div>

          <div style={{ marginBottom: 20 }}>
            <strong>Sleep Success:</strong> {scores?.sleep_success_score ?? "—"} ({scores?.sleep_success_band ?? "—"})
            <br />
            <strong>Risk:</strong> {insights?.risk_score ?? "—"} ({insights?.risk_band ?? "—"})
            <br />
            <strong>Tonight:</strong> {insights?.tonight_action ?? "—"}
            <br />
            <strong>Avoid:</strong> {insights?.avoid_tonight ?? "—"}
          </div>

          <div style={{ border: "1px solid #333", padding: 14, borderRadius: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>
              Confirm primary driver
            </div>

            <select
              value={primaryDriver}
              onChange={(e) => setPrimaryDriver(e.target.value)}
              style={{ width: "100%", padding: 8, marginBottom: 10 }}
            >
              {DRIVER_OPTIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>

            <select
              value={secondaryDriver}
              onChange={(e) => setSecondaryDriver(e.target.value)}
              style={{ width: "100%", padding: 8, marginBottom: 10 }}
            >
              <option value="">None</option>
              {DRIVER_OPTIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>

            <button
              onClick={saveDriverConfirmation}
              disabled={saving}
              style={{ width: "100%", padding: 10, fontWeight: 800 }}
            >
              {saving ? "Saving..." : "Save confirmation"}
            </button>

            {savedMsg && (
              <div style={{ marginTop: 10 }}>{savedMsg}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
