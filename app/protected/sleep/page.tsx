"use client";

function parseWakeUpsToNumber(choice: string): number {
  // UI choices like "0", "1", "2", "3", "4", "5+"
  const trimmed = (choice || "").trim();
  if (!trimmed) return 0;
  if (trimmed.endsWith("+")) {
    const n = Number(trimmed.slice(0, -1));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

/* eslint-disable react/no-unescaped-entities */
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import RRSMInsightCard, { RRSMInsight, RRSMUserInput } from "@/components/RRSMInsightCard";
function buildNotes(notes: string, affected: string[]) {
  const parts: string[] = [];

  if (affected && affected.length > 0) {
    parts.push("Affected tonight: " + affected.join(", "));
  }

  if (notes && notes.trim() !== "") {
    parts.push("Notes: " + notes.trim());
  }

  return parts.join(" | ");
}
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

function parseLatencyToMinutes(choice: string | null): number | null {
  if (!choice) return null;
  const raw = choice.replace(/[^0-9+]/g, "");
  if (!raw) return null;
  // handles '60+' or '5' etc
  const num = parseInt(raw.replace("+", ""), 10);
  if (Number.isNaN(num)) return null;
  return num;
}

const WAKE_CHOICES = ["0", "1", "2", "3", "4", "5+"] as const;
const QUALITY_CHOICES = Array.from({ length: 10 }, (_, i) => String(i + 1));

const MIND_TAGS = [
  "Overstimulated",
  "anxious",
  "calm",
  "racing thoughts",
  "low / flat",
  "depressed",
  "focused",
  "wired / alert",
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
  "Sleep Entry Lock Protocol",
  "Internal Cooling Protocol",
  "Pre-Sleep Discharge Protocol",
  "DOMS compression Protocol",
  "Cooling Discharge Protocol",
  "Mental Discharge Protocol",
] as const;

function toggleTag(list: string[], tag: string) {
  return list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag];
}

function MultiCheckGroup({
  title,
  options,
  value,
  onChange,
  required,
  help,
}: {
  title: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  required?: boolean;
  help?: string;
}) {
  // Mutually exclusive "none" option (if present)
  const NONE = options.find((o) => o.toLowerCase().includes("not sure") || o.toLowerCase().includes("no clear")) ?? null;

  function toggle(opt: string) {
    const isSelected = value.includes(opt);
    let next = isSelected ? value.filter((v) => v !== opt) : [...value, opt];

    if (NONE) {
      const hasNone = next.includes(NONE);
      const others = next.filter((v) => v !== NONE);

      // If selecting NONE while others exist -> keep NONE only
      if (opt === NONE && !isSelected) {
        next = [NONE];
      }
      // If selecting another option while NONE is selected -> drop NONE
      else if (opt !== NONE && !isSelected && hasNone) {
        next = others;
      }
      // If user unselects all -> fall back to NONE if it exists
      if (next.length === 0 && NONE) next = [NONE];
    }

    onChange(next);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {title ? (
        <div className="sf-field-label">
          {title}
          {required ? <span className="sf-req">*</span> : null}
        </div>
      ) : null}
      {help ? <div className="sf-help">{help}</div> : null}

      <div className="sf-checklist" role="group" aria-label={title}>
        {options.map((opt) => {
          const checked = value.includes(opt);
          return (
            <label key={opt} className={`sf-checkitem ${checked ? "is-checked" : ""}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt)}
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>

      <div className="sf-help" style={{ marginTop: 6 }}>
        Tip: Click/tap the items that apply. You can choose more than one.
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
  const [drivers, setDrivers] = useState<string[]>(["Nothing / no clear driver"]);
  const [userNotes, setUserNotes] = useState<string>("");
  const [affectedTonight, setAffectedTonight] = useState<string[]>([]);


  const [isSavingNight, setIsSavingNight] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function resetNightForm() {
    // Reset *all* user-entered fields so it’s obvious the night was saved
    setSleepQuality("");
    setSleepLatencyChoice("");
    setWakeUpsChoice("");
    setMindTags([]);
    setEnvironmentTags([]);
    setBodyTags([]);
    setProtocolUsedName("");
    setDrivers(["Nothing / no clear driver"]);
    setUserNotes("");
      setAffectedTonight([]);

    // Put dates back to a sensible “tonight” default
    const start = new Date();
    start.setHours(23, 30, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(7, 30, 0, 0);
    setSleepStartDate(toIsoLocalDate(start));
    setSleepStartTime(toLocalTimeHHMM(start));
    setSleepEndDate(toIsoLocalDate(end));
    setSleepEndTime(toLocalTimeHHMM(end));
  }

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
    if (!userId || !canSaveNight) return;

    setSaveNotice(null);
    setSaveError(null);
    setIsSavingNight(true);

    try {
      const startAt = parseLocalDateTime(sleepStartDate, sleepStartTime);

      // Build end from the explicit end date + wake time.
      // If the chosen end datetime is still before the start datetime, assume the user meant "next day".
      let endAt = parseLocalDateTime(sleepEndDate, sleepEndTime);
      if (endAt.getTime() <= startAt.getTime()) {
        endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
      }

      // Keep UI end-date in sync (helps avoid confusing future edits).
      const endLocalDate = toIsoLocalDate(endAt);
      if (sleepEndDate !== endLocalDate) setSleepEndDate(endLocalDate);

      const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);

      // Basic guardrails (prevents DB duration check constraints from firing).
      if (durationMinutes <= 0 || durationMinutes > 16 * 60) {
        setSaveError(
          "Sleep duration looks invalid. Please check your bedtime + wake time (crossing midnight is supported)."
        );
        return;
      }

      const primaryDriver = drivers.find((d) => d !== "Nothing / no clear driver") ?? null;
      const extraDrivers = drivers.filter((d) => d !== primaryDriver && d !== "Nothing / no clear driver");

      const payload = {
        user_id: userId,
        sleep_start: startAt.toISOString(),
        sleep_end: endAt.toISOString(),
        // Use the wake date as the night's local_date so dashboard dates match what users expect.
        local_date: toIsoLocalDate(endAt),
        sleep_quality: Number(sleepQuality),
        sleep_latency_choice: sleepLatencyChoice,
        wake_ups_choice: wakeUpsChoice,
        mind_tags: mindTags,
        environment_tags: environmentTags,
        body_tags: bodyTags,
        primary_driver: primaryDriver,
        secondary_driver: extraDrivers.length ? extraDrivers.join(", ") : null,
        protocol_used_name: !protocolUsedName || protocolUsedName === "none" ? null : protocolUsedName,
        notes: buildNotes(userNotes, affectedTonight) || null,
      };

      const { data: inserted, error } = await supabase
        .from("sleep_nights")
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        setSaveError(error.message || "Failed to save.");
        return;
      }

      setLatestNightId(inserted?.id ?? null);

      // Optimistically reset form + refresh list.
      resetNightForm();
      setSaveNotice("Saved ✅");

      // Optional: refresh RRSM insight immediately after saving a valid night.
      setRrsmInsightLoading(true);
      try {
        const response = await fetch("/api/rrsm/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });

        if (response.ok) {
          const json = (await response.json()) as { insight?: unknown };
          if (json?.insight) setRrsmInsight(json.insight as RRSMInsight);
        }
      } catch {
        // ignore; the night still saved
      } finally {
        setRrsmInsightLoading(false);
      }
    } finally {
      setIsSavingNight(false);
    }
  }


  if (!mounted) return null;

  const startDateObj = sleepStartDate ? new Date(`${sleepStartDate}T00:00:00`) : new Date();
  const endDateObj = sleepEndDate ? new Date(`${sleepEndDate}T00:00:00`) : new Date();

  

const missingRequired: string[] = [];
if (!sleepQuality) missingRequired.push("Sleep Quality");
if (!sleepLatencyChoice) missingRequired.push("Sleep Latency");
if (!wakeUpsChoice) missingRequired.push("Wake Ups");
if (!mindTags || mindTags.length === 0) missingRequired.push("Mind tag");
if (!environmentTags || environmentTags.length === 0) missingRequired.push("Environment tag");
if (!bodyTags || bodyTags.length === 0) missingRequired.push("Body tag");
const canSaveNight = missingRequired.length === 0;

const userInput: RRSMUserInput = {
    primaryDriver: drivers.join(", "),
    secondaryDriver: "",
    notes: buildNotes(userNotes, affectedTonight),
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
          min-height: 44px;
          padding: var(--sf-input-pad);
          border-radius: 10px;
          background: #2b2b2b;
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
      `}</style>

      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 18, fontFamily: "Verdana, sans-serif", color: "#000080" }}>Sleep</h1>

      {/* Night window */}
      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="sf-section-title">Night recording</div>
        <div className="sf-help">Log when you went to sleep and when you woke up.</div>

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

            </div>



      {/* Required metrics */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="sf-section-title">Required sleep metrics</div>
        <div className="sf-help">These are required to save a night and generate RRSM insights. Required fields are marked with <span className="sf-req">*</span>.</div>


      <div style={{ marginTop: 6 }}>
        <div className="sf-section-title">Quick check-in (powers insights)</div>
        <div className="sf-help">Required fields are marked with <span className="sf-req">*</span>.</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div className="sf-field-label">Sleep quality (1–10)<span className="sf-req">*</span></div>
            <div className="sf-help" style={{ minHeight: 64 }}>How good was your sleep overall? (1 = terrible, 10 = amazing)</div>
            <select className="sf-select" style={{ marginTop: "auto" }} value={sleepQuality} onChange={(e) => setSleepQuality(e.target.value)}>
              <option value="">Select…</option>
              {QUALITY_CHOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div className="sf-field-label">Sleep latency<span className="sf-req">*</span></div>
            <div className="sf-help" style={{ minHeight: 64 }}>How long did it take to fall asleep?</div>
            <select className="sf-select" style={{ marginTop: "auto" }} value={sleepLatencyChoice} onChange={(e) => setSleepLatencyChoice(e.target.value)}>
              <option value="">Select…</option>
              {LATENCY_CHOICES.map((v) => (
                <option key={v} value={v}>
                  {v === "60+" ? "60+ mins" : `${v} mins`}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div className="sf-field-label">Wake ups<span className="sf-req">*</span></div>
            <div className="sf-help" style={{ minHeight: 64 }}>How many times did you wake up?</div>
            <select className="sf-select" style={{ marginTop: "auto" }} value={wakeUpsChoice} onChange={(e) => setWakeUpsChoice(e.target.value)}>
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
          <MultiCheckGroup title="Mind State" options={["Not sure / none", ...MIND_TAGS]} value={mindTags} onChange={setMindTags} required help="Required. Choose one or more tags. If unsure, pick “Not sure / none”." />
          <MultiCheckGroup title="Environment" options={["Not sure / none", ...ENV_TAGS]} value={environmentTags} onChange={setEnvironmentTags} required help="Required. Choose one or more tags. If unsure, pick “Not sure / none”." />
          <MultiCheckGroup title="Body State" options={["Not sure / none", ...BODY_TAGS]} value={bodyTags} onChange={setBodyTags} required help="Required. Choose one or more tags. If unsure, pick “Not sure / none”." />

          

        </div>
      </div>

            </div>

      {/* Optional inputs */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="sf-section-title">Optional extras</div>
        <div className="sf-help">
          These are optional. They help SleepFix learn patterns over time. This is different from the required metrics above.
        </div>

        <div style={{ marginTop: 14, marginBottom: 14 }}>
          <div className="sf-field-label">Protocol used (optional)</div>
          <div className="sf-help">
            Select this only if you actually used a protocol last night. (This is separate from the protocol the app recommends.)
          </div>
          <a href="/protected/protocols" style={{ display: "inline-block", marginTop: 8, padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", background: "white", fontWeight: 600 }}>
              View protocol steps
            </a>
          <select className="sf-select" style={{ marginTop: 10 }} value={protocolUsedName} onChange={(e) => setProtocolUsedName(e.target.value)}>
            <option value="">(none)</option>
            {PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
            Logging this helps the app detect “protocol mismatch” (e.g. you used a protocol that didn’t fit the pattern).
          </div>
        </div>

        {/* After the night: your best guess */}

      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
          After the night: what stood out?
        </div>
        <div className="sf-help" style={{ marginBottom: 12 }}>
          This is your best guess about what may have affected the night. It’s different from <b>Habits</b>, which logs what happened during the day.
        </div>

        <div style={{ marginBottom: 14 }}>
          <MultiCheckGroup
            title=""
            options={[
              "Nothing / no clear driver",
              "Stress / worry",
              "Late caffeine",
              "Alcohol",
              "Late meal",
              "Screen time",
              "Noise",
              "Too hot",
              "Too cold",
              "Pain / discomfort",
              "Exercise late",
              "Other",
            ]}
            value={drivers}
            onChange={(next) => setDrivers(next)}
            help="Select one or more. If nothing stands out, choose “Nothing / no clear driver”."
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="sf-field-label">Notes (optional)</div>
          <div className="sf-help">
            The information you provide also goes into our analysis and gives us more information to work with.
          </div>
          <textarea
            className="sf-textarea"
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            placeholder="e.g., neighbor noise until midnight, but slept well after"
          />
        </div>

        <button type="button" onClick={saveNight} disabled={!canSaveNight || isSavingNight} className="sf-button">
          {isSavingNight ? "Saving…" : saveNotice === "Saved" ? "Saved" : "Save night"}
        </button>
      {saveNotice && (
        <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: "#000080" }}>{saveNotice}</div>
      )}
      {saveError && (
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: "#B00020" }}>{saveError}</div>
      )}


        {!canSaveNight && (
          <div className="sf-help" style={{ marginTop: 10 }}>
            Complete: {missingRequired.join(", ")}
          </div>
        )}
      </div>
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
