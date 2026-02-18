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

type DriverConfirmationRow = {
  id?: string;
  night_id: string;
  user_id: string;
  proposed_driver_1?: string | null;
  proposed_driver_2?: string | null;
  selected_driver?: string | null;
  created_at?: string;
};

const DRIVER_OPTIONS = [
  "Latency / Mind racing",
  "Wakeups / Environment (noise/light)",
  "Wakeups / Temperature (heat/cold)",
  "Substance ingested (caffeine/alcohol/meds/supplements)",
  "Schedule / Late bedtime",
  "Schedule / Inconsistent wake time",
  "Stress / Emotional load",
  "Exercise timing (late)",
  "Food timing (late/heavy)",
  "Pain / Physical discomfort",
  "Unknown",
] as const;

function fmtMaybe(n?: number | null, suffix = "") {
  if (n === null || n === undefined) return "—";
  return `${n}${suffix}`;
}

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [latestNight, setLatestNight] = useState<NightMetricsRow | null>(null);
  const [scores, setScores] = useState<NightScoresRow | null>(null);
  const [insights, setInsights] = useState<NightInsightsRow | null>(null);

  // Drivers UX (structured selection only)
  const [primaryDriver, setPrimaryDriver] = useState<string>(DRIVER_OPTIONS[0]);
  const [secondaryDriver, setSecondaryDriver] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setSavedMsg("");
        setStatus("Checking session...");

        const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        const u = sessionRes.session?.user ?? null;
        if (!u) {
          if (!cancelled) {
            setUserId(null);
            setEmail(null);
            setLatestNight(null);
            setScores(null);
            setInsights(null);
            setStatus("Not signed in.");
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;
        setUserId(u.id);
        setEmail(u.email ?? null);

       // 1) Latest night (from night_scores)
setStatus("Loading latest night...");
const { data: latestRows, error: latestErr } = await supabase
  .from("night_scores")
  .select("night_id,user_id,computed_at,duration_hours,latency_mins,wakeups_count,quality_num")
  .eq("user_id", u.id)
  .order("computed_at", { ascending: false })
  .limit(1);

        if (latestErr) throw latestErr;

        const latest = (latestRows ?? [])[0] ?? null;
        if (!latest) {
          if (!cancelled) {
            setLatestNight(null);
            setScores(null);
            setInsights(null);
            setStatus("No nights found yet.");
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;
        setLatestNight(latest);

        // 2) Night scores
        setStatus("Loading night scores...");
        const { data: scoreRows, error: scoreErr } = await supabase
          .from("night_scores")
          .select("*")
          .eq("user_id", u.id)
          .eq("night_id", latest.night_id)
          .order("computed_at", { ascending: false })
          .limit(1);

        if (scoreErr) throw scoreErr;
        setScores((scoreRows ?? [])[0] ?? null);

        // 3) Night insights
        setStatus("Loading night insights...");
        const { data: insightRows, error: insightErr } = await supabase
          .from("night_insights")
          .select("*")
          .eq("user_id", u.id)
          .eq("night_id", latest.night_id)
          .order("computed_at", { ascending: false })
          .limit(1);

        if (insightErr) throw insightErr;
        setInsights((insightRows ?? [])[0] ?? null);

        // 4) Existing driver confirmation (if any) -> prefill
        setStatus("Loading driver confirmation...");
        const { data: confRows, error: confErr } = await supabase
          .from("rrsm_driver_confirmations")
          .select("id,night_id,user_id,proposed_driver_1,proposed_driver_2,selected_driver,created_at")
          .eq("user_id", u.id)
          .eq("night_id", latest.night_id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (confErr) throw confErr;

        const conf = (confRows ?? [])[0] as DriverConfirmationRow | undefined;
        if (conf?.selected_driver) {
          setPrimaryDriver(conf.selected_driver);
        } else if (conf?.proposed_driver_1) {
          setPrimaryDriver(conf.proposed_driver_1);
        } else {
          setPrimaryDriver(DRIVER_OPTIONS[0]);
        }
        setSecondaryDriver(conf?.proposed_driver_2 ?? "");

        if (!cancelled) {
          setStatus("Loaded.");
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Unknown error");
          setStatus("Error.");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ✅ IMPORTANT: only ONE save function in this file (prevents “Duplicate function implementation”)
async function saveDriverConfirmation() {
  setSavedMsg("");
  setError(null);

  if (!userId) {
    setSavedMsg("Not signed in.");
    return;
  }

  if (!latestNight?.night_id) {
    setSavedMsg("No latest night found yet.");
    return;
  }

  setSaving(true);
  try {
    const payload: DriverConfirmationRow = {
      night_id: latestNight.night_id,
      user_id: userId,
      proposed_driver_1: primaryDriver,
      proposed_driver_2: secondaryDriver || null,
      selected_driver: primaryDriver,
    };

    const { error } = await supabase
      .from("rrsm_driver_confirmations")
      .upsert(payload, { onConflict: "night_id,user_id" });

    if (error) throw error;

    setSavedMsg("Saved ✅");
  } catch (e: any) {
    console.log("SAVE ERROR:", e);
    setError(e?.message ?? "Failed to save.");
    setSavedMsg("Save failed ❌");
  } finally {
    setSaving(false);
  }
}
}

    if (!userId) {
      setSavedMsg("Not signed in.");
      return;
    }
    if (!latestNight?.night_id) {
      setSavedMsg("No latest night found yet.");
      return;
    }

    setSaving(true);
    try {
      const payload: DriverConfirmationRow = {
        night_id: latestNight.night_id,
        user_id: userId,
        proposed_driver_1: primaryDriver,
        proposed_driver_2: secondaryDriver || null,
        selected_driver: primaryDriver, // structured selection only
      };

      // NOTE: upsert requires a unique constraint on (night_id,user_id).
      // If you don't have it yet, Supabase may error. In that case we fallback to insert.
      const upsertRes = await supabase
        .from("rrsm_driver_confirmations")
        .upsert(payload, { onConflict: "night_id,user_id" })
        .select("id, night_id, user_id, created_at")
        .single();

      if (upsertRes.error) {
        // fallback insert (works even without unique constraint, but can create duplicates)
        const ins = await supabase.from("rrsm_driver_confirmations").insert(payload);
        if (ins.error) throw ins.error;
      }

      setSavedMsg("Saved ✅");
 } catch (e: any) {
  alert("SAVE ERROR:\n" + (e?.message ?? JSON.stringify(e)));
  setError(e?.message ?? "Failed to save.");
  setSavedMsg("Save failed ❌");
}
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 18 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Sleep</h1>

      <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 14 }}>
        {email ? `Signed in as ${email}` : "Not signed in"}
      </div>

      {loading && (
        <div style={{ padding: 12, border: "1px solid #333", borderRadius: 12 }}>
          <div style={{ fontWeight: 700 }}>{status}</div>
          <div style={{ opacity: 0.8, marginTop: 6, fontSize: 13 }}>
            If this hangs, check Supabase auth + RLS policies for views/tables.
          </div>
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            padding: 12,
            border: "1px solid #a33",
            borderRadius: 12,
            marginBottom: 12,
            background: "rgba(170,50,50,0.08)",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Error</div>
          <div style={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>{error}</div>
        </div>
      )}

      {!loading && !latestNight && (
        <div style={{ padding: 12, border: "1px solid #333", borderRadius: 12 }}>
          <div style={{ fontWeight: 700 }}>No nights found yet.</div>
          <div style={{ opacity: 0.85, fontSize: 13, marginTop: 6 }}>
            Add at least one night so the RRSM pipeline has something to compute.
          </div>
        </div>
      )}

      {!loading && latestNight && (
        <>
          <div style={{ padding: 14, border: "1px solid #333", borderRadius: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Latest night (metrics)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 14 }}>
              <div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>Duration</div>
                <div style={{ fontWeight: 800 }}>{fmtMaybe(latestNight.duration_hours, " h")}</div>
              </div>
              <div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>Latency</div>
                <div style={{ fontWeight: 800 }}>{fmtMaybe(latestNight.latency_mins, " min")}</div>
              </div>
              <div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>Wakeups</div>
                <div style={{ fontWeight: 800 }}>{fmtMaybe(latestNight.wakeups_count)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>Quality</div>
                <div style={{ fontWeight: 800 }}>{fmtMaybe(latestNight.quality_num)}</div>
              </div>
            </div>
            <div style={{ opacity: 0.65, fontSize: 12, marginTop: 10 }}>
              night_id: <span style={{ fontFamily: "monospace" }}>{latestNight.night_id}</span>
            </div>
          </div>

          <div style={{ padding: 14, border: "1px solid #333", borderRadius: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>RRSM summary</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>Sleep success</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>
                  {scores?.sleep_success_score ?? "—"}
                </div>
                <div style={{ opacity: 0.8, fontSize: 12 }}>{scores?.sleep_success_band ?? "—"}</div>
              </div>
              <div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>Risk</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{insights?.risk_score ?? "—"}</div>
                <div style={{ opacity: 0.8, fontSize: 12 }}>{insights?.risk_band ?? "—"}</div>
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.35 }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Why this matters</div>
              <div style={{ opacity: 0.9 }}>{insights?.why_this_matters ?? "—"}</div>

              <div style={{ fontWeight: 800, marginTop: 10, marginBottom: 4 }}>Tonight</div>
              <div>
                <span style={{ opacity: 0.75 }}>Do: </span>
                <span style={{ fontWeight: 800 }}>{insights?.tonight_action ?? "—"}</span>
              </div>
              <div>
                <span style={{ opacity: 0.75 }}>Avoid: </span>
                <span style={{ fontWeight: 800 }}>{insights?.avoid_tonight ?? "—"}</span>
              </div>

              <div style={{ fontWeight: 800, marginTop: 10, marginBottom: 4 }}>What / protocol</div>
              <div style={{ opacity: 0.9 }}>{insights?.what_protocol ?? insights?.what_factors ?? "—"}</div>

              <div style={{ fontWeight: 800, marginTop: 10, marginBottom: 4 }}>Encouragement</div>
              <div style={{ opacity: 0.9 }}>{insights?.encouragement ?? "—"}</div>
            </div>
          </div>

          <div style={{ padding: 14, border: "1px solid #333", borderRadius: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Confirm the top driver (structured)</div>
            <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 12 }}>
              The app proposes drivers, but your confirmation completes the story.
            </div>

            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Primary driver (choose 1)</div>
              <select
                value={primaryDriver}
                onChange={(e) => setPrimaryDriver(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 12 }}
              >
                {DRIVER_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "block" }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Secondary driver (optional)</div>
              <select
                value={secondaryDriver}
                onChange={(e) => setSecondaryDriver(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 12 }}
              >
                <option value="">None</option>
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
              style={{
                width: "100%",
                marginTop: 10,
                padding: "10px 14px",
                borderRadius: 12,
                fontWeight: 900,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save confirmation"}
            </button>

            {!!savedMsg && (
              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
                {savedMsg}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
