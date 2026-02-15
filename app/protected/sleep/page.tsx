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
  const supabase = createBrowserSupabaseClient();

  const userId = null; // 🔁 Replace with real auth later

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LatestNightRRSM[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        if (!userId) {
          setRows([]);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("v_latest_night_rrsm")
          .select("*")
          .eq("user_id", userId)
          .order("computed_at", { ascending: false })
          .limit(7);

        if (error) throw error;

        if (!cancelled) {
          setRows(data || []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to load sleep data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, supabase]);

  const latest = rows[0];

  const trend = useMemo(() => {
    if (!rows.length) return null;

    const valid = rows.filter(r => r.risk_score !== null);
    if (!valid.length) return null;

    const latestRisk = valid[0].risk_score!;
    const avg7 =
      valid.reduce((sum, r) => sum + (r.risk_score ?? 0), 0) /
      valid.length;

    const delta = latestRisk - avg7;

    let direction = "stable";
    if (delta > 5) direction = "worsening";
    if (delta < -5) direction = "improving";

    return {
      avg7: Math.round(avg7),
      delta: Math.round(delta),
      direction,
    };
  }, [rows]);

  if (loading) {
    return <div className="p-6">Loading sleep insights...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-400">{error}</div>;
  }

  if (!latest) {
    return <div className="p-6">No sleep data yet.</div>;
  }

  return (
    <div className="p-6 space-y-6">

      {/* Risk Summary */}
      <div className="border rounded-lg p-4">
        <div className="text-sm opacity-70">Risk band</div>
        <div className="text-xl font-bold">{latest.risk_band ?? "-"}</div>

        <div className="mt-2 text-sm opacity-70">Risk score</div>
        <div className="text-lg">{latest.risk_score ?? "-"}</div>

        <div className="mt-2 text-sm opacity-70">Computed at</div>
        <div>{latest.computed_at}</div>
      </div>

      {/* Trend Intelligence */}
      {trend && (
        <div className="border rounded-lg p-4">
          <div className="text-sm opacity-70">7-Day Average</div>
          <div className="text-lg">{trend.avg7}</div>

          <div className="mt-2 text-sm opacity-70">Trend</div>
          <div className="text-lg font-semibold">
            {trend.direction === "improving" && "↓ Improving"}
            {trend.direction === "worsening" && "↑ Worsening"}
            {trend.direction === "stable" && "→ Stable"}
          </div>

          <div className="mt-2 text-sm opacity-70">
            Compared to 7-day average ({trend.delta >= 0 ? "+" : ""}
            {trend.delta})
          </div>
        </div>
      )}

      {/* Advice Blocks */}
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

    </div>
  );
}
