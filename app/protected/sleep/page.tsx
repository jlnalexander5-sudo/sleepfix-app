"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type LatestNightRRSM = {
  user_id: string;
  night_id: string;
  computed_at: string;
  risk_score: number | null;
  risk_band: string | null;
  why_this_matters: string | null;
  avoid_tonight: string | null;
  encouragement: string | null;
  what_protocol: string | null;
  tonight_action: string | null;
  tonight_action_plan: string | null;
};

type DriverConfirmationRow = {
  id: string;
  night_id: string;
  user_id: string;
  proposed_driver_1: string | null;
  proposed_driver_2: string | null;
  selected_driver: string | null;
  created_at: string;
};

// Structured-only options (your “6”, with Substance generalized)
const DRIVER_OPTIONS = [
  "Substance ingested",
  "Temperature / body heat",
  "Cognitive overload",
  "Environment (noise/light)",
  "Schedule / timing",
  "Unknown",
] as const;

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [latest, setLatest] = useState<LatestNightRRSM | null>(null);

  // Driver confirmation UI state
  const [primaryDriver, setPrimaryDriver] = useState<string>(DRIVER_OPTIONS[0]);
  const [secondaryDriver, setSecondaryDriver] = useState<string>("");

  const [savingDrivers, setSavingDrivers] = useState(false);
  const [savedDriversMsg, setSavedDriversMsg] = useState<string>("");

  // Load user + latest RRSM + previously saved drivers for that night
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setSavedDriversMsg("");
      setStatus("Loading...");

      try {
        // 1) Get logged-in user
        const { data: sessionData, error: sessionErr } =
          await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        const uid = sessionData.session?.user?.id ?? null;
        if (!uid) {
          if (!cancelled) {
            setUserId(null);
            setLatest(null);
            setStatus("Not signed in.");
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;
        setUserId(uid);

        // 2) Get latest RRSM record for this user
        const { data: rrsmRows, error: rrsmErr } = await supabase
          .from("v_sleep_night_metrics")
          .select(
            "user_id,night_id,computed_at,risk_score,risk_band,why_this_matters,avoid_tonight,encouragement,what_protocol,tonight_action,tonight_action_plan"
          )
          .eq("user_id", uid)
          .order("computed_at", { ascending: false })
          .limit(1);

        if (rrsmErr) throw rrsmErr;

        const rrsmLatest = (rrsmRows ?? [])[0] ?? null;
        if (!cancelled) setLatest(rrsmLatest);

        // 3) If we have a latest night, load the most recent saved driver confirmation for it
        if (rrsmLatest?.night_id) {
          const { data: confRows, error: confErr } = await supabase
            .from("rrsm_driver_confirmations")
            .select(
              "id,night_id,user_id,proposed_driver_1,proposed_driver_2,selected_driver,created_at"
            )
            .eq("user_id", uid)
            .eq("night_id", rrsmLatest.night_id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (confErr) throw confErr;

          const conf = (confRows ?? [])[0] ?? null;
          if (conf?.selected_driver) {
            if (!cancelled) {
              setPrimaryDriver(conf.selected_driver);
              // Secondary is optional; we keep it empty unless you later add a column for it
              setSecondaryDriver("");
              setSavedDriversMsg(
                `Previously saved: ${conf.selected_driver} (${fmtDateTime(
                  conf.created_at
                )})`
              );
            }
          }
        }

        if (!cancelled) {
          setStatus(rrsmLatest ? "Loaded." : "No RRSM data yet.");
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Unknown error");
          setStatus("Failed to load.");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Save driver confirmation for latest night
  async function saveDrivers() {
    setSavedDriversMsg("");
    setError(null);

    if (!userId) {
      setSavedDriversMsg("Not signed in.");
      return;
    }
    if (!latest?.night_id) {
      setSavedDriversMsg("No latest night found yet.");
      return;
    }

    setSavingDrivers(true);

    try {
      const proposed1 = primaryDriver;
      const proposed2 = secondaryDriver || null;

      const { error: insertErr } = await supabase
        .from("rrsm_driver_confirmations")
        .insert([
          {
            night_id: latest.night_id,
            user_id: userId,
            proposed_driver_1: proposed1,
            proposed_driver_2: proposed2,
            selected_driver: primaryDriver, // single-column selection
          },
        ]);

      if (insertErr) throw insertErr;

      setSavedDriversMsg("Saved confirmation ✅");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save.");
    } finally {
      setSavingDrivers(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Sleep</h1>

      {loading && (
        <div className="border rounded-lg p-4">
          <p className="font-semibold">{status}</p>
        </div>
      )}

      {!loading && !userId && (
        <div className="border rounded-lg p-4">
          <p className="font-semibold">You’re not signed in.</p>
          <p className="text-sm opacity-80">
            Sign in first, then come back to this page.
          </p>
        </div>
      )}

      {error && (
        <div className="border rounded-lg p-4">
          <p className="font-semibold text-red-600">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && userId && (
        <div className="border rounded-lg p-4 space-y-2">
          <p className="text-sm opacity-80">User ID</p>
          <p className="font-mono text-xs break-all">{userId}</p>
        </div>
      )}

      {!loading && userId && !latest && (
        <div className="border rounded-lg p-4">
          <p className="font-semibold">No RRSM data found yet.</p>
          <p className="text-sm opacity-80">
            Once RRSM generates a record for a night, it will show here.
          </p>
        </div>
      )}

      {!loading && userId && latest && (
        <>
          <div className="border rounded-lg p-4 space-y-2">
            <h2 className="font-semibold">Latest RRSM</h2>
            <div className="text-sm opacity-80">
              Computed: {fmtDateTime(latest.computed_at)}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <div className="border rounded-lg p-3">
                <div className="text-sm opacity-80">Risk score</div>
                <div className="text-lg font-bold">
                  {latest.risk_score ?? "—"}
                </div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-sm opacity-80">Risk band</div>
                <div className="text-lg font-bold">{latest.risk_band ?? "—"}</div>
              </div>
            </div>
          </div>

          {/* Structured confirmation UI */}
          <div className="border rounded-lg p-4 space-y-3">
            <h2 className="font-semibold">Confirm tonight’s drivers</h2>
            <p className="text-sm opacity-80">
              Pick the best match. This is how the system learns *you* over time.
            </p>

            <label className="block">
              <div className="text-sm font-semibold mb-1">Primary driver</div>
              <select
                value={primaryDriver}
                onChange={(e) => setPrimaryDriver(e.target.value)}
                className="w-full border rounded-lg p-2"
              >
                {DRIVER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="text-sm font-semibold mb-1">
                Secondary driver (optional)
              </div>
              <select
                value={secondaryDriver}
                onChange={(e) => setSecondaryDriver(e.target.value)}
                className="w-full border rounded-lg p-2"
              >
                <option value="">(none)</option>
                {DRIVER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={saveDrivers}
              disabled={savingDrivers}
              style={{
                width: "100%",
                marginTop: 6,
                padding: "10px 14px",
                borderRadius: 12,
                fontWeight: 800,
                cursor: savingDrivers ? "not-allowed" : "pointer",
              }}
              className="border"
            >
              {savingDrivers ? "Saving..." : "Save confirmation"}
            </button>

            {savedDriversMsg && (
              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
                {savedDriversMsg}
              </div>
            )}
          </div>

          {/* RRSM explanation blocks */}
          {latest.why_this_matters && (
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold">Why this matters</h3>
              <p>{latest.why_this_matters}</p>
            </div>
          )}

          {latest.avoid_tonight && (
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold">Avoid tonight</h3>
              <p>{latest.avoid_tonight}</p>
            </div>
          )}

          {latest.encouragement && (
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold">Encouragement</h3>
              <p>{latest.encouragement}</p>
            </div>
          )}

          {latest.what_protocol && (
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold">What protocol?</h3>
              <p>{latest.what_protocol}</p>
            </div>
          )}

          {latest.tonight_action && (
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold">Tonight action</h3>
              <p>{latest.tonight_action}</p>
            </div>
          )}

          {latest.tonight_action_plan && (
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold">Tonight action plan</h3>
              <p>{latest.tonight_action_plan}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
