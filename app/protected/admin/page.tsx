"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ADMIN_EMAIL = "jlnalexander5@gmail.com";

type SleepNightAdminRow = {
  id: string;
  user_id: string;
  created_at: string;
  local_date: string | null;
  sleep_quality: number | string | null;
  sleep_latency_choice: string | null;
  wake_ups_choice: string | null;
  wake_recovery_choice: string | null;
  primary_trigger: string | null;
  mind_tags: string[] | null;
  environment_tags: string[] | null;
  bed_tags: string[] | null;
  body_tags: string[] | null;
  protocol_used_name: string | null;
  protocol_followed: string | null;
};

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysYMD(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthStartYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function dateKey(row: SleepNightAdminRow) {
  return row.local_date ?? String(row.created_at ?? "").slice(0, 10);
}

function textFromArray(value?: string[] | null) {
  return Array.isArray(value) ? value.join(" ").toLowerCase() : "";
}

function lowerIncludes(value: string, needles: string[]) {
  return needles.some((n) => value.includes(n));
}

function classifyWakeCause(row: SleepNightAdminRow) {
  const text = [
    row.primary_trigger ?? "",
    textFromArray(row.mind_tags),
    textFromArray(row.environment_tags),
    textFromArray(row.bed_tags),
    textFromArray(row.body_tags),
  ].join(" ").toLowerCase();

  if (lowerIncludes(text, ["mattress", "blanket", "bedding", "bed felt", "partner body heat", "sleepwear", "pillow", "hot", "cold"])) return "Thermal / bed";
  if (lowerIncludes(text, ["noise", "noisy", "bright", "light", "humid", "dry", "room"])) return "Room environment";
  if (lowerIncludes(text, ["pain", "sore", "discomfort", "tense", "restless", "inflammation", "body"])) return "Body / physiology";
  if (lowerIncludes(text, ["racing", "thought", "mental", "wired", "alert", "overstimulated"])) return "Mental reactivation";
  if (lowerIncludes(text, ["anxious", "worry", "worried", "stress", "upset", "emotional", "low", "flat"])) return "Emotional activation";
  if (lowerIncludes(text, ["hygiene", "screen", "phone", "caffeine", "alcohol", "food", "late meal"])) return "Sleep hygiene";
  if (lowerIncludes(text, ["circadian", "schedule", "shift", "travel", "irregular"])) return "Timing / circadian";
  return "Unknown";
}

function classifyThermal(row: SleepNightAdminRow) {
  const text = [textFromArray(row.environment_tags), textFromArray(row.bed_tags), row.primary_trigger ?? ""].join(" ").toLowerCase();
  const heat = lowerIncludes(text, ["hot", "too many blankets", "partner body heat", "sleepwear too warm", "pillow too warm", "bed felt hot"]);
  const cold = lowerIncludes(text, ["cold", "too few blankets", "sleepwear too light", "pillow too cold", "bed felt cold"]);
  if (heat && cold) return "Hot/cold oscillation";
  if (heat) return "Heat load";
  if (cold) return "Cold exposure";
  if (lowerIncludes(text, ["mattress", "blanket", "bedding", "pillow"])) return "Mixed / unclear";
  return "No thermal signal";
}

function classifyAdaptation(row: SleepNightAdminRow) {
  const text = textFromArray(row.bed_tags);
  if (lowerIncludes(text, ["new mattress", "new pillow", "still adjusting"])) return "New setup adaptation";
  if (lowerIncludes(text, ["removed covers", "added covers", "changed pillow", "got out of bed", "changed blankets"])) return "Active self-correction";
  if (lowerIncludes(text, ["overcorrected"])) return "Overcorrection";
  return "None";
}

function countBy(values: string[]) {
  const map = new Map<string, number>();
  values.forEach((v) => map.set(v, (map.get(v) ?? 0) + 1));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function pct(n: number, d: number) {
  if (!d) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

function StatCard({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="sf-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#555", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, color: "#111" }}>{value}</div>
      {note ? <div style={{ marginTop: 6, color: "#555", fontSize: 14 }}>{note}</div> : null}
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div className="sf-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>{title}</div>
      {rows.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.slice(0, 6).map(([label, count]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>{label}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: "#666" }}>No data yet.</div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SleepNightAdminRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminStats() {
      setLoading(true);
      setError(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const email = authData?.user?.email ?? "";

      if (authErr || email.toLowerCase() !== ADMIN_EMAIL) {
        if (!cancelled) {
          setAccessDenied(true);
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const { data, error: rowsErr } = await supabase
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
          "primary_trigger",
          "mind_tags",
          "environment_tags",
          "bed_tags",
          "body_tags",
          "protocol_used_name",
          "protocol_followed",
        ].join(","))
        .order("local_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(5000);

      if (!cancelled) {
        if (rowsErr) {
          setError(rowsErr.message);
          setRows([]);
        } else {
         setRows((data ?? []) as unknown as SleepNightAdminRow[]);
        }
        setLoading(false);
      }
    }

    loadAdminStats();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const stats = useMemo(() => {
    const today = todayYMD();
    const weekStart = addDaysYMD(today, -6);
    const monthStart = monthStartYMD();

    const totalNights = rows.length;
    const usersTotal = new Set(rows.map((r) => r.user_id)).size;

    const todayRows = rows.filter((r) => dateKey(r) === today);
    const weekRows = rows.filter((r) => dateKey(r) >= weekStart && dateKey(r) <= today);
    const monthRows = rows.filter((r) => dateKey(r) >= monthStart && dateKey(r) <= today);

    const weeklyActiveUsers = new Set(weekRows.map((r) => r.user_id)).size;
    const monthlyActiveUsers = new Set(monthRows.map((r) => r.user_id)).size;

    const protocolAnswered = rows.filter((r) => r.protocol_followed);
    const protocolUsed = rows.filter((r) => r.protocol_followed === "yes" || r.protocol_followed === "partial");

    return {
      today,
      weekStart,
      monthStart,
      totalNights,
      usersTotal,
      todayNights: todayRows.length,
      weekNights: weekRows.length,
      monthNights: monthRows.length,
      weeklyActiveUsers,
      monthlyActiveUsers,
      weeklyUsagePct: pct(weeklyActiveUsers, usersTotal),
      monthlyUsagePct: pct(monthlyActiveUsers, usersTotal),
      protocolUsagePct: pct(protocolUsed.length, protocolAnswered.length),
      todayUsers: new Set(todayRows.map((r) => r.user_id)).size,
      triggerCounts: countBy(rows.map((r) => r.primary_trigger || "Unknown")),
      wakeCauseCounts: countBy(rows.map(classifyWakeCause)),
      thermalCounts: countBy(rows.map(classifyThermal)),
      adaptationCounts: countBy(rows.map(classifyAdaptation)),
      protocolCounts: countBy(rows.map((r) => r.protocol_used_name || "No protocol logged")),
      protocolFollowedCounts: countBy(rows.map((r) => r.protocol_followed || "No response")),
    };
  }, [rows]);

  if (loading) return <div style={{ padding: 28 }}>Loading admin stats...</div>;

  if (accessDenied) {
    return (
      <div style={{ padding: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: "var(--sf-brand)" }}>Admin</h1>
        <p style={{ marginTop: 12 }}>Access denied.</p>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto", padding: "28px 18px" }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, color: "var(--sf-brand)" }}>Admin Intelligence</h1>
      <p style={{ marginTop: 6, color: "#555" }}>
        Platform-level sleep-pattern and protocol-use view. Current version uses sleep_nights records only.
      </p>

      {error ? <div style={{ marginTop: 18, color: "#b00020", fontWeight: 700 }}>{error}</div> : null}

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>Core stats</h2>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <StatCard label="Users with entries" value={stats.usersTotal} note="Distinct users who recorded sleep" />
          <StatCard label="Total nights" value={stats.totalNights} note="All accessible saved nights" />
          <StatCard label="Today" value={stats.todayNights} note={stats.today} />
          <StatCard label="This week" value={stats.weekNights} note={`${stats.weekStart} → ${stats.today}`} />
          <StatCard label="This month" value={stats.monthNights} note={`${stats.monthStart} → ${stats.today}`} />
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>App usage</h2>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <StatCard label="Weekly active users" value={stats.weeklyActiveUsers} note={`${stats.weeklyUsagePct} of users with entries`} />
          <StatCard label="Monthly active users" value={stats.monthlyActiveUsers} note={`${stats.monthlyUsagePct} of users with entries`} />
          <StatCard label="Protocol usage" value={stats.protocolUsagePct} note="Yes/partial among protocol responses" />
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>Daily / weekly / monthly view</h2>
        <div className="sf-card" style={{ marginTop: 12, padding: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f7f7f7" }}>
                <th style={{ textAlign: "left", padding: "10px 12px" }}>Period</th>
                <th style={{ textAlign: "left", padding: "10px 12px" }}>Nights</th>
                <th style={{ textAlign: "left", padding: "10px 12px" }}>Active users</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "10px 12px" }}>Today</td>
                <td style={{ padding: "10px 12px" }}>{stats.todayNights}</td>
                <td style={{ padding: "10px 12px" }}>{stats.todayUsers}</td>
              </tr>
              <tr style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "10px 12px" }}>Last 7 days</td>
                <td style={{ padding: "10px 12px" }}>{stats.weekNights}</td>
                <td style={{ padding: "10px 12px" }}>{stats.weeklyActiveUsers}</td>
              </tr>
              <tr style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "10px 12px" }}>This month</td>
                <td style={{ padding: "10px 12px" }}>{stats.monthNights}</td>
                <td style={{ padding: "10px 12px" }}>{stats.monthlyActiveUsers}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>Sleep intelligence</h2>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <TopList title="Main sleep disruption" rows={stats.triggerCounts} />
          <TopList title="Likely wake-up causes" rows={stats.wakeCauseCounts} />
          <TopList title="Thermal system patterns" rows={stats.thermalCounts} />
          <TopList title="Active management patterns" rows={stats.adaptationCounts} />
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>Protocols</h2>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <TopList title="Protocol recommendations logged" rows={stats.protocolCounts} />
          <TopList title="Protocol followed responses" rows={stats.protocolFollowedCounts} />
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>Accuracy feedback</h2>
        <div className="sf-card" style={{ marginTop: 12, padding: 16 }}>
          <strong>Not connected yet.</strong>
          <div style={{ marginTop: 6, color: "#555" }}>
            The Protocols page asks whether the summary is accurate, but it does not save the answer yet.
            Next admin patch should create a feedback table and persist yes/no/missing details.
          </div>
        </div>
      </section>
    </div>
  );
}
