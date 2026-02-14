"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type LatestNightRRSM = {
  user_id: string;
  night_id: string;
  computed_at: string;

  risk_score: number | null;
  risk_band: string | null;

  why_this_matters?: string | null;
  avoid_tonight?: string | null;
  encouragement?: string | null;
  what_protocol?: string | null;
  tonight_action?: string | null;
  tonight_action_plan?: string | null;
};

export default function SleepPage() {
  // ✅ Browser-side Supabase client
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  // ✅ TEMP: no auth wired yet (so no build errors)
  // When you add auth later, replace this with the real user id.
  const userId: string | null = null;

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<LatestNightRRSM | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // If no auth yet, do not query
        if (!userId) {
          setRow(null);
          return;
        }

        const { data, error: qErr } = await supabase
          .from("v_latest_night_rrsm")
          .select("*")
          .eq("user_id", userId)
          .order("computed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (qErr) {
          throw qErr;
        }

        setRow((data as LatestNightRRSM) ?? null);
      } catch (e: any) {
        if (cancelled) return;
        setRow(null);
        setError(e?.message ?? "Failed to load sleep data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const riskLabel = useMemo(() => {
    if (!row?.risk_band) return "—";
    return String(row.risk_band).toUpperCase();
  }, [row?.risk_band]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Sleep</h1>
        <p className="mt-2 text-sm opacity-80">Loading…</p>
      </div>
    );
  }

  // No auth wired yet → show a helpful message, but still compiles + deploys
  if (!userId) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-semibold">Sleep</h1>
        <div className="rounded-lg border p-4">
          <p className="text-sm">
            Auth is not wired yet, so this page can’t load user-specific sleep data.
          </p>
          <p className="mt-2 text-sm opacity-80">
            Next step: connect auth and set <code>userId</code> from the logged-in user.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-semibold">Sleep</h1>
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Error</p>
          <p className="mt-1 text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-semibold">Sleep</h1>
        <div className="rounded-lg border p-4">
          <p className="text-sm">No sleep record found yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sleep</h1>
        <p className="text-sm opacity-70">
          Latest computed:{" "}
          <span className="font-mono">
            {row.computed_at ? new Date(row.computed_at).toLocaleString() : "—"}
          </span>
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Risk band</p>
          <p className="text-sm font-semibold">{riskLabel}</p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Risk score</p>
          <p className="text-sm font-semibold">
            {row.risk_score === null || row.risk_score === undefined ? "—" : row.risk_score}
          </p>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        {row.why_this_matters ? (
          <div>
            <p className="text-sm font-medium">Why this matters</p>
            <p className="mt-1 text-sm opacity-90">{row.why_this_matters}</p>
          </div>
        ) : null}

        {row.avoid_tonight ? (
          <div>
            <p className="text-sm font-medium">Avoid tonight</p>
            <p className="mt-1 text-sm opacity-90">{row.avoid_tonight}</p>
          </div>
        ) : null}

        {row.encouragement ? (
          <div>
            <p className="text-sm font-medium">Encouragement</p>
            <p className="mt-1 text-sm opacity-90">{row.encouragement}</p>
          </div>
        ) : null}

        {row.what_protocol ? (
          <div>
            <p className="text-sm font-medium">What protocol</p>
            <p className="mt-1 text-sm opacity-90">{row.what_protocol}</p>
          </div>
        ) : null}

        {row.tonight_action ? (
          <div>
            <p className="text-sm font-medium">Tonight action</p>
            <p className="mt-1 text-sm opacity-90">{row.tonight_action}</p>
          </div>
        ) : null}

        {row.tonight_action_plan ? (
          <div>
            <p className="text-sm font-medium">Tonight action plan</p>
            <p className="mt-1 text-sm opacity-90">{row.tonight_action_plan}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
