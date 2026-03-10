"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import RRSMInsightCard from "@/components/RRSMInsightCard";
import { runRRSMEngineV2 } from "@/lib/rrsm/engine-v2";
import InstallAppButton from "@/components/InstallAppButton";

type NightRow = {
  night_id: string;
  user_id: string;
  created_at: string;
  local_date: string | null;
  duration_min: number | null;
  latency_min: number | null;
  wakeups_count: number | null;
  quality_num: number | null;
  // These are merged in from sleep_nights (not present on v_sleep_night_metrics)
  primary_driver: string | null;
  secondary_driver: string | null;
  notes?: string | null;
};


type DailyHabitRow = {
  user_id: string;
  date: string; // YYYY-MM-DD
  caffeine_after_2pm?: boolean | null;
  alcohol?: boolean | null;
  exercise?: boolean | null;
  screens_last_hour?: boolean | null;
};

type RRSMInsight = {
  title: string;
  why: string[];
  actions: string[];
  confidence: "low" | "medium" | "high";
  // Engine v2 extras (optional)
  risk?: "low" | "moderate" | "high";
  primaryIssue?: "recovery" | "onset" | "fragmentation" | "mixed";
  topDriver?: string;
  scores?: { recovery: number; onset: number; fragmentation: number; stability: number };
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

function parseChoiceToNumber(choice: string | null | undefined): number | null {
  if (!choice) return null;
  const s = String(choice).trim();
  if (!s) return null;
  // supports "60+", "5", "10", etc.
  const n = parseInt(s.replace("+", ""), 10);
  return Number.isFinite(n) ? n : null;
}


function dateKeyForNight(r: NightRow): string | null {
  const k = r.local_date ?? (r.created_at ? String(r.created_at).slice(0, 10) : null);
  return k && typeof k === "string" ? k : null;
}

function safeBool(v: any): boolean {
  return v === true;
}

function buildHabitSignals(rows: NightRow[], habitsByDate: Record<string, DailyHabitRow>): string[] {
  if (!rows.length) return [];

  const dates = rows.map(dateKeyForNight).filter((d): d is string => Boolean(d));
  if (!dates.length) return [];

  const habitDefs: Array<{ key: keyof DailyHabitRow; label: string }> = [
    { key: "caffeine_after_2pm", label: "Caffeine after 2pm" },
    { key: "alcohol", label: "Alcohol" },
    { key: "exercise", label: "Exercise" },
    { key: "screens_last_hour", label: "Screens last hour" },
  ];

  type Cand = { score: number; line: string };
  const cands: Cand[] = [];

  for (const h of habitDefs) {
    const nightsWith: NightRow[] = [];
    const nightsWithout: NightRow[] = [];

    for (const r of rows) {
      const d = dateKeyForNight(r);
      if (!d) continue;
      const hab = habitsByDate[d];
      const flag = hab ? safeBool((hab as any)[h.key]) : false;
      (flag ? nightsWith : nightsWithout).push(r);
    }

    const nWith = nightsWith.length;
    const nTotal = nightsWith.length + nightsWithout.length;
    if (nTotal < 3 || nWith === 0 || nWith === nTotal) continue; // need contrast

    const avgLatWith = safeAvg(nightsWith.map((r) => r.latency_min));
    const avgLatNo = safeAvg(nightsWithout.map((r) => r.latency_min));
    const avgWuWith = safeAvg(nightsWith.map((r) => r.wakeups_count));
    const avgWuNo = safeAvg(nightsWithout.map((r) => r.wakeups_count));
    const avgQWith = safeAvg(nightsWith.map((r) => r.quality_num));
    const avgQNo = safeAvg(nightsWithout.map((r) => r.quality_num));

    const dLat = avgLatWith === null || avgLatNo === null ? 0 : avgLatWith - avgLatNo;
    const dWu = avgWuWith === null || avgWuNo === null ? 0 : avgWuWith - avgWuNo;
    const dQ = avgQWith === null || avgQNo === null ? 0 : avgQWith - avgQNo;

    const score = Math.abs(dLat) / 5 + Math.abs(dWu) * 2 + Math.abs(dQ) * 1;

    // choose a primary metric line (most interpretable)
    const parts: string[] = [];
    if (avgLatWith !== null && avgLatNo !== null) parts.push(`latency ${signNum(dLat)}${round1(dLat)}m`);
    if (avgWuWith !== null && avgWuNo !== null) parts.push(`wake-ups ${signNum(dWu)}${round1(dWu)}`);
    if (avgQWith !== null && avgQNo !== null) parts.push(`quality ${signNum(-dQ)}${round1(Math.abs(dQ))} (worse)`);

    // Build a clean sentence prioritizing latency/wakeups/quality deltas
    const metricLine =
      avgLatWith !== null && avgLatNo !== null && Math.abs(dLat) >= Math.abs(dWu) * 5
        ? `avg latency ${signWord(dLat)}${round1(Math.abs(dLat))}m`
        : avgWuWith !== null && avgWuNo !== null && Math.abs(dWu) >= 0.5
          ? `avg wake-ups ${signWord(dWu)}${round1(Math.abs(dWu))}`
          : avgQWith !== null && avgQNo !== null && Math.abs(dQ) >= 0.5
            ? `avg quality ${dQ < 0 ? "lower by " : "higher by "}${round1(Math.abs(dQ))}`
            : null;

    if (!metricLine) continue;

    const line = `${h.label}: ${nWith}/${nTotal} days. When checked, ${metricLine} vs not checked.`;
    cands.push({ score, line });
  }

  cands.sort((a, b) => b.score - a.score);
  return cands.slice(0, 2).map((c) => c.line);
}

function signWord(delta: number): string {
  return delta >= 0 ? "higher by " : "lower by ";
}
function signNum(delta: number): string {
  return delta >= 0 ? "+" : "-";
}


function safeAvg(nums: Array<number | null | undefined>) {
  const xs = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
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

// Stability score (0..100): lower variability across the last 7 nights => higher stability.
// (Dashboard v10 placeholder — can be replaced later by RRSM scoring.)

function driverIndicator(rows: NightRow[]) {
  const drivers = rows
    .map((r) => (r.primary_driver ?? r.secondary_driver ?? "").trim())
    .filter((s) => !!s);
  return mostCommon(drivers);
}

function MiniLineChart({ values }: { values: number[] }) {
  if (!values.length) return null;

  const width = 150;
  const height = 30;
  const pad = 2;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const pts = values.map((v, i) => {
    const x = pad + (i * (width - pad * 2)) / Math.max(1, values.length - 1);
    const t = (v - min) / span;
    const y = pad + (1 - t) * (height - pad * 2);
    return [x, y] as const;
  });

  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.75" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill="currentColor" />
    </svg>
  );
}

function dateKey(r: NightRow) {
  // Prefer the stored local_date (YYYY-MM-DD). Fallback: created_at date slice.
  if (r.local_date && String(r.local_date).trim()) return String(r.local_date).slice(0, 10);
  return String(r.created_at ?? "").slice(0, 10);
}

function dedupeByNightDate(rows: NightRow[], maxUnique: number) {
  const out: NightRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const k = dateKey(r);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= maxUnique) break;
  }
  return out;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<NightRow[]>([]);
  const [habitsByDate, setHabitsByDate] = useState<Record<string, DailyHabitRow>>({});
  const [habitsErr, setHabitsErr] = useState<string | null>(null);


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

      const { data, error } = await supabase
        .from("sleep_nights")
        .select([
    "id",
    "user_id",
    "created_at",
    "local_date",
    "sleep_quality",
    "sleep_latency_choice",
    "wake_ups_choice",
        "primary_driver",
    "secondary_driver",
    "notes"
  ].join(","))
        .eq("user_id", uid)
        .order("local_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        setErr(error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      
const nextRows: NightRow[] = (data ?? []).map((r: any) => {
  const quality = typeof r.sleep_quality === "number" ? r.sleep_quality : parseChoiceToNumber(r.sleep_quality);

  const latency = parseChoiceToNumber(r.sleep_latency_choice);

  const wakeups = parseChoiceToNumber(r.wake_ups_choice);

  return {
    night_id: r.id,
    user_id: r.user_id,
    created_at: r.created_at,
    local_date: r.local_date ?? null,
    duration_min: null,
    latency_min: latency,
    wakeups_count: wakeups,
    quality_num: quality,
    primary_driver: r.primary_driver ?? null,
    secondary_driver: r.secondary_driver ?? null,
    notes: r.notes ?? null,
  };
});
const uniqueRows = dedupeByNightDate(nextRows, 7);
      setRows(uniqueRows);

      setLoading(false);

      // RRSM Engine v2 (scoring + narrative)
      setInsightErr(null);
      try {
        const rrsm = runRRSMEngineV2(
          uniqueRows.map((r) => ({
            dateKey: r.local_date ?? (r.created_at ? String(r.created_at).slice(0, 10) : undefined),
            quality: r.quality_num,
            latencyMin: r.latency_min,
            wakeUps: r.wakeups_count,
            primaryDriver: r.primary_driver,
            secondaryDriver: r.secondary_driver,
          }))
        );
        setInsight(rrsm);
      } catch (e: any) {
        setInsight(null);
        setInsightErr(e?.message ?? "Failed to build RRSM insight");
      }
    })();
  }, [supabase]);

  // Load habits for the same dates as the last 7 nights (for simple correlation hints)
  useEffect(() => {
    let cancelled = false;

    async function loadHabits() {
      if (!userId || rows.length === 0) {
        setHabitsByDate({});
        return;
      }

      setHabitsErr(null);

      const dates = Array.from(
        new Set(rows.map(dateKeyForNight).filter((d): d is string => Boolean(d)))
      );

      if (dates.length === 0) {
        setHabitsByDate({});
        return;
      }

      const { data, error } = await supabase
        .from("daily_habits")
        .select("date,caffeine_after_2pm,alcohol,exercise,screens_last_hour")
        .eq("user_id", userId)
        .in("date", dates);

      if (cancelled) return;

      if (error) {
        setHabitsErr(error.message);
        setHabitsByDate({});
        return;
      }

      const map: Record<string, DailyHabitRow> = {};
      (data ?? []).forEach((r: any) => {
        map[r.date] = r as DailyHabitRow;
      });
      setHabitsByDate(map);
    }

    loadHabits();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, rows]);



  const avgQuality = useMemo(() => safeAvg(rows.map((r) => r.quality_num)), [rows]);
  const avgLatency = useMemo(() => safeAvg(rows.map((r) => r.latency_min)), [rows]);
  const avgWakeups = useMemo(() => safeAvg(rows.map((r) => r.wakeups_count)), [rows]);
  const qualitySeries = useMemo(
    () => rows.map((r) => r.quality_num).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
    [rows]
  );

  const totalLatency = useMemo(() => rows.reduce((sum, r) => sum + (r.latency_min ?? 0), 0), [rows]);
  const totalWakeups = useMemo(() => rows.reduce((sum, r) => sum + (r.wakeups_count ?? 0), 0), [rows]);

  const stability = useMemo(() => (insight?.scores ? insight.scores.stability : null), [insight]);
  const topDriver = useMemo(() => driverIndicator(rows), [rows]);


  const habitSignals = useMemo(() => buildHabitSignals(rows, habitsByDate), [rows, habitsByDate]);

  const insightForCard = useMemo(() => {
    if (!insight) return null;
    if (!habitSignals.length) return insight;
    // Add small "habits" hints at the end of the Why section (keeps UI simple)
    const extra = habitSignals.map((s) => `Habits: ${s}`);
    return { ...insight, why: [...insight.why, ...extra] };
  }, [insight, habitSignals]);



  const risk = useMemo(() => {
    const r = insight?.risk ?? null;
    if (!r) return { level: "—", label: "No data" };
    if (r === "low") return { level: "Low", label: "Stable" };
    if (r === "moderate") return { level: "Moderate", label: "Watch" };
    return { level: "High", label: "At risk" };
  }, [insight]);

  return (
    <div style={{ width: "100%", maxWidth: 1400, margin: "0 auto", padding: "28px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 800 , color: 'var(--sf-brand)'}}>Dashboard</div>
          <InstallAppButton />
          <div style={{ marginTop: 6, color: "#444" }}>
            Last 7 nights snapshot (baseline unlock at 3 valid nights).
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
              border: "1px solid #e5e7eb",
              borderRadius: 18,
              background: "#ffffff",
              padding: 16,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                alignItems: "stretch",
              }}
            >
            <div className="sf-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#444" }}>Sleep quality (avg)</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
                {avgQuality === null ? "—" : `${round1(avgQuality)}/10`}
              </div>
              <div style={{ marginTop: 6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                <MiniLineChart values={qualitySeries} />
              </div>
            </div>

            <div className="sf-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#444" }}>Latency (avg)</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
                {avgLatency === null ? "—" : `${round1(avgLatency)}m`}
              </div>
            </div>

            <div className="sf-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#444" }}>Wake ups (avg)</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
                {avgWakeups === null ? "—" : round1(avgWakeups)}
              </div>
            </div>

            <div className="sf-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#444" }}>RRSM risk</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{risk.level}</div>
              <div style={{ marginTop: 6, color: "#444" }}>{risk.label}</div>
            </div>

            <div className="sf-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#444" }}>Stability score</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, whiteSpace: "nowrap" }}>
                {stability === null ? "—" : `${round1(stability)}/100`}
              </div>
              <div style={{ marginTop: 6, color: "#444" }}>
                {stability === null ? "Add more nights" : stability >= 80 ? "Stable" : stability >= 60 ? "Some variation" : "Highly variable"}
              </div>
            </div>

            <div className="sf-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#444" }}>Top driver</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>{topDriver ?? "—"}</div>
              <div style={{ marginTop: 6, color: "#444" }}>{topDriver ? "Most commonly logged" : "No driver logged yet"}</div>
            </div>
          </div>
          </div>

          <div style={{ marginTop: 16 }}>
            {insightErr ? (
              <div style={{ color: "#b00020" }}>{insightErr}</div>
            ) : insight ? (
              <RRSMInsightCard insight={insightForCard} />
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
                      <td style={{ padding: "10px 12px" }}>{fmtDate(r.local_date ?? r.created_at)}</td>
                      <td style={{ padding: "10px 12px" }}>{r.quality_num ?? "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{r.latency_min ?? "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{r.wakeups_count ?? "—"}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid #e5e5e5", background: "#fafafa", fontWeight: 800 }}>
                    <td style={{ padding: "10px 12px" }}>Totals</td>
                    <td style={{ padding: "10px 12px" }}>
                      {avgQuality === null ? "—" : round1(avgQuality)}
                      <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "#666" }}>AVE</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {totalLatency}
                      <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "#666" }}>SUM</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {totalWakeups}
                      <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "#666" }}>SUM</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
