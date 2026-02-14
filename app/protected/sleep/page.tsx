"use client";

import React, { useEffect, useMemo, useState } from "react";

// ✅ NO @ alias — relative imports instead
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
  const supabase = createBrowserSupabaseClient()
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<LatestNightRRSM | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        if (!user?.id) {
          setRow(null);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("v_latest_night_rrsm")
          .select("*")
          .eq("user_id", user.id)
          .order("computed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error) throw error;
        setRow((data as any) ?? null);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load sleep data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const riskLabel = useMemo(() => {
    if (!row?.risk_band) return "—";
    return String(row.risk_band).toUpperCase();
  }, [row?.risk_band]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm opacity-70">Loading sleep insights…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <div className="font-semibold">Sleep</div>
        <div className="text-sm text-red-600">{error}</div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="p-6 space-y-2">
        <div className="font-semibold">Sleep</div>
        <div className="text-sm opacity-70">No data yet.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Sleep</h1>
        <div className="text-sm opacity-70">
          Risk: <span className="font-semibold">{riskLabel}</span>
          {row.risk_score != null ? ` (${row.risk_score})` : ""}
        </div>
      </div>

      <section className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Why this matters</div>
        <div className="text-sm opacity-80">{row.why_this_matters ?? "—"}</div>
      </section>

      <section className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Avoid tonight</div>
        <div className="text-sm opacity-80">{row.avoid_tonight ?? "—"}</div>
      </section>

      <section className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Encouragement</div>
        <div className="text-sm opacity-80">{row.encouragement ?? "—"}</div>
      </section>

      <section className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Tonight action</div>
        <div className="text-sm opacity-80">{row.tonight_action ?? "—"}</div>
      </section>

      <section className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Protocol</div>
        <div className="text-sm opacity-80">{row.what_protocol ?? "—"}</div>
      </section>
    </div>
  );
}
