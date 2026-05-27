"use client";

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

type EngineFeedbackRow = {
  id: string;
  user_id: string;
  sleep_night_id: string | null;
  local_date: string | null;
  engine_category: string | null;
  engine_protocol: string | null;
  user_agreed: boolean | null;
  missing_reason: string | null;
  created_at: string;
};

type DateWindow = {
  today: string;
  weekStart: string;
  monthStart: string;
};

type ProblemGroup =
  | "Thermal / environment"
  | "Wake maintenance"
  | "Body recovery / DOMS"
  | "Mind / emotional activation"
  | "Sleep onset"
  | "Sleep hygiene / habits"
  | "Timing / circadian"
  | "Unclear / needs review";

type ProblemGroupSummary = {
  group: ProblemGroup;
  count: number;
  users: number;
  records: SleepNightAdminRow[];
  missingFeedback: EngineFeedbackRow[];
};

function ymdFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildDateWindow(): DateWindow {
  const now = new Date(Date.now());
  const today = ymdFromDate(now);

  const week = new Date(now.getTime());
  week.setDate(week.getDate() - 6);

  const month = new Date(now.getTime());
  month.setDate(1);

  return {
    today,
    weekStart: ymdFromDate(week),
    monthStart: ymdFromDate(month),
  };
}

function dateKey(row: SleepNightAdminRow) {
  return row.local_date ?? String(row.created_at ?? "").slice(0, 10);
}

function textFromArray(value?: string[] | null) {
  return Array.isArray(value) ? value.join(" ").toLowerCase() : "";
}

