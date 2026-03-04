"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import RRSMInsightCard from "@/components/RRSMInsightCard";

type NightRow = {
  night_id: string;
  user_id: string;
  created_at: string;
  duration_min: number | null;
  latency_min: number | null;
  wakeups_count: number | null;
  quality_num: number | null;
  // Raw sleep_nights fields (optional, helpful for debugging)
  sleep_latency_choice?: string | null;
  wake_ups_choice?: string | null;
  sleep_quality?: number | null;
  // These are merged in from sleep_nights (not present on v_sleep_night_metrics)
  primary_driver: string | null;
  secondary_driver: string | null;
  notes?: string | null;
};

type RRSMInsight = {
  title: string;
  why: string[];
  actions: string[];
  confidence: "low" | "medium" | "high";
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function latencyChoiceToMinutes(choice?: string | null): number | null {
  if (!choice) return null;
  const c = String(choice).trim().toLowerCase();
  if (c === "0-15" || c === "0–15") return 8;
  if (c === "15-30" || c === "15–30") return 23;
  if (c === "30-45" || c === "30–45") return 38;
  if (c === "45-60" || c === "45–60") return 53;
  if (c === "60+" || c === "60 +" || c.includes("60")) return 75;
  return null;
}

function wakeupsChoiceToCount(choice?: string | null): number | null {
  if (!choice) return null;
  const c = String(choice).trim().toLowerCase();
  if (c === "0") return 0;
  if (c === "1-2" || c === "1–2") return 2;
  if (c === "3-4" || c === "3–4") return 4;
  if (c === "5+" || c === "5 +" || c.includes("5")) return 5;
  return null;
}

function minutesBetween(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null;
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  const diff = Math.round((e - s) / 60000);
  if (!Number.isFinite(diff) || diff <= 0) return null;
  return diff;
}

function safeAvg(nums: Array<number | null | undefined>) {
  const xs = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function riskFromScore(score: number | null) {
  if (score === null) return { level: "—", label: "No data" };
  if (score >= 80) return { level: "Low", label: "Stable" };
  if (score >= 60) return { level: "Moderate", label: "Watch" };
  return { level: "High", label: "At risk" };
}

function sparkline(values: number[]) {
  const blocks = "▁▂▃▄▅▆▇█";
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return "▅".repeat(values.length);
  return values
    .map((v) => {
      const t = (v - min) / (max - min);
      const idx = Math.max(0, Math.min(blocks.length - 1, Math.round(t * (blocks.length - 1))));
      return blocks[idx];
    })
    .join("");
}

function isValidNight(r: NightRow) {
  // For the “baseline unlock at 3 nights” gate: require the core quick-check fields
  return (
    typeof r.quality_num === "number" &&
    typeof r.latency_min === "number" &&
    typeof r.wakeups_count === "number"
  );
}

function mostCommon(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = (v ?? "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of counts.entries()) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function buildLocalInsight(rows: NightRow[]): RRSMInsight {
  const valid = rows.filter(isValidNight);
  const validCount = valid.length;

  if (validCount < 3) {
    return {
      title: `Building your baseline (unlock at 3 nights)`,
      why: [
        `Logged: ${validCount}/3 valid nights in the last 7 days.`,
        `We wait for a minimum pattern window to avoid early / inaccurate conclusions.`,
        `A valid night requires: Sleep Quality (1–10), Latency, Wake Ups.`,
      ],
      actions: [
        `Log tonight’s sleep (start/end).`,
        `Fill Sleep Quality, Latency, Wake Ups.`,
        `Add at least 1 tag in Mind + Environment + Body.`,
      ],
      confidence: "low",
    };
  }

  const avgQ = safeAvg(valid.map((r) => r.quality_num));
  const avgLat = safeAvg(valid.map((r) => r.latency_min));
  const avgW = safeAvg(valid.map((r) => r.wakeups_count));
  const topDriver = mostCommon(valid.map((r) => r.primary_driver).filter((v): v is string => !!v)) ?? "(no driver logged)";

  const why: string[] = [];
  if (avgQ !== null) why.push(`Avg sleep quality (last ${validCount} valid nights): ${round1(avgQ)}/10.`);
  if (avgLat !== null) why.push(`Avg sleep latency: ${round1(avgLat)} mins.`);
  if (avgW !== null) why.push(`Avg wake ups: ${round1(avgW)}.`);
  why.push(`Most common driver logged: ${topDriver}.`);

  const actions: string[] = [];
  if (topDriver !== "(no driver logged)") {
    actions.push(`Focus one change around “${topDriver}” for 2–3 nights and compare.`);
  }
  actions.push(`Keep logging at least 3 nights/week to strengthen the pattern.`);
  actions.push(`After 7 valid nights, we’ll generate a stronger RRSM insight.`);

  return {
    title: "RRSM preview (early signal)",
    why,
    actions,
    confidence: "medium",
  };
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<NightRow[]>([]);

  const [insight, setInsight] = useState<RRSMInsight | null>(null);
  const [insightErr, setInsightErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setRows([]);
        setLoading(false);
        return;
      }

      // Pull directly from sleep_nights.
      // (The v_sleep_night_metrics view can return nulls if it falls behind schema/choice changes.)
      const { data, error } = await supabase
        .from("sleep_nights")
        .select(
          "id,user_id,created_at,local_date,start_time,end_time,sleep_quality,sleep_latency_choice,wake_ups_choice,primary_driver,secondary_driver,notes"
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(7);

      if (error) {
        setErr(error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const nextRows: NightRow[] = (data ?? []).map((n: any) => {
        const createdAt = n.created_at ?? n.local_date ?? new Date().toISOString();
        const duration = minutesBetween(n.start_time, n.end_time);
        const latency = latencyChoiceToMinutes(n.sleep_latency_choice);
        const wakes = wakeupsChoiceToCount(n.wake_ups_choice);
        const quality = typeof n.sleep_quality === "number" ? n.sleep_quality : null;

        return {
          night_id: n.id,
          user_id: n.user_id,
          created_at: createdAt,
          duration_min: duration,
          latency_min: latency,
          wakeups_count: wakes,
          quality_num: quality,
          sleep_quality: quality,
          sleep_latency_choice: n.sleep_latency_choice ?? null,
          wake_ups_choice: n.wake_ups_choice ?? null,
          primary_driver: n.primary_driver ?? null,
          secondary_driver: n.secondary_driver ?? null,
          notes: n.notes ?? null,
        };
      });

      setRows(nextRows);
      setLoading(false);

      // Local RRSM preview until the full engine is wired.
      setInsightErr(null);
      try {
        setInsight(buildLocalInsight(nextRows));
      } catch (e: any) {
        setInsight(null);
        setInsightErr(e?.message ?? "Failed to build RRSM insight");
      }
    })();
  }, [supabase]);

  const avgQuality = useMemo(() => safeAvg(rows.map((r) => r.quality_num)), [rows]);
  const avgLatency = useMemo(() => safeAvg(rows.map((r) => r.latency_min)), [rows]);
  const avgWakeups = useMemo(() => safeAvg(rows.map((r) => r.wakeups_count)), [rows]);
  const qualitySeries = useMemo(
    () => rows.map((r) => r.quality_num).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
    [rows]
  );

  // Simple “score” placeholder: 10-point quality -> 0..100
  const score = avgQuality === null ? null : Math.max(0, Math.min(100, (avgQuality / 10) * 100));
  const risk = riskFromScore(score);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 800 , color: 'var(--sf-brand)'}}>Dashboard</div>
          <div style={{ marginTop: 6, color: "#444" }}>
            Last 7 nights snapshot + RRSM preview (baseline unlock at 3 valid nights).
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 18 }}>Loading…</div>
      ) : err ? (
        <div style={{ marginTop: 18, color: "#b00020" }}>{err}</div>
      ) : !userId ? (
        <div style={{ marginTop: 18 }}>Please sign in.</div>
      ) : (
        <>
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <div className="sf-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: "#666" }}>Sleep quality (avg)</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
                {avgQuality === null ? "—" : `${round1(avgQuality)}/10`}
              </div>
              <div style={{ marginTop: 6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                {sparkline(qualitySeries)}
              </div>
            </div>

            <div className="sf-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: "#666" }}>Latency (avg)</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
                {avgLatency === null ? "—" : `${round1(avgLatency)}m`}
              </div>
            </div>

            <div className="sf-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: "#666" }}>Wake ups (avg)</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
                {avgWakeups === null ? "—" : round1(avgWakeups)}
              </div>
            </div>

            <div className="sf-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: "#666" }}>RRSM risk (placeholder)</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{risk.level}</div>
              <div style={{ marginTop: 6, color: "#444" }}>{risk.label}</div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            {insightErr ? (
              <div style={{ color: "#b00020" }}>{insightErr}</div>
            ) : insight ? (
              <RRSMInsightCard insight={insight} />
            ) : null}
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Recent nights</div>
            <div className="sf-card" style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f7f7f7" }}>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#666" }}>
                      Date
                    </th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#666" }}>
                      Quality
                    </th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#666" }}>
                      Latency
                    </th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#666" }}>
                      Wake ups
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.night_id} style={{ borderTop: "1px solid #eee" }}>
                      <td style={{ padding: "10px 12px" }}>{fmtDate(r.created_at)}</td>
                      <td style={{ padding: "10px 12px" }}>{r.quality_num ?? "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{r.latency_min ?? r.sleep_latency_choice ?? "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{r.wakeups_count ?? r.wake_ups_choice ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
