"use client";

/* eslint-disable react/no-unescaped-entities */

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import RRSMInsightCard, { RRSMInsight } from "@/components/RRSMInsightCard";

const DatePicker = dynamic(
  () => import("react-datepicker").then((m) => m.default as any),
  { ssr: false }
) as any;

type NightMetricsRow = {
  id: string;
  user_id: string;
  created_at: string;
  night_id: string;
  metric_key: string;
  metric_value: number | string | null;
};

function toIsoLocalDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toLocalTimeHHMM(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseLocalDateTime(dateStr: string, timeStr: string) {
  // dateStr: "YYYY-MM-DD", timeStr: "HH:MM"
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [userId, setUserId] = useState<string | null>(null);

  // Night form inputs
  const [sleepStartDate, setSleepStartDate] = useState<string>("");
  const [sleepStartTime, setSleepStartTime] = useState<string>("");
  const [sleepEndDate, setSleepEndDate] = useState<string>("");
  const [sleepEndTime, setSleepEndTime] = useState<string>("");

  const [mounted, setMounted] = useState(false);

  // Latest / metrics
  const [latestNightId, setLatestNightId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<NightMetricsRow[]>([]);

  // RRSM insight
  const [rrsmInsight, setRrsmInsight] = useState<RRSMInsight | null>(null);
  const [rrsmInsightLoading, setRrsmInsightLoading] = useState(true);
  const [rrsmInsightError, setRrsmInsightError] = useState<string | null>(null);

  // Driver confirmation (simple fields for now)
  const [primaryDriver, setPrimaryDriver] = useState<string>("Nothing / no clear driver");
  const [secondaryDriver, setSecondaryDriver] = useState<string>("Nothing / no clear driver");
  const [userNotes, setUserNotes] = useState<string>("");

  // Avoid prerender issues (DatePicker uses Date in props)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Default datetime-local values on client
  useEffect(() => {
    const start = new Date();
    start.setHours(23, 30, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(20, 30, 0, 0);

    setSleepStartDate(toIsoLocalDate(start));
    setSleepStartTime(toLocalTimeHHMM(start));
    setSleepEndDate(toIsoLocalDate(end));
    setSleepEndTime(toLocalTimeHHMM(end));
  }, []);

  // Get user
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id ?? null);
    })();
  }, [supabase]);

  // Load latest night + metrics
  useEffect(() => {
    if (!userId) return;

    (async () => {
      // Latest night id
      const { data: nightRows, error: nightErr } = await supabase
        .from("sleep_nights")
        .select("id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (nightErr) {
        setLatestNightId(null);
        setMetrics([]);
        return;
      }

      const nightId = nightRows?.[0]?.id ?? null;
      setLatestNightId(nightId);

      if (!nightId) {
        setMetrics([]);
        return;
      }

      const { data: metricRows, error: metricsErr } = await supabase
        .from("v_sleep_night_metrics")
        .select("*")
        .eq("night_id", nightId)
        .order("created_at", { ascending: false });

      if (metricsErr) {
        setMetrics([]);
        return;
      }

      setMetrics((metricRows ?? []) as NightMetricsRow[]);
    })();
  }, [supabase, userId]);

  // Fetch RRSM insight from API (POST only)
  useEffect(() => {
    if (!userId) return;

    (async () => {
      setRrsmInsightLoading(true);
      setRrsmInsightError(null);

      try {
   const res = await fetch("/api/rrsm/analyze", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    days: 7,
    includeDrivers: true,
  }),
});

if (!res.ok) {
  const t = await res.text();
  throw new Error(`RRSM analyze failed (${res.status}). ${t}`);
}

const data = (await res.json()) as { insights?: RRSMInsight[] };
setRrsmInsight(data?.insights?.[0] ?? null);
      } catch (e: any) {
        setRrsmInsight(null);
        setRrsmInsightError(e?.message ?? "RRSM analyze failed.");
      } finally {
        setRrsmInsightLoading(false);
      }
    })();
  }, [userId]);

  async function saveNight() {
    if (!userId) return;

    const start = parseLocalDateTime(sleepStartDate, sleepStartTime);
    const end = parseLocalDateTime(sleepEndDate, sleepEndTime);

    const { data: inserted, error } = await supabase
      .from("sleep_nights")
      .insert({
        user_id: userId,
        sleep_start: start.toISOString(),
        sleep_end: end.toISOString(),
        primary_driver: primaryDriver,
        secondary_driver: secondaryDriver,
        notes: userNotes,
      })
      .select("id")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    // reload latest night + metrics
    const newId = inserted?.id ?? null;
    setLatestNightId(newId);
    if (newId) {
      const { data: metricRows } = await supabase
        .from("v_sleep_night_metrics")
        .select("*")
        .eq("night_id", newId)
        .order("created_at", { ascending: false });

      setMetrics((metricRows ?? []) as NightMetricsRow[]);
    }
  }

  if (!mounted) return null;

  const startDateObj = sleepStartDate ? new Date(`${sleepStartDate}T00:00:00`) : new Date();
  const endDateObj = sleepEndDate ? new Date(`${sleepEndDate}T00:00:00`) : new Date();

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 18px" }}>
      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 18 }}>Sleep</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Sleep Start</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="sf-input-box">
              <DatePicker
                selected={startDateObj}
                onChange={(d: Date) => setSleepStartDate(toIsoLocalDate(d))}
                dateFormat="dd/MM/yyyy"
                className="sf-datetime-input"
              />
            </div>

            <div className="sf-input-box">
              <input type="time" value={sleepStartTime} onChange={(e) => setSleepStartTime(e.target.value)} className="sf-datetime-input" />
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Sleep End</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="sf-input-box">
              <DatePicker
                selected={endDateObj}
                onChange={(d: Date) => setSleepEndDate(toIsoLocalDate(d))}
                dateFormat="dd/MM/yyyy"
                className="sf-datetime-input"
              />
            </div>

            <div className="sf-input-box">
              <input type="time" value={sleepEndTime} onChange={(e) => setSleepEndTime(e.target.value)} className="sf-datetime-input" />
            </div>
          </div>
        </div>
      </div>

      <hr style={{ margin: "18px 0", opacity: 0.3 }} />

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
          What do YOU think affected tonight?
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Primary driver</div>
          <select
            value={primaryDriver}
            onChange={(e) => setPrimaryDriver(e.target.value)}
            style={{
              width: "100%",
              padding: "var(--sf-input-pad)",
              borderRadius: 10,
              background: "#2b2b2b",
              color: "white",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <option>Nothing / no clear driver</option>
            <option>Stress / worry</option>
            <option>Late caffeine</option>
            <option>Late meal</option>
            <option>Alcohol</option>
            <option>Too much screen time</option>
            <option>Exercise timing</option>
            <option>Temperature / environment</option>
            <option>Noise</option>
            <option>Light / bright room</option>
            <option>Irregular schedule</option>
            <option>Late work / mental stimulation</option>
            <option>Daytime nap too late</option>
            <option>Pain / discomfort</option>
            <option>Illness / congestion</option>
            <option>Medication / supplement</option>
            <option>Nicotine</option>
            <option>Travel / jet lag</option>
            <option>Partner disturbance</option>
            <option>Nightmares / vivid dreams</option>
            <option>Other (use Notes)</option>
          </select>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Secondary driver</div>
          <select
            value={secondaryDriver}
            onChange={(e) => setSecondaryDriver(e.target.value)}
            style={{
              width: "100%",
              padding: "var(--sf-input-pad)",
              borderRadius: 10,
              background: "#2b2b2b",
              color: "white",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <option>Nothing / no clear driver</option>
            <option>Stress / worry</option>
            <option>Late caffeine</option>
            <option>Late meal</option>
            <option>Alcohol</option>
            <option>Too much screen time</option>
            <option>Exercise timing</option>
            <option>Temperature / environment</option>
            <option>Noise</option>
            <option>Light / bright room</option>
            <option>Irregular schedule</option>
            <option>Late work / mental stimulation</option>
            <option>Daytime nap too late</option>
            <option>Pain / discomfort</option>
            <option>Illness / congestion</option>
            <option>Medication / supplement</option>
            <option>Nicotine</option>
            <option>Travel / jet lag</option>
            <option>Partner disturbance</option>
            <option>Nightmares / vivid dreams</option>
            <option>Other (use Notes)</option>
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Notes (optional)</div>
          <textarea
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            placeholder="e.g., neighbor noise until midnight, but slept well after"
            style={{
              width: "100%",
              minHeight: 90,
              padding: "var(--sf-input-pad)",
              borderRadius: 10,
              background: "#2b2b2b",
              color: "white",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          />
        </div>

        <button
          onClick={saveNight}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "white",
            color: "black",
            fontWeight: 800,
            border: "none",
            cursor: "pointer",
          }}
        >
          Save night
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
  {rrsmInsightLoading ? (
    <div style={{ opacity: 0.85 }}>Analyzing last 7 days...</div>
  ) : rrsmInsightError ? (
    <div style={{ color: "tomato", fontWeight: 700 }}>{rrsmInsightError}</div>
  ) : rrsmInsight ? (
    <div style={{ display: "grid", gap: 12 }}>
      <RRSMInsightCard insight={rrsmInsight} />

      <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Your input (tonight)</div>

        <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
          <div>
            <span style={{ opacity: 0.7 }}>Primary:</span>{" "}
            <span style={{ fontWeight: 700 }}>{primaryDriver || "(none)"}</span>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>Secondary:</span>{" "}
            <span style={{ fontWeight: 700 }}>{secondaryDriver || "(none)"}</span>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>Notes:</span>{" "}
            <span style={{ fontWeight: 700 }}>{userNotes?.trim() ? userNotes : "(none)"}</span>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div style={{ opacity: 0.85 }}>No RRSM insight yet.</div>
  )}
</div>


      <details style={{ marginTop: 14, opacity: 0.9 }}>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Debug (show raw sleep metrics)</summary>

        <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 13 }}>
          <div style={{ opacity: 0.9 }}>latestNightId: {latestNightId ?? "(none)"}</div>
          <div style={{ marginTop: 10 }}>
            {metrics.length === 0 ? (
              <div>No rows yet.</div>
            ) : (
              <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(metrics, null, 2)}</pre>
            )}
          </div>
        </div>
      </details>

      <style jsx global>{`
        /* Bigger DatePicker popup (calendar) */
        .react-datepicker {
          font-size: 1rem;
        }
        .react-datepicker__header {
          padding-top: 0.8rem;
        }
        .react-datepicker__month {
          margin: 0.4rem 1rem;
        }
        .react-datepicker__day-name,
        .react-datepicker__day,
        .react-datepicker__time-name {
          width: 2.2rem;
          line-height: 2.2rem;
          margin: 0.15rem;
        }
        .react-datepicker__current-month,
        .react-datepicker-time__header,
        .react-datepicker-year-header {
          font-size: 1.1rem;
        }
      `}</style>
    </div>
  );
}
