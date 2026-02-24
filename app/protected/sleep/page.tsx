"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import DatePicker from "@/components/date-picker";
import TimePicker from "@/components/time-picker";
import { RRSMInsightCard } from "@/components/RRSMInsightCard";

type NightMetricsRow = {
  id: string;
  user_id: string;
  created_at: string;
  sleep_start: string;
  sleep_end: string;
  primary_driver: string | null;
  secondary_driver: string | null;
  notes: string | null;
};

type RRSMInsight = {
  domain: string;
  title: string;
  why: string[];
  actions: string[];
  confidence: "low" | "med" | "high";
};

function toIsoStringLocal(d: Date) {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 19);
}

function toIsoWithOffset(d: Date) {
  return d.toISOString();
}

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [userId, setUserId] = useState<string | null>(null);

  // night form
  const [sleepStart, setSleepStart] = useState<string>("");
  const [sleepEnd, setSleepEnd] = useState<string>("");
  const [sleepStartDate, setSleepStartDate] = useState<string>("");
  const [sleepStartTime, setSleepStartTime] = useState<string>("");
  const [sleepEndDate, setSleepEndDate] = useState<string>("");
  const [sleepEndTime, setSleepEndTime] = useState<string>("");

  // latest / metrics
  const [latestNightId, setLatestNightId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<NightMetricsRow[]>([]);

  // RRSM insight
  const [rrsmInsight, setRrsmInsight] = useState<RRSMInsight | null>(null);
  const [rrsmInsightLoading, setRrsmInsightLoading] = useState(true);
  const [rrsmInsightError, setRrsmInsightError] = useState<string | null>(null);

  // driver confirmation
  const [primaryDriver, setPrimaryDriver] = useState<string>("Nothing / no clear driver");
  const [secondaryDriver, setSecondaryDriver] = useState<string>("Nothing / no clear driver");
  const [userNotes, setUserNotes] = useState<string>("");

  // optional status message
  const [msg, setMsg] = useState<string>("");

  const [mounted, setMounted] = useState(false);

  async function loadUserAndMetrics(): Promise<string | null> {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      setMsg(authErr.message);
      setUserId(null);
      return null;
    }
    const uid = auth?.user?.id ?? null;
    setUserId(uid);

    if (!uid) {
      setMetrics([]);
      setLatestNightId(null);
      return null;
    }

    const { data, error } = await supabase
      .from("v_sleep_night_metrics")
      .select("*")
      .order("sleep_start", { ascending: false })
      .limit(20);

    if (error) {
      setMsg(error.message);
      return uid;
    }

    const rows = (data ?? []) as NightMetricsRow[];
    setMetrics(rows);
    setLatestNightId(rows[0]?.id ?? null);

    // prefill form with latest row if present
    if (rows[0]) {
      setPrimaryDriver(rows[0].primary_driver ?? "Nothing / no clear driver");
      setSecondaryDriver(rows[0].secondary_driver ?? "Nothing / no clear driver");
      setUserNotes(rows[0].notes ?? "");
    }

    return uid;
  }

  async function fetchRrsmInsight(uidArg?: string | null) {
    const uid = uidArg ?? userId;

    setRrsmInsightLoading(true);
    setRrsmInsightError(null);

    if (!uid) {
      setRrsmInsight(null);
      setRrsmInsightLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/rrsm/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, days: 7 }),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || `RRSM analyze failed (${res.status})`);
      }

      const data = JSON.parse(text) as { insights?: RRSMInsight[] };
      const firstInsight = data?.insights?.[0] ?? null;
      setRrsmInsight(firstInsight);
    } catch (e: any) {
      setRrsmInsight(null);
      setRrsmInsightError(e?.message ?? "RRSM analyze failed.");
    } finally {
      setRrsmInsightLoading(false);
    }
  }

  // avoid prerender issues (DatePicker uses Date in props)
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // set default datetime-local values on the client
    const start = new Date();
    start.setHours(22, 30, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(7, 30, 0, 0);

    setSleepStart(start.toISOString().slice(0, 16));
    setSleepStartDate(start.toISOString().slice(0, 10));
    setSleepStartTime(start.toISOString().slice(11, 16));
    setSleepEnd(end.toISOString().slice(0, 16));
    setSleepEndDate(end.toISOString().slice(0, 10));
    setSleepEndTime(end.toISOString().slice(11, 16));
  }, []);

  // initial load
  useEffect(() => {
    (async () => {
      const uid = await loadUserAndMetrics();
      await fetchRrsmInsight(uid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveNight() {
    setMsg("");
    if (!userId) {
      setMsg("Not signed in");
      return;
    }

    const start = new Date(`${sleepStartDate}T${sleepStartTime}:00`);
    const end = new Date(`${sleepEndDate}T${sleepEndTime}:00`);

    const sleep_start = toIsoStringLocal(start);
    const sleep_end = toIsoStringLocal(end);

    const { data, error } = await supabase
      .from("v_sleep_night_metrics")
      .insert([
        {
          user_id: userId,
          sleep_start,
          sleep_end,
          primary_driver: primaryDriver,
          secondary_driver: secondaryDriver,
          notes: userNotes,
        },
      ])
      .select();

    if (error) {
      setMsg(error.message);
      return;
    }

    const newId = (data?.[0] as any)?.id as string | undefined;
    setLatestNightId(newId ?? null);

    setMsg("Saved ✅");

    const uid = await loadUserAndMetrics();
    await fetchRrsmInsight(uid);
  }

  async function saveAll() {
    await saveNight();
  }

  if (!mounted) return null;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 18 }}>Sleep</h1>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Sleep Start</div>
          <div style={{ display: "flex", gap: 10 }}>
            <DatePicker value={sleepStartDate} onChange={setSleepStartDate} />
            <TimePicker value={sleepStartTime} onChange={setSleepStartTime} />
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Sleep End</div>
          <div style={{ display: "flex", gap: 10 }}>
            <DatePicker value={sleepEndDate} onChange={setSleepEndDate} />
            <TimePicker value={sleepEndTime} onChange={setSleepEndTime} />
          </div>
        </div>
      </div>

      <hr style={{ margin: "28px 0" }} />

      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
        What do YOU think affected tonight?
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Primary driver</div>
        <select
          value={primaryDriver}
          onChange={(e) => setPrimaryDriver(e.target.value)}
          style={{ width: "100%", padding: 10, borderRadius: 8 }}
        >
          <option>Nothing / no clear driver</option>
          <option>Caffeine / stimulants</option>
          <option>Late meal</option>
          <option>Alcohol</option>
          <option>Stress / rumination</option>
          <option>Noise / light</option>
          <option>Too hot / too cold</option>
          <option>Late screen time</option>
          <option>Exercise timing</option>
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Secondary driver</div>
        <select
          value={secondaryDriver}
          onChange={(e) => setSecondaryDriver(e.target.value)}
          style={{ width: "100%", padding: 10, borderRadius: 8 }}
        >
          <option>Nothing / no clear driver</option>
          <option>Caffeine / stimulants</option>
          <option>Late meal</option>
          <option>Alcohol</option>
          <option>Stress / rumination</option>
          <option>Noise / light</option>
          <option>Too hot / too cold</option>
          <option>Late screen time</option>
          <option>Exercise timing</option>
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Notes (optional)</div>
        <textarea
          value={userNotes}
          onChange={(e) => setUserNotes(e.target.value)}
          placeholder="e.g., neighbor noise until midnight, but slept well after"
          rows={4}
          style={{ width: "100%", padding: 10, borderRadius: 8 }}
        />
      </div>

      <button
        onClick={saveAll}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Save
      </button>

      {msg && <div style={{ marginTop: 12, fontWeight: 700 }}>{msg}</div>}

      <hr style={{ margin: "28px 0" }} />

      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>RRSM (last 7 days)</div>

      <div style={{ marginTop: 12 }}>
        {rrsmInsightLoading ? (
          <div style={{ opacity: 0.85 }}>Analyzing last 7 days…</div>
        ) : rrsmInsightError ? (
          <div style={{ color: "tomato", fontWeight: 700 }}>{rrsmInsightError}</div>
        ) : rrsmInsight ? (
          <RRSMInsightCard insight={rrsmInsight} />
        ) : (
          <div style={{ opacity: 0.85 }}>No RRSM insight yet.</div>
        )}
      </div>

      {/* Optional: keep a hidden debug section instead of showing raw metrics to users */}
      <details style={{ marginTop: 14, opacity: 0.9 }}>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Debug (show raw sleep metrics)</summary>

        <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 13 }}>
          {metrics.length === 0 ? (
            <div>No rows yet.</div>
          ) : (
            metrics.slice(0, 5).map((m) => (
              <div key={m.id} style={{ marginBottom: 10 }}>
                <div>
                  <b>{m.id}</b>
                </div>
                <div>start: {m.sleep_start}</div>
                <div>end: {m.sleep_end}</div>
                <div>primary: {m.primary_driver ?? "-"}</div>
                <div>secondary: {m.secondary_driver ?? "-"}</div>
                <div>notes: {m.notes ?? "-"}</div>
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}
