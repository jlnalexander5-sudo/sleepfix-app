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
  // optional if you added these columns later
  primary_driver?: string | null;
  secondary_driver?: string | null;
  notes?: string | null;
};

type RRSMInsight = {
  code?: string;
  domain?: string;
  title: string;
  why: string[];
  actions: string[];
  confidence: "low" | "medium" | "high";
  // optional
  meta?: Record<string, unknown>;
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

function safeAvg(nums: Array<number | null | undefined>) {
  const xs = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function riskFromScore(score: number | null) {
  // Simple placeholder until RRSM risk scoring is formalized.
  if (score === null) return { level: "—", label: "No data" };
  if (score >= 80) return { level: "Low", label: "Stable" };
  if (score >= 60) return { level: "Moderate", label: "Watch" };
  return { level: "High", label: "At risk" };
}

function sparkline(values: number[]) {
  // Minimal text sparkline without any chart libs
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

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<NightRow[]>([]);

  const [insightLoading, setInsightLoading] = useState(false);
  const [insightErr, setInsightErr] = useState<string | null>(null);
  const [insight, setInsight] = useState<RRSMInsight | null>(null);

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

      const { data, error } = await supabase
        .from("v_sleep_night_metrics")
        .select(
          "night_id,user_id,created_at,duration_min,latency_min,wakeups_count,quality_num,primary_driver,secondary_driver,notes"
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

      setRows((data ?? []) as NightRow[]);
      setLoading(false);
    })();
  }, [supabase]);

  // Fetch RRSM insight for the same 7-night window
  useEffect(() => {
    if (!userId) return;
    (async () => {
      setInsightLoading(true);
      setInsightErr(null);
      try {
        const res = await fetch("/api/rrsm/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ days: 7, includeDrivers: true }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error ?? `RRSM analyze failed (${res.status})`);
        }
        const j = (await res.json()) as { insights?: RRSMInsight[] };
        setInsight(j?.insights?.[0] ?? null);
      } catch (e: any) {
        setInsight(null);
        setInsightErr(e?.message ?? "Failed to load RRSM insight");
      } finally {
        setInsightLoading(false);
      }
    })();
  }, [userId]);

  const [today, setToday] = useState<string>("");

  useEffect(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setToday(`${yyyy}-${mm}-${dd}`);
  }, []);

