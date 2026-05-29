"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import RRSMInsightCard from "@/components/RRSMInsightCard";
import { runRRSMEngineV2 } from "@/lib/rrsm/engine-v2";

type NightRow = {
  night_id: string;
  user_id: string;
  created_at: string;
  local_date: string | null;
  duration_min: number | null;
  latency_min: number | null;
  wakeups_count: number | null;
  wake_recovery_min: number | null;
  estimated_sleep_min: number | null;
  sleep_efficiency_pct: number | null;
  quality_num: number | null;
  primary_driver: string | null;
  secondary_driver: string | null;
  notes?: string | null;
};

type RRSMInsight = {
  title: string;
  why: string[];
  actions: string[];
  confidence: "low" | "medium" | "high";
  risk?: "low" | "moderate" | "high";
  primaryIssue?: "recovery" | "onset" | "fragmentation" | "mixed";
  topDriver?: string;
  scores?: { recovery: number; onset: number; fragmentation: number; stability: number };
};

function parseChoiceToNumber(choice: string | number | null | undefined): number | null {
  if (typeof choice === "number" && Number.isFinite(choice)) return choice;
  if (!choice) return null;
  const n = parseInt(String(choice).replace("+", ""), 10);
  return Number.isFinite(n) ? n : null;
}

function parseWakeRecovery(choice: string | null | undefined): number | null {
  if (!choice) return null;
  const cleaned = choice.toLowerCase().trim();
  if (cleaned.includes("0-5")) return 5;
  if (cleaned.includes("5-15")) return 15;
  if (cleaned.includes("15-30")) return 30;
  if (cleaned.includes("30-60")) return 60;
  if (cleaned.includes("60+")) return 90;
  const n = parseInt(cleaned.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function deriveDurationMin(row: any): number | null {
  if (typeof row.duration_min === "number" && Number.isFinite(row.duration_min)) return row.duration_min;

  if (row.sleep_start && row.sleep_end) {
    const start = new Date(row.sleep_start).getTime();
    const end = new Date(row.sleep_end).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.round((end - start) / 60000);
    }
  }

  return null;
}

function calculateTimeStats(duration: number | null, latency: number | null, wakeRecovery: number | null) {
  const awake = (latency ?? 0) + (wakeRecovery ?? 0);
  const estimatedSleep = typeof duration === "number" ? Math.max(0, duration - awake) : null;
  const efficiency =
    typeof duration === "number" && duration > 0 && typeof estimatedSleep === "number"
      ? Math.round((estimatedSleep / duration) * 100)
      : null;

  return { estimatedSleep, efficiency };
}

function formatHours(min: number | null | undefined) {
  if (typeof min !== "number" || !Number.isFinite(min)) return "—";
  return `${Math.round((min / 60) * 10) / 10}h`;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function safeAvg(nums: Array<number | null | undefined>) {
  const xs = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function dateKey(r: NightRow) {
  if (r.local_date && String(r.local_date).trim()) return String(r.local_date).slice(0, 10);
  return String(r.created_at ?? "").slice(0, 10);
}

function addDaysYMD(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dedupeByNightDate(rows: NightRow[], maxUnique: number) {
  const out: NightRow[] = [];
  const seen = new Set<string>();
  const sorted = [...rows].sort((a, b) => dateKey(b).localeCompare(dateKey(a)));

  for (const row of sorted) {
    const key = dateKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= maxUnique) break;
  }

  return out;
}

function filterToLatest7CalendarDays(rows: NightRow[]) {
  const unique = dedupeByNightDate(rows, 30);
  const latestDate = unique.map(dateKey).filter(Boolean).sort().at(-1);
  if (!latestDate) return [];

  const earliestAllowed = addDaysYMD(latestDate, -6);
  return unique.filter((r) => dateKey(r) >= earliestAllowed && dateKey(r) <= latestDate).slice(0, 7);
}

function includesAny(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function detectRelevantFocus(rows: NightRow[], insight: RRSMInsight | null) {
  const latest = rows[0];
  const avgLatency = safeAvg(rows.map((r) => r.latency_min));
  const avgWakeups = safeAvg(rows.map((r) => r.wakeups_count));
  const avgWakeRecovery = safeAvg(rows.map((r) => r.wake_recovery_min));
  const avgQuality = safeAvg(rows.map((r) => r.quality_num));
  const combined = rows.map((r) => `${r.primary_driver ?? ""} ${r.secondary_driver ?? ""} ${r.notes ?? ""}`).join(" ");

  const focus: string[] = [];

  if (includesAny(combined, ["hot", "cold", "temperature", "thermal", "room", "bed", "blanket", "pillow", "humid"])) {
    focus.push("thermal");
  }

  if (includesAny(combined, ["doms", "sore", "pain", "body", "pressure", "muscle", "tense", "inflammation"])) {
    focus.push("body");
  }

  if ((avgWakeups ?? 0) >= 2 || (avgWakeRecovery ?? 0) >= 15 || insight?.primaryIssue === "fragmentation") {
    focus.push("wake-maintenance");
  }

  if ((avgLatency ?? 0) >= 30 || insight?.primaryIssue === "onset") {
    focus.push("sleep-onset");
  }

  if ((avgQuality ?? 10) <= 6 || insight?.primaryIssue === "recovery") {
    focus.push("recovery");
  }

  if (!focus.length && latest) focus.push("baseline");
  return Array.from(new Set(focus));
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="sf-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#4b5563" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 30, lineHeight: 1.1, fontWeight: 950, color: "#000080" }}>{value}</div>
      <div style={{ marginTop: 6, color: "#4b5563", fontSize: 14 }}>{note}</div>
    </div>
  );
}

function TrendLine({ rows, metric }: { rows: NightRow[]; metric: keyof NightRow }) {
  const values = [...rows]
    .reverse()
    .map((row) => row[metric])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length < 2) return <span style={{ color: "#6b7280" }}>Need more nights</span>;

  const first = values[0];
  const last = values[values.length - 1];
  const delta = round1(last - first);
  if (delta === 0) return <span>No major change</span>;
  return <span>{delta > 0 ? `Up ${delta}` : `Down ${Math.abs(delta)}`}</span>;
}