function allText(row: SleepNightAdminRow) {
  return [
    row.primary_trigger ?? "",
    textFromArray(row.mind_tags),
    textFromArray(row.environment_tags),
    textFromArray(row.bed_tags),
    textFromArray(row.body_tags),
    row.protocol_used_name ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function lowerIncludes(value: string, needles: string[]) {
  return needles.some((n) => value.includes(n));
}

function parseChoiceToNumber(choice: string | number | null | undefined): number | null {
  if (choice === null || choice === undefined) return null;
  if (typeof choice === "number" && Number.isFinite(choice)) return choice;
  const n = parseInt(String(choice).replace(/[^0-9]/g, ""), 10);
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
  return parseChoiceToNumber(cleaned);
}

function classifyProblemGroup(row: SleepNightAdminRow): ProblemGroup {
  const text = allText(row);
  const latency = parseChoiceToNumber(row.sleep_latency_choice);
  const wakeups = parseChoiceToNumber(row.wake_ups_choice) ?? 0;
  const wakeRecovery = parseWakeRecovery(row.wake_recovery_choice);

  const thermal = lowerIncludes(text, [
    "hot",
    "cold",
    "humid",
    "dry",
    "stuffy",
    "poor airflow",
    "mattress",
    "blanket",
    "bedding",
    "bed felt",
    "partner body heat",
    "sleepwear",
    "pillow",
    "room too",
    "temperature",
  ]);

  const body = lowerIncludes(text, [
    "pain",
    "sore",
    "soreness",
    "doms",
    "discomfort",
    "pressure",
    "tense",
    "restless",
    "inflammation",
    "inflamed",
    "body",
    "heavy fatigue",
  ]);

  const mind = lowerIncludes(text, [
    "racing",
    "thought",
    "mental",
    "wired",
    "alert",
    "overstimulated",
    "anxious",
    "worry",
    "worried",
    "stress",
    "stressed",
    "upset",
    "emotional",
    "low",
    "flat",
    "euphoric",
  ]);

  const hygiene = lowerIncludes(text, ["screen", "phone", "caffeine", "alcohol", "food", "late meal", "nicotine", "late exercise"]);
  const timing = lowerIncludes(text, ["circadian", "schedule", "shift", "travel", "irregular", "jet lag", "early starts", "late finishes"]);

  if (thermal) return "Thermal / environment";
  if (body) return "Body recovery / DOMS";
  if (mind) return "Mind / emotional activation";
  if ((wakeups >= 3 || (wakeRecovery !== null && wakeRecovery >= 30)) && !thermal && !body && !mind) return "Wake maintenance";
  if (latency !== null && latency >= 30) return "Sleep onset";
  if (hygiene) return "Sleep hygiene / habits";
  if (timing) return "Timing / circadian";
  return "Unclear / needs review";
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

function feedbackGroup(row: EngineFeedbackRow): ProblemGroup {
  const text = `${row.engine_category ?? ""} ${row.engine_protocol ?? ""} ${row.missing_reason ?? ""}`.toLowerCase();
  if (lowerIncludes(text, ["thermal", "environment", "room", "bed", "cold", "hot", "blanket", "pillow", "bedding"])) return "Thermal / environment";
  if (lowerIncludes(text, ["body", "doms", "pain", "sore", "pressure", "discomfort"])) return "Body recovery / DOMS";
  if (lowerIncludes(text, ["mind", "emotional", "stress", "anxious", "worry", "wired", "racing"])) return "Mind / emotional activation";
  if (lowerIncludes(text, ["wake", "fragment", "maintenance"])) return "Wake maintenance";
  if (lowerIncludes(text, ["latency", "onset", "fall asleep"])) return "Sleep onset";
  if (lowerIncludes(text, ["hygiene", "caffeine", "screen", "alcohol", "food"])) return "Sleep hygiene / habits";
  if (lowerIncludes(text, ["circadian", "shift", "timing", "travel", "schedule"])) return "Timing / circadian";
  return "Unclear / needs review";
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

function ProblemGroupCard({ item }: { item: ProblemGroupSummary }) {
  const topProtocols = countBy(item.records.map((r) => r.protocol_used_name || "No protocol logged")).slice(0, 3);
  const followCounts = countBy(item.records.map((r) => r.protocol_followed || "No response")).slice(0, 3);

  return (
    <div className="sf-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 950, color: "var(--sf-brand)" }}>{item.group}</div>
          <div style={{ marginTop: 4, color: "#555" }}>{item.users} users · {item.count} sleep records</div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 950 }}>{item.count}</div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#555", textTransform: "uppercase" }}>Recent records</div>
        {item.records.slice(0, 4).map((r) => (
          <div key={r.id} style={{ borderTop: "1px solid #eee", paddingTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#666" }}>
              {dateKey(r)} · User {r.user_id.slice(0, 8)}
            </div>
            <div style={{ marginTop: 3, color: "#111" }}>
              Q {r.sleep_quality ?? "—"} · latency {r.sleep_latency_choice ?? "—"} · wakes {r.wake_ups_choice ?? "—"} · recovery {r.wake_recovery_choice ?? "—"}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#555", textTransform: "uppercase" }}>Protocols</div>
          {topProtocols.length ? topProtocols.map(([p, n]) => <div key={p} style={{ marginTop: 4 }}>{p}: <strong>{n}</strong></div>) : <div style={{ color: "#666" }}>No data.</div>}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#555", textTransform: "uppercase" }}>Followed?</div>
          {followCounts.length ? followCounts.map(([p, n]) => <div key={p} style={{ marginTop: 4 }}>{p}: <strong>{n}</strong></div>) : <div style={{ color: "#666" }}>No data.</div>}
        </div>
      </div>

      {item.missingFeedback.length ? (
        <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#b45309", textTransform: "uppercase" }}>Mismatch notes</div>
          {item.missingFeedback.slice(0, 3).map((f) => (
            <div key={f.id} style={{ marginTop: 6, color: "#111" }}>
              <strong>{f.local_date ?? String(f.created_at).slice(0, 10)}:</strong> {f.missing_reason}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SleepNightAdminRow[]>([]);
  const [feedbackRows, setFeedbackRows] = useState<EngineFeedbackRow[]>([]);
  const [dateWindow, setDateWindow] = useState<DateWindow | null>(null);

  useEffect(() => {
    setDateWindow(buildDateWindow());
  }, []);

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

      const { data: feedbackData, error: feedbackErr } = await supabase
        .from("sleep_engine_feedback")
        .select([
          "id",
          "user_id",
          "sleep_night_id",
          "local_date",
          "engine_category",
          "engine_protocol",
          "user_agreed",
          "missing_reason",
          "created_at",
        ].join(","))
        .order("created_at", { ascending: false })
        .limit(5000);

      if (!cancelled) {
        if (rowsErr) {
          setError(rowsErr.message);
          setRows([]);
        } else if (feedbackErr) {
          setError(feedbackErr.message);
          setRows((data ?? []) as unknown as SleepNightAdminRow[]);
          setFeedbackRows([]);
        } else {
          setRows((data ?? []) as unknown as SleepNightAdminRow[]);
          setFeedbackRows((feedbackData ?? []) as unknown as EngineFeedbackRow[]);
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
    const today = dateWindow?.today ?? "";
    const weekStart = dateWindow?.weekStart ?? "";
    const monthStart = dateWindow?.monthStart ?? "";

    const totalNights = rows.length;
    const usersTotal = new Set(rows.map((r) => r.user_id)).size;

    const todayRows = today ? rows.filter((r) => dateKey(r) === today) : [];
    const weekRows = weekStart && today ? rows.filter((r) => dateKey(r) >= weekStart && dateKey(r) <= today) : [];
    const monthRows = monthStart && today ? rows.filter((r) => dateKey(r) >= monthStart && dateKey(r) <= today) : [];

    const weeklyActiveUsers = new Set(weekRows.map((r) => r.user_id)).size;
    const monthlyActiveUsers = new Set(monthRows.map((r) => r.user_id)).size;

    const protocolAnswered = rows.filter((r) => r.protocol_followed);
    const protocolUsed = rows.filter((r) => r.protocol_followed === "yes" || r.protocol_followed === "partial");

    const totalFeedback = feedbackRows.length;
    const agreedFeedback = feedbackRows.filter((f) => f.user_agreed === true).length;
    const missingFeedback = feedbackRows.filter((f) => f.user_agreed === false).length;

    const latestMissingReasons = feedbackRows
      .filter((f) => f.user_agreed === false && f.missing_reason && f.missing_reason.trim())
      .slice(0, 8);

    const problemGroups: ProblemGroup[] = [
      "Thermal / environment",
      "Wake maintenance",
      "Body recovery / DOMS",
      "Mind / emotional activation",
      "Sleep onset",
      "Sleep hygiene / habits",
      "Timing / circadian",
      "Unclear / needs review",
    ];

    const groupedProblems: ProblemGroupSummary[] = problemGroups.map((group) => {
      const groupRecords = rows.filter((r) => classifyProblemGroup(r) === group);
      const groupFeedback = feedbackRows.filter((f) => f.user_agreed === false && feedbackGroup(f) === group);
      return {
        group,
        count: groupRecords.length,
        users: new Set(groupRecords.map((r) => r.user_id)).size,
        records: groupRecords.slice(0, 8),
        missingFeedback: groupFeedback.slice(0, 6),
      };
    }).filter((item) => item.count > 0 || item.missingFeedback.length > 0);

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
      problemCounts: countBy(rows.map(classifyProblemGroup)),
      thermalCounts: countBy(rows.map(classifyThermal)),
      adaptationCounts: countBy(rows.map(classifyAdaptation)),
      protocolCounts: countBy(rows.map((r) => r.protocol_used_name || "No protocol logged")),
      protocolFollowedCounts: countBy(rows.map((r) => r.protocol_followed || "No response")),
      totalFeedback,
      agreedFeedback,
      missingFeedback,
      feedbackAgreementPct: pct(agreedFeedback, totalFeedback),
      feedbackMissingPct: pct(missingFeedback, totalFeedback),
      missedCategoryCounts: countBy(feedbackRows.filter((f) => f.user_agreed === false).map((f) => f.engine_category || "Unknown")),
      missedProtocolCounts: countBy(feedbackRows.filter((f) => f.user_agreed === false).map((f) => f.engine_protocol || "Unknown")),
      latestMissingReasons,
      groupedProblems,
    };
  }, [rows, feedbackRows, dateWindow]);

  if (loading || !dateWindow) return <div style={{ padding: 28 }}>Loading admin stats...</div>;

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
      <h1 style={{ fontSize: 34, fontWeight: 900, color: "var(--sf-brand)" }}>Admin Calibration</h1>
      <p style={{ marginTop: 6, color: "#555" }}>
        Problem-grouped calibration console for checking whether SleepFix is finding the right sleep issue, protocol, and missing factors.
      </p>

      {error ? <div style={{ marginTop: 18, color: "#b00020", fontWeight: 700 }}>{error}</div> : null}

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>Core usage</h2>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <StatCard label="Users with entries" value={stats.usersTotal} note="Distinct users who recorded sleep" />
          <StatCard label="Total nights" value={stats.totalNights} note="All accessible saved nights" />
          <StatCard label="Today" value={stats.todayNights} note={stats.today} />
          <StatCard label="This week" value={stats.weekNights} note={`${stats.weekStart} → ${stats.today}`} />
          <StatCard label="This month" value={stats.monthNights} note={`${stats.monthStart} → ${stats.today}`} />
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>Engagement</h2>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <StatCard label="Weekly active users" value={stats.weeklyActiveUsers} note={`${stats.weeklyUsagePct} of users with entries`} />
          <StatCard label="Monthly active users" value={stats.monthlyActiveUsers} note={`${stats.monthlyUsagePct} of users with entries`} />
          <StatCard label="Protocol usage" value={stats.protocolUsagePct} note="Yes/partial among protocol responses" />
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>Problem groups</h2>
        <p style={{ marginTop: 4, color: "#555" }}>
          This is the main admin view. It groups nights by the sleep problem SleepFix should be learning from.
        </p>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <TopList title="Problem group counts" rows={stats.problemCounts} />
          <TopList title="Thermal system patterns" rows={stats.thermalCounts} />
          <TopList title="Active management patterns" rows={stats.adaptationCounts} />
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>Grouped review</h2>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 12 }}>
          {stats.groupedProblems.length ? stats.groupedProblems.map((item) => (
            <ProblemGroupCard key={item.group} item={item} />
          )) : <div className="sf-card" style={{ padding: 16, color: "#666" }}>No grouped records yet.</div>}
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>Protocol calibration</h2>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <TopList title="Protocol recommendations logged" rows={stats.protocolCounts} />
          <TopList title="Protocol followed responses" rows={stats.protocolFollowedCounts} />
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900 }}>Accuracy feedback</h2>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <StatCard label="Total feedback" value={stats.totalFeedback} note="All saved engine confirmations/corrections" />
          <StatCard label="Agreed" value={stats.agreedFeedback} note={`${stats.feedbackAgreementPct} of feedback`} />
          <StatCard label="Missing / wrong" value={stats.missingFeedback} note={`${stats.feedbackMissingPct} of feedback`} />
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <TopList title="Missed categories" rows={stats.missedCategoryCounts} />
          <TopList title="Missed protocols" rows={stats.missedProtocolCounts} />
        </div>

        <div className="sf-card" style={{ marginTop: 12, padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>Latest missing-factor notes</div>

          {stats.latestMissingReasons.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {stats.latestMissingReasons.map((item) => (
                <div key={item.id} style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
                  <div style={{ fontSize: 13, color: "#666", fontWeight: 800 }}>
                    {item.local_date ?? String(item.created_at).slice(0, 10)} · {item.engine_category ?? "Unknown"} · {item.engine_protocol ?? "No protocol"}
                  </div>
                  <div style={{ marginTop: 4, color: "#111" }}>{item.missing_reason}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#666" }}>No missing-factor notes yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
