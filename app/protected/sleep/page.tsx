"use client";

// (Line ~1) Full working file. No AuthProvider. No useUser.
// Uses Supabase auth directly, so build won't fail due to missing providers.

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

// (Line ~10) Match your view columns. Add/remove fields if your DB returns more/less.
type LatestNightRRSM = {
  user_id: string;
  night_id?: string | null;
  computed_at?: string | null;

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
  // (Line ~28) Create Supabase client once.
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  // (Line ~31) State
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [row, setRow] = useState<LatestNightRRSM | null>(null);
  const [error, setError] = useState<string | null>(null);

  // (Line ~38) Load user + data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // (Line ~49) Get current user (works without any custom provider)
        const { data, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;

        const uid = data.user?.id ?? null;

        if (cancelled) return;
        setUserId(uid);

        // (Line ~59) If not logged in, no query
        if (!uid) {
          setRow(null);
          setLoading(false);
          return;
        }

        // (Line ~67) Fetch latest row from your view
        const { data: rrsm, error: rrsmErr } = await supabase
          .from("v_latest_night_rrsm")
          .select("*")
          .eq("user_id", uid)
          .order("computed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (rrsmErr) throw rrsmErr;

        if (cancelled) return;
        setRow((rrsm as LatestNightRRSM) ?? null);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load sleep data");
        setRow(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // (Line ~98) Derived display helpers
  const riskLabel = useMemo(() => {
    if (!row?.risk_band) return "—";
    return String(row.risk_band).toUpperCase();
  }, [row?.risk_band]);

  const riskScore = useMemo(() => {
    if (row?.risk_score === null || row?.risk_score === undefined) return "—";
    return String(row.risk_score);
  }, [row?.risk_score]);

  // (Line ~110) UI states
  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Sleep</h1>
        <div>Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Sleep</h1>
        <div style={{ color: "crimson", marginBottom: 12 }}>
          Error: {error}
        </div>
        <div style={{ opacity: 0.8 }}>
          Tip: Make sure your Vercel env vars are set and you’re logged in.
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Sleep</h1>
        <div style={{ marginBottom: 8 }}>You’re not signed in.</div>
        <div style={{ opacity: 0.8 }}>
          Please sign in to view your sleep risk score.
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Sleep</h1>
        <div style={{ marginBottom: 8 }}>No sleep record found yet.</div>
        <div style={{ opacity: 0.8 }}>
          Once you submit a night, your latest RRSM result will appear here.
        </div>
      </div>
    );
  }

  // (Line ~170) Main UI
  return (
    <div style={{ padding: 24, maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Sleep</h1>

      <div
        style={{
          border: "1px solid #2a2a2a",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Risk band</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{riskLabel}</div>
          </div>

          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Risk score</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{riskScore}</div>
          </div>

          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Computed at</div>
            <div style={{ fontSize: 14 }}>
              {row.computed_at ? String(row.computed_at) : "—"}
            </div>
          </div>
        </div>
      </div>

      <Section title="Why this matters" text={row.why_this_matters} />
      <Section title="Avoid tonight" text={row.avoid_tonight} />
      <Section title="Encouragement" text={row.encouragement} />
      <Section title="What protocol?" text={row.what_protocol} />
      <Section title="Tonight action" text={row.tonight_action} />
      <Section title="Tonight action plan" text={row.tonight_action_plan} />
    </div>
  );
}

// (Line ~235) Helper component (keeps page tidy)
function Section({ title, text }: { title: string; text?: string | null }) {
  return (
    <div
      style={{
        border: "1px solid #2a2a2a",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>
        {text && text.trim().length > 0 ? text : "—"}
      </div>
    </div>
  );
}
