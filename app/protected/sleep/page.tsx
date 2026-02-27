"use client";
/* eslint-disable react/no-unescaped-entities */
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import RRSMInsightCard, { RRSMInsight, RRSMUserInput } from "@/components/RRSMInsightCard";

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
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

const LATENCY_CHOICES = ["5", "10", "20", "30", "60+"] as const;
const WAKE_CHOICES = ["0", "1", "2", "3", "4", "5+"] as const;
const QUALITY_CHOICES = Array.from({ length: 10 }, (_, i) => String(i + 1));

const MIND_TAGS = [
  "Overstimulated",
  "anxious",
  "calm",
  "racing thoughts",
  "flat",
  "depressed",
  "focused",
  "Wired",
  "foggy",
  "clear",
] as const;

const ENV_TAGS = ["Hot", "cold", "noisy", "Quiet", "Bright", "Dark", "Humid", "Dry"] as const;

const BODY_TAGS = [
  "Pain",
  "Restless",
  "Heavy fatigue",
  "Light fatigue",
  "Inflamed -inflammation",
  "Tense",
  "Relaxed",
] as const;

const PROTOCOLS = [
  "DOMS compression Protocol",
  "Cooling Discharge Protocol",
  "Mental Discharge Protocol",
  "No suggestion",
] as const;

function toggleTag(list: string[], tag: string) {
  return list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag];
}