const nightsRecorded = rows.length;
  const avgQuality = safeAvg(rows.map((r) => r.quality_num));
  const avgDuration = safeAvg(rows.map((r) => r.duration_min));
  const avgLatency = safeAvg(rows.map((r) => r.latency_min));
  const avgWakeups = safeAvg(rows.map((r) => r.wakeups_count));

  // "Sleep Success" placeholder: % nights with quality >= 4
  const successScore = useMemo(() => {
    const qs = rows.map((r) => r.quality_num).filter((n): n is number => typeof n === "number");
    if (!qs.length) return null;
    const good = qs.filter((q) => q >= 4).length;
    return Math.round((good / qs.length) * 100);
  }, [rows]);

  const risk = useMemo(() => riskFromScore(successScore), [successScore]);

  const qualitySeries = useMemo(() => {
    // oldest -> newest for sparkline
    const xs = [...rows]
      .reverse()
      .map((r) => r.quality_num)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    return xs;
  }, [rows]);

  const durationSeries = useMemo(() => {
    const xs = [...rows]
      .reverse()
      .map((r) => r.duration_min)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    return xs;
  }, [rows]);

  const latencySeries = useMemo(() => {
    const xs = [...rows]
      .reverse()
      .map((r) => r.latency_min)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    return xs;
  }, [rows]);

  const wakeSeries = useMemo(() => {
    const xs = [...rows]
      .reverse()
      .map((r) => r.wakeups_count)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    return xs;
  }, [rows]);

  const latest = rows[0] ?? null;

  const trendLabel = useMemo(() => {
    const qs = qualitySeries;
    if (qs.length < 4) return "—";
    const last3 = qs.slice(-3);
    const prev3 = qs.slice(-6, -3);
    if (prev3.length < 3) return "—";
    const a = safeAvg(prev3) ?? 0;
    const b = safeAvg(last3) ?? 0;
    const diff = b - a;
    if (diff > 0.25) return "Getting better";
    if (diff < -0.25) return "Getting worse";
    return "Stable";
  }, [qualitySeries]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 14px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 34, margin: 0 }}>Dashboard</h1>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Today: {today}</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/protected/sleep" style={{ textDecoration: "underline" }}>
            Open sleep →
          </Link>
          <Link href="/protected/habits" style={{ textDecoration: "underline" }}>
            Open habits →
          </Link>
        </div>
      </div>

      {/* Status */}
      <div
        style={{
          marginTop: 14,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 14,
          background: "rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ fontWeight: 700 }}>Status</div>
        {loading ? (
          <div style={{ opacity: 0.85, marginTop: 6 }}>Loading your last 7 nights…</div>
        ) : err ? (
          <div style={{ color: "tomato", fontWeight: 700, marginTop: 6 }}>{err}</div>
        ) : (
          <div style={{ opacity: 0.85, marginTop: 6 }}>Ready.</div>
        )}
      </div>

      {/* KPI grid */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 12,
        }}
      >
        <KpiCard label="Nights recorded (last 7)" value={loading ? "…" : String(nightsRecorded)} sub="" />
        <KpiCard
          label="Avg sleep quality (last 7)"
          value={avgQuality == null ? "—" : String(round1(avgQuality))}
          sub={qualitySeries.length ? sparkline(qualitySeries) : ""}
        />
        <KpiCard
          label="Avg duration (min)"
          value={avgDuration == null ? "—" : String(Math.round(avgDuration))}
          sub={durationSeries.length ? sparkline(durationSeries) : ""}
        />
        <KpiCard
          label="Avg latency (min)"
          value={avgLatency == null ? "—" : String(Math.round(avgLatency))}
          sub={latencySeries.length ? sparkline(latencySeries) : ""}
        />
        <KpiCard
          label="Avg wake-ups"
          value={avgWakeups == null ? "—" : String(round1(avgWakeups))}
          sub={wakeSeries.length ? sparkline(wakeSeries) : ""}
        />
        <KpiCard
          label="Sleep success score"
          value={successScore == null ? "—" : `${successScore}%`}
          sub={successScore == null ? "" : `Trend: ${trendLabel}`}
        />
        <KpiCard label="Current risk level" value={risk.level} sub={risk.label} />
      </div>

      {/* Quality distribution */}
      <div
        style={{
          marginTop: 18,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Last 7-night sleep quality distribution</div>
        <QualityDistribution rows={rows} loading={loading} />
      </div>

      {/*
        Latest night + RRSM panel
        Mobile: 1 column (prevents squashed text)
        Desktop: 2 columns
      */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start" style={{ marginTop: 18 }}>
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <div style={{ fontWeight: 800 }}>Latest night explanation</div>
            <div style={{ opacity: 0.75 }}>{latest ? fmtDate(latest.created_at) : ""}</div>
          </div>
          {!latest ? (
            <div style={{ opacity: 0.75, marginTop: 10 }}>No sleep logs yet. Add one in Sleep.</div>
          ) : (
            <div style={{ marginTop: 10, lineHeight: 1.5 }}>
              <div style={{ opacity: 0.8, marginBottom: 8 }}>
                What you entered (drivers) helps the RRSM engine contextualize patterns.
              </div>
              <div>
                <strong>Primary:</strong> {latest.primary_driver ?? "(none)"}
              </div>
              <div>
                <strong>Secondary:</strong> {latest.secondary_driver ?? "(none)"}
              </div>
              <div>
                <strong>Notes:</strong> {latest.notes ?? "(none)"}
              </div>
              <div style={{ marginTop: 10, opacity: 0.85 }}>
                <strong>Metrics:</strong>{" "}
                {latest.duration_min != null ? `${latest.duration_min} min` : "—"}
                {latest.latency_min != null ? ` · Latency ${latest.latency_min} min` : ""}
                {latest.wakeups_count != null ? ` · Wake-ups ${latest.wakeups_count}` : ""}
                {latest.quality_num != null ? ` · Quality ${latest.quality_num}` : ""}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 10 }}>RRSM: what to do next</div>
          {insightLoading ? (
            <div style={{ opacity: 0.75 }}>Analyzing last 7 days…</div>
          ) : insightErr ? (
            <div style={{ color: "tomato", fontWeight: 700 }}>{insightErr}</div>
          ) : insight ? (
            <RRSMInsightCard insight={insight} />
          ) : (
            <div style={{ opacity: 0.75 }}>No RRSM insight yet.</div>
          )}
        </div>
      </div>

      {/* Raw list */}
      <details style={{ marginTop: 16, opacity: 0.95 }}>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Debug: last 7 nights (raw)</summary>
        <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(rows, null, 2)}
        </div>
      </details>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 14,
        padding: 14,
        minHeight: 86,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontWeight: 800, opacity: 0.85 }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.5 }}>{value}</div>
        <div style={{ fontFamily: "monospace", opacity: 0.6, fontSize: 12 }}>{sub}</div>
      </div>
    </div>
  );
}

function QualityDistribution({ rows, loading }: { rows: NightRow[]; loading: boolean }) {
  if (loading) return <div style={{ opacity: 0.75 }}>Loading…</div>;
  const qs = rows
    .map((r) => r.quality_num)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!qs.length) return <div style={{ opacity: 0.75 }}>No quality scores yet.</div>;

  const counts = [1, 2, 3, 4, 5].map((k) => qs.filter((q) => q === k).length);
  const max = Math.max(...counts, 1);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {[1, 2, 3, 4, 5].map((k, idx) => {
        const c = counts[idx];
        const w = Math.round((c / max) * 100);
        return (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "70px 1fr 40px", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 800 }}>Q{k}</div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ width: `${w}%`, height: "100%", background: "rgba(0,0,0,0.55)" }} />
            </div>
            <div style={{ textAlign: "right", fontFamily: "monospace", opacity: 0.8 }}>{c}</div>
          </div>
        );
      })}
    </div>
  );
}
