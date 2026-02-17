"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

// --------------------
// Driver options (structured only)
// --------------------
const DRIVER_OPTIONS = [
  "Substance ingested",
  "Heat / temperature",
  "Noise / light",
  "Hydration / thirst",
  "Stress / arousal",
  "Late meal / digestion",
  "Unknown",
] as const;

type DriverOption = (typeof DRIVER_OPTIONS)[number];

// --------------------
// DB shapes (lightweight, runtime-safe)
// --------------------
type LatestNight = {
  id: string;
  user_id: string;
  date: string | null;
  created_at?: string;
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

// Optional RRSM-ish fields (only if you have them somewhere later)
type RRSMPreview = {
  risk_score?: number | null;
  risk_band?: string | null;
  why_this_matters?: string | null;
  avoid_tonight?: string | null;
  encouragement?: string | null;
  what_protocol?: string | null;
  tonight_action?: string | null;
  tonight_action_plan?: string | null;
};

export default function SleepPage() {
  // Important: memoize so it doesn’t recreate on every render
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [latestNight, setLatestNight] = useState<LatestNight | null>(null);

  // Driver confirmations
  const [primaryDriver, setPrimaryDriver] = useState<DriverOption>(DRIVER_OPTIONS[0]);
  const [secondaryDriver, setSecondaryDriver] = useState<string>(""); // optional
  const [savingDrivers, setSavingDrivers] = useState(false);
  const [savedDriversMsg, setSavedDriversMsg] = useState<string>("");

  // If you later connect RRSM output, you can populate this:
  const [rrsm, setRrsm] = useState<RRSMPreview | null>(null);

  // --------------------
  // 1) Get signed-in user
  // --------------------
  useEffect(() => {
    let alive = true;

    async function initAuth() {
      setError(null);
      setStatus("Checking session...");

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if (alive) setError(error.message);
        return;
      }

      const session = data.session;
      if (!session?.user) {
        if (alive) {
          setUserId(null);
          setEmail(null);
          setStatus("Not signed in.");
          setLoading(false);
        }
        return;
      }

      if (alive) {
        setUserId(session.user.id);
        setEmail(session.user.email ?? null);
      }

      // Keep it updated if auth changes
      supabase.auth.onAuthStateChange((_event, newSession) => {
        if (!alive) return;
        setUserId(newSession?.user?.id ?? null);
        setEmail(newSession?.user?.email ?? null);
      });
    }

    initAuth();

    return () => {
      alive = false;
    };
  }, [supabase]);

  // --------------------
  // 2) Load latest night (from sleep_nights)
  // --------------------
  useEffect(() => {
    if (!userId) return;

    let alive = true;

    async function loadLatestNight() {
      try {
        setLoading(true);
        setError(null);
        setSavedDriversMsg("");
        setStatus("Loading latest night...");

        // Latest night for this user
        const { data: nightRows, error: nightErr } = await supabase
          .from("sleep_nights")
          .select("id,user_id,date,created_at")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(1);

        if (nightErr) throw nightErr;

        const night = (nightRows?.[0] as LatestNight | undefined) ?? null;

        if (!alive) return;

        setLatestNight(night);

        if (!night) {
          setStatus("No nights yet.");
          setLoading(false);
          return;
        }

        setStatus("Loading your last saved confirmation...");

        // If a confirmation already exists for that night, preload it
        const { data: confRows, error: confErr } = await supabase
          .from("rrsm_driver_confirmations")
          .select("id,night_id,user_id,proposed_driver_1,proposed_driver_2,selected_driver,created_at")
          .eq("user_id", userId)
          .eq("night_id", night.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (confErr) throw confErr;

        const conf = (confRows?.[0] as DriverConfirmationRow | undefined) ?? null;

        if (conf) {
          // Load what was saved before
          const savedPrimary = (conf.selected_driver ?? conf.proposed_driver_1 ?? DRIVER_OPTIONS[0]) as DriverOption;
          const safePrimary = DRIVER_OPTIONS.includes(savedPrimary) ? savedPrimary : DRIVER_OPTIONS[0];

          setPrimaryDriver(safePrimary);
          setSecondaryDriver(conf.proposed_driver_2 ?? "");
          setSavedDriversMsg("Loaded your last confirmation for this night.");
        } else {
          setSavedDriversMsg("");
        }

        // OPTIONAL: If you later want RRSM preview, this is where you’d load it.
        // For now we keep rrsm null, so this file cannot break if your RRSM tables differ.
        setRrsm(null);

        setStatus("Ready.");
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load data");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadLatestNight();

    return () => {
      alive = false;
    };
  }, [supabase, userId]);

  // --------------------
  // 3) Save confirmation (NO duplicates!)
  // --------------------
  async function saveDriverConfirmation() {
    try {
      setSavedDriversMsg("");
      setError(null);

      if (!userId) {
        setSavedDriversMsg("Not signed in.");
        return;
      }
      if (!latestNight?.id) {
        setSavedDriversMsg("No latest night found yet.");
        return;
      }

      setSavingDrivers(true);

      const proposed1 = primaryDriver;
      const proposed2 = secondaryDriver?.trim() ? secondaryDriver.trim() : null;

      // We do NOT rely on upsert needing a unique constraint.
      // Instead: check if row exists -> update, else insert.
      const { data: existingRows, error: existingErr } = await supabase
        .from("rrsm_driver_confirmations")
        .select("id")
        .eq("user_id", userId)
        .eq("night_id", latestNight.id)
        .limit(1);

      if (existingErr) throw existingErr;

      const existingId = existingRows?.[0]?.id as string | undefined;

      if (existingId) {
        const { error: updateErr } = await supabase
          .from("rrsm_driver_confirmations")
          .update({
            proposed_driver_1: proposed1,
            proposed_driver_2: proposed2,
            selected_driver: proposed1,
          })
          .eq("id", existingId);

        if (updateErr) throw updateErr;

        setSavedDriversMsg("Updated your confirmation ✅");
      } else {
        const { error: insertErr } = await supabase.from("rrsm_driver_confirmations").insert({
          night_id: latestNight.id,
          user_id: userId,
          proposed_driver_1: proposed1,
          proposed_driver_2: proposed2,
          selected_driver: proposed1,
        });

        if (insertErr) throw insertErr;

        setSavedDriversMsg("Saved your confirmation ✅");
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to save confirmation");
    } finally {
      setSavingDrivers(false);
    }
  }

  // --------------------
  // UI
  // --------------------
  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  if (!userId) {
    return (
      <div className="p-6 space-y-2">
        <div className="text-lg font-semibold">Sleep</div>
        <div className="opacity-80">You’re not signed in.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="border rounded-lg p-4 space-y-1">
        <div className="text-lg font-semibold">Sleep</div>
        <div className="text-sm opacity-70">{status}</div>
        <div className="text-sm opacity-70">{email ? `Signed in as ${email}` : `User ${userId}`}</div>
      </div>

      {error && (
        <div className="border border-red-500/40 rounded-lg p-4 text-red-300">
          {error}
        </div>
      )}

      {!latestNight ? (
        <div className="border rounded-lg p-4">
          No sleep nights recorded yet.
        </div>
      ) : (
        <div className="border rounded-lg p-4 space-y-3">
          <div className="font-semibold">Latest night</div>
          <div className="text-sm opacity-80">
            Night ID: <span className="opacity-100">{latestNight.id}</span>
          </div>
          <div className="text-sm opacity-80">
            Date: <span className="opacity-100">{latestNight.date ?? "-"}</span>
          </div>
        </div>
      )}

      {/* RRSM Preview (optional placeholder, safe even if rrsm is null) */}
      {rrsm && (
        <div className="border rounded-lg p-4 space-y-2">
          <div className="font-semibold">RRSM Preview</div>
          <div className="text-sm opacity-80">Risk band: {rrsm.risk_band ?? "-"}</div>
          <div className="text-sm opacity-80">Risk score: {rrsm.risk_score ?? "-"}</div>
          {rrsm.why_this_matters && <div className="text-sm">{rrsm.why_this_matters}</div>}
        </div>
      )}

      {/* Driver confirmation section */}
      {latestNight && (
        <div className="border rounded-lg p-4 space-y-4">
          <div className="font-semibold">Confirm the driver(s)</div>
          <div className="text-sm opacity-80">
            Pick what best explains last night. This is **not guessing** — it’s your confirmation layer.
          </div>

          <div className="space-y-3">
            <label className="block space-y-1">
              <div className="text-sm font-medium">Primary driver</div>
              <select
                value={primaryDriver}
                onChange={(e) => setPrimaryDriver(e.target.value as DriverOption)}
                className="w-full border rounded-md p-2 bg-transparent"
              >
                {DRIVER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <div className="text-sm font-medium">Secondary driver (optional)</div>
              <select
                value={secondaryDriver}
                onChange={(e) => setSecondaryDriver(e.target.value)}
                className="w-full border rounded-md p-2 bg-transparent"
              >
                <option value="">(none)</option>
                {DRIVER_OPTIONS.filter((o) => o !== primaryDriver).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={saveDriverConfirmation}
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
      )}
    </div>
  );
}