function TagPills(props: {
  title: string;
  tags: readonly string[];
  selected: string[];
  setSelected: (v: string[]) => void;
}) {
  const { title, tags, selected, setSelected } = props;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {tags.map((t) => {
          const on = selected.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => setSelected(toggleTag(selected, t))}
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: on ? "white" : "rgba(255,255,255,0.06)",
                color: on ? "black" : "white",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
        Optional. Improves accuracy of protocol suggestions.
      </div>
    </div>
  );
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

  // Airtable-style scales (robust inputs)
  const [sleepQuality, setSleepQuality] = useState<string>(""); // "1".."10"
  const [sleepLatencyChoice, setSleepLatencyChoice] = useState<string>(""); // "5"|"10"|"20"|"30"|"60+"
  const [wakeUpsChoice, setWakeUpsChoice] = useState<string>(""); // "0"|"1".."4"|"5+"
  const [mindTags, setMindTags] = useState<string[]>([]);
  const [environmentTags, setEnvironmentTags] = useState<string[]>([]);
  const [bodyTags, setBodyTags] = useState<string[]>([]);
  const [protocolUsedName, setProtocolUsedName] = useState<string>("");

  // Latest / metrics
  const [latestNightId, setLatestNightId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<NightMetricsRow[]>([]);

  // RRSM insight
  const [rrsmInsight, setRrsmInsight] = useState<RRSMInsight | null>(null);
  const [rrsmInsightLoading, setRrsmInsightLoading] = useState(true);
  const [rrsmInsightError, setRrsmInsightError] = useState<string | null>(null);

  // Driver confirmation (simple fields)
  const [primaryDriver, setPrimaryDriver] = useState<string>("Nothing / no clear driver");
  const [secondaryDriver, setSecondaryDriver] = useState<string>("Nothing / no clear driver");
  const [userNotes, setUserNotes] = useState<string>("");

  useEffect(() => setMounted(true), []);

  // Default datetime-local values on client
  useEffect(() => {
    const start = new Date();
    start.setHours(23, 30, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(7, 30, 0, 0);

    setSleepStartDate(toIsoLocalDate(start));
    setSleepStartTime(toLocalTimeHHMM(start));
    setSleepEndDate(toIsoLocalDate(end));
    setSleepEndTime(toLocalTimeHHMM(end));

    // sensible defaults for new inputs
    setSleepQuality("");
    setSleepLatencyChoice("");
    setWakeUpsChoice("");
    setMindTags([]);
    setEnvironmentTags([]);
    setBodyTags([]);
    setProtocolUsedName("");
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

  // Fetch RRSM insight (POST only)
  useEffect(() => {
    if (!userId) return;
    (async () => {
      setRrsmInsightLoading(true);
      setRrsmInsightError(null);
      try {
        const res = await fetch("/api/rrsm/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: 7, includeDrivers: true }),
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

    // minimal validation (don’t block, but nudge)
    if (!sleepQuality || !sleepLatencyChoice || !wakeUpsChoice) {
      alert("Please select Sleep Quality, Sleep Latency, and Wake Ups (these power insights).");
      return;
    }

    const { data: inserted, error } = await supabase
      .from("sleep_nights")
      .insert({
        user_id: userId,
        sleep_start: start.toISOString(),
        sleep_end: end.toISOString(),
        primary_driver: primaryDriver,
        secondary_driver: secondaryDriver,
        notes: userNotes,

        // Airtable-style inputs
        sleep_quality: Number(sleepQuality),
        sleep_latency_choice: sleepLatencyChoice,
        wake_ups_choice: wakeUpsChoice,
        mind_tags: mindTags,
        environment_tags: environmentTags,
        body_tags: bodyTags,
        protocol_used_name: protocolUsedName || null,
      })
      .select("id")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

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

    // re-run analyze after save
    try {
      setRrsmInsightLoading(true);
      const res = await fetch("/api/rrsm/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7, includeDrivers: true }),
      });
      const data = (await res.json()) as { insights?: RRSMInsight[] };
      setRrsmInsight(data?.insights?.[0] ?? null);
      setRrsmInsightError(null);
    } catch (e: any) {
      setRrsmInsightError(e?.message ?? "RRSM analyze failed.");
    } finally {
      setRrsmInsightLoading(false);
    }
  }

  if (!mounted) return null;

  const startDateObj = sleepStartDate ? new Date(`${sleepStartDate}T00:00:00`) : new Date();
  const endDateObj = sleepEndDate ? new Date(`${sleepEndDate}T00:00:00`) : new Date();

  const userInput: RRSMUserInput = {
    primaryDriver,
    secondaryDriver,
    notes: userNotes,
  };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 18px" }}>
      <style jsx global>{`
        .react-datepicker-wrapper,
        .react-datepicker__input-container {
          width: 100%;
        }
        .sf-input-box {
          width: 100%;
          min-width: 0;
        }
        .sf-datetime-input {
          width: 100%;
          box-sizing: border-box;
          padding: var(--sf-input-pad);
          border-radius: 10px;
          background: #2b2b2b;
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .sf-select {
          width: 100%;
          padding: var(--sf-input-pad);
          border-radius: 10px;
          background: #2b2b2b;
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
      `}</style>

      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 18 }}>Sleep</h1>

      {/* Sleep window */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Sleep Start</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sf-input-box">
              <DatePicker
                selected={startDateObj}
                onChange={(d: Date) => setSleepStartDate(toIsoLocalDate(d))}
                dateFormat="dd/MM/yyyy"
                className="sf-datetime-input"
              />
            </div>
            <div className="sf-input-box">
              <input
                type="time"
                value={sleepStartTime}
                onChange={(e) => setSleepStartTime(e.target.value)}
                className="sf-datetime-input"
              />
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Sleep End</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sf-input-box">
              <DatePicker
                selected={endDateObj}
                onChange={(d: Date) => setSleepEndDate(toIsoLocalDate(d))}
                dateFormat="dd/MM/yyyy"
                className="sf-datetime-input"
              />
            </div>
            <div className="sf-input-box">
              <input
                type="time"
                value={sleepEndTime}
                onChange={(e) => setSleepEndTime(e.target.value)}
                className="sf-datetime-input"
              />
            </div>
          </div>
        </div>
      </div>

      <hr style={{ margin: "18px 0", opacity: 0.3 }} />

      {/* Airtable-style scales */}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
          Quick check-in (powers insights)
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Sleep quality (1–10)</div>
            <select className="sf-select" value={sleepQuality} onChange={(e) => setSleepQuality(e.target.value)}>
              <option value="">Select…</option>
              {QUALITY_CHOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Sleep latency</div>
            <select className="sf-select" value={sleepLatencyChoice} onChange={(e) => setSleepLatencyChoice(e.target.value)}>
              <option value="">Select…</option>
              {LATENCY_CHOICES.map((v) => (
                <option key={v} value={v}>
                  {v === "60+" ? "60+ mins" : `${v} mins`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Wake ups</div>
            <select className="sf-select" value={wakeUpsChoice} onChange={(e) => setWakeUpsChoice(e.target.value)}>
              <option value="">Select…</option>
              {WAKE_CHOICES.map((v) => (
                <option key={v} value={v}>
                  {v === "5+" ? "5+" : v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <TagPills title="Mind State (tags)" tags={MIND_TAGS} selected={mindTags} setSelected={setMindTags} />
          <TagPills title="Environment (tags)" tags={ENV_TAGS} selected={environmentTags} setSelected={setEnvironmentTags} />
          <TagPills title="Body State (tags)" tags={BODY_TAGS} selected={bodyTags} setSelected={setBodyTags} />

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Protocol used (optional)</div>
            <select className="sf-select" value={protocolUsedName} onChange={(e) => setProtocolUsedName(e.target.value)}>
              <option value="">(none)</option>
              {PROTOCOLS.filter((p) => p !== "No suggestion").map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
              If you used a protocol, selecting it lets the app detect mismatches.
            </div>
          </div>
        </div>
      </div>

      <hr style={{ margin: "18px 0", opacity: 0.3 }} />

      {/* User drivers */}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
          What do YOU think affected tonight?
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Primary driver</div>
          <select className="sf-select" value={primaryDriver} onChange={(e) => setPrimaryDriver(e.target.value)}>
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
          <select className="sf-select" value={secondaryDriver} onChange={(e) => setSecondaryDriver(e.target.value)}>
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
              boxSizing: "border-box",
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

      {/* Insight card */}
      <div style={{ marginTop: 18 }}>
        <RRSMInsightCard insight={rrsmInsight} loading={rrsmInsightLoading} error={rrsmInsightError} userInput={userInput} />
      </div>

      {/* Keep debug for now (you said we remove at end) */}
      <details style={{ marginTop: 14, opacity: 0.9 }}>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Debug (show raw sleep metrics)</summary>
        <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 13 }}>
          <div style={{ opacity: 0.9 }}>latestNightId: {latestNightId ?? "(none)"}</div>
          <div style={{ marginTop: 10 }}>
            {metrics.length === 0 ? <div>No rows yet.</div> : <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(metrics, null, 2)}</pre>}
          </div>
        </div>
      </details>

      <style jsx global>{`
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