export default function ResultsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<NightRow[]>([]);
  const [insight, setInsight] = useState<RRSMInsight | null>(null);
  const [insightErr, setInsightErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      setLoading(true);
      setErr(null);
      setInsightErr(null);

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      if (cancelled) return;

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
          "wake_recovery_choice",
          "duration_min",
          "sleep_start",
          "sleep_end",
          "primary_driver",
          "secondary_driver",
          "notes",
        ].join(","))
        .eq("user_id", uid)
        .order("local_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(30);

      if (cancelled) return;

      if (error) {
        setErr(error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const mapped: NightRow[] = (data ?? []).map((r: any) => {
        const quality = parseChoiceToNumber(r.sleep_quality);
        const latency = parseChoiceToNumber(r.sleep_latency_choice);
        const wakeups = parseChoiceToNumber(r.wake_ups_choice);
        const wakeRecovery = parseWakeRecovery(r.wake_recovery_choice);
        const duration = deriveDurationMin(r);
        const timeStats = calculateTimeStats(duration, latency, wakeRecovery);

        return {
          night_id: r.id,
          user_id: r.user_id,
          created_at: r.created_at,
          local_date: r.local_date ?? null,
          duration_min: duration,
          latency_min: latency,
          wakeups_count: wakeups,
          wake_recovery_min: wakeRecovery,
          estimated_sleep_min: timeStats.estimatedSleep,
          sleep_efficiency_pct: timeStats.efficiency,
          quality_num: quality,
          primary_driver: r.primary_driver ?? null,
          secondary_driver: r.secondary_driver ?? null,
          notes: r.notes ?? null,
        };
      });

      const latest7 = filterToLatest7CalendarDays(mapped);
      setRows(latest7);

      try {
        const rrsm = runRRSMEngineV2(
          latest7.map((r) => ({
            dateKey: r.local_date ?? String(r.created_at).slice(0, 10),
            quality: r.quality_num,
            latencyMin: r.latency_min,
            wakeUps: r.wakeups_count,
            primaryDriver: r.primary_driver,
            secondaryDriver: r.secondary_driver,
          })),
        );
        setInsight(rrsm);
      } catch (e: any) {
        setInsight(null);
        setInsightErr(e?.message ?? "Failed to build SleepFix result.");
      }

      setLoading(false);
    }

    loadResults();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const latestNight = rows[0] ?? null;
  const avgQuality = useMemo(() => safeAvg(rows.map((r) => r.quality_num)), [rows]);
  const avgLatency = useMemo(() => safeAvg(rows.map((r) => r.latency_min)), [rows]);
  const avgWakeups = useMemo(() => safeAvg(rows.map((r) => r.wakeups_count)), [rows]);
  const avgWakeRecovery = useMemo(() => safeAvg(rows.map((r) => r.wake_recovery_min)), [rows]);
  const avgSleepEfficiency = useMemo(() => safeAvg(rows.map((r) => r.sleep_efficiency_pct)), [rows]);
  const focus = useMemo(() => detectRelevantFocus(rows, insight), [rows, insight]);

  return (
    <div style={{ width: "100%", maxWidth: 1180, margin: "0 auto", padding: "28px 18px" }}>
      <div>
        <div style={{ fontSize: 34, fontWeight: 950, color: "var(--sf-brand)" }}>Results</div>
        <div style={{ marginTop: 6, color: "#444" }}>
          Last night first, then only the trends that look relevant to your sleep pattern.
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 18 }}>Loading results…</div>
      ) : err ? (
        <div style={{ marginTop: 18, color: "#b00020" }}>{err}</div>
      ) : !userId ? (
        <div style={{ marginTop: 18 }}>Please sign in.</div>
      ) : !latestNight ? (
        <section className="sf-card" style={{ marginTop: 22, padding: 22 }}>
          <h2 style={{ margin: 0, fontSize: 24, color: "#000080" }}>No results yet</h2>
          <p style={{ marginTop: 8, color: "#4b5563" }}>
            Save your first sleep night before using Results. SleepFix needs at least one real night before it can interpret anything.
          </p>
          <Link href="/protected/sleep" style={{ display: "inline-block", marginTop: 12, fontWeight: 900 }}>
            Log sleep now →
          </Link>
        </section>
      ) : (
        <>
          <section
            style={{
              marginTop: 22,
              border: "1px solid #c9d2ff",
              background: "linear-gradient(135deg, #eef3ff 0%, #ffffff 70%)",
              borderRadius: 18,
              padding: 20,
              boxShadow: "0 10px 30px rgba(20, 30, 90, 0.06)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: 0.8, textTransform: "uppercase", color: "#2636b8" }}>
              Last night result
            </div>
            <p style={{ margin: 0, color: "#374151" }}>
              Night date: <strong>{fmtDate(latestNight.local_date ?? latestNight.created_at)}</strong>
            </p>

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <MetricCard label="Quality" value={latestNight.quality_num === null ? "—" : `${latestNight.quality_num}/10`} note="Your felt recovery." />
              <MetricCard label="Latency" value={latestNight.latency_min === null ? "—" : `${latestNight.latency_min}m`} note="Sleep onset delay." />
              <MetricCard label="Wake-ups" value={latestNight.wakeups_count === null ? "—" : String(latestNight.wakeups_count)} note="Maintenance disruption." />
              <MetricCard label="Wake recovery" value={latestNight.wake_recovery_min === null ? "—" : `${latestNight.wake_recovery_min}m`} note="Time awake after waking." />
            </div>
          </section>

          <section style={{ marginTop: 18 }}>
            {insightErr ? (
              <div style={{ color: "#b00020" }}>{insightErr}</div>
            ) : insight ? (
              <RRSMInsightCard insight={insight} />
            ) : null}
          </section>

          <section className="sf-card" style={{ marginTop: 18, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: 0.8, textTransform: "uppercase", color: "#6b7280" }}>
              Relevant 7-day trends
            </div>
            <h2 style={{ marginTop: 6, marginBottom: 6, color: "#000080" }}>Trends matched to your current issue</h2>
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              SleepFix does not show every metric here. It shows the ones most likely to explain your current sleep problem.
            </p>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
              {focus.includes("thermal") ? (
                <MetricCard label="Thermal / environment" value="Active signal" note="Room, bed, heat/cold, bedding, or airflow may be relevant." />
              ) : null}

              {focus.includes("body") ? (
                <MetricCard label="Body recovery" value="Active signal" note="DOMS, soreness, pressure, pain, or body activation may be relevant." />
              ) : null}

              {focus.includes("wake-maintenance") ? (
                <MetricCard
                  label="Wake maintenance"
                  value={avgWakeups === null ? "—" : `${round1(avgWakeups)} avg`}
                  note={`7-day wake-up trend: `}
                />
              ) : null}

              {focus.includes("sleep-onset") ? (
                <MetricCard label="Sleep onset" value={avgLatency === null ? "—" : `${round1(avgLatency)}m avg`} note="Relevant because latency looks elevated." />
              ) : null}

              {focus.includes("recovery") || focus.includes("baseline") ? (
                <MetricCard label="Recovery" value={avgQuality === null ? "—" : `${round1(avgQuality)}/10 avg`} note="Relevant because felt quality drives interpretation." />
              ) : null}

              <MetricCard label="Sleep efficiency" value={avgSleepEfficiency === null ? "—" : `${round1(avgSleepEfficiency)}%`} note="Useful only as a rough interpretation, not a final truth." />
              <MetricCard label="Wake recovery" value={avgWakeRecovery === null ? "—" : `${round1(avgWakeRecovery)}m avg`} note="This separates brief wakes from destructive wake periods." />
            </div>
          </section>

          <section style={{ marginTop: 18 }}>
            <div style={{ fontSize: 20, fontWeight: 950, marginBottom: 8 }}>Recent nights used for this result</div>
            <div className="sf-card" style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f7f7f7" }}>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#666" }}>Date</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#666" }}>Quality</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#666" }}>Latency</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#666" }}>Wake-ups</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#666" }}>Wake recovery</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#666" }}>Est. sleep</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.night_id} style={{ borderTop: "1px solid #eee" }}>
                      <td style={{ padding: "10px 12px" }}>{fmtDate(r.local_date ?? r.created_at)}</td>
                      <td style={{ padding: "10px 12px" }}>{r.quality_num ?? "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{r.latency_min === null ? "—" : `${r.latency_min}m`}</td>
                      <td style={{ padding: "10px 12px" }}>{r.wakeups_count ?? "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{r.wake_recovery_min === null ? "—" : `${r.wake_recovery_min}m`}</td>
                      <td style={{ padding: "10px 12px" }}>{formatHours(r.estimated_sleep_min)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
