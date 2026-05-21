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
function buildDriverNotes(drivers: string[]) {
  const selectedDrivers = drivers.filter((d) => d !== "Nothing / none");
  if (selectedDrivers.length === 0) return null;
  return "Sleep hygiene: " + selectedDrivers.join(", ");
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
const WAKE_RECOVERY_CHOICES = ["0-5", "5-15", "15-30", "30-60", "60+"] as const;
const QUALITY_CHOICES = Array.from({ length: 10 }, (_, i) => String(i + 1));

const EMOTIONAL_TAGS = [
  "Anxious",
  "Worried",
  "Upset",
  "Stressed",
  "Euphoric",
  "Depressed",
  "Low / flat",
  "Calm",
] as const;

const MENTAL_TAGS = [
  "Racing thoughts",
  "Mentally stimulated",
  "Mentally alert",
  "Focused",
  "Foggy",
  "Clear",
  "Calm / quiet mind",
] as const;

const ENV_TAGS = ["Hot", "cold", "noisy", "Quiet", "Bright", "Dark", "Humid", "Dry"] as const;

const BODY_TAGS = [
  "Pain",
  "Muscle soreness / discomfort",
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
  const [wakeRecoveryChoice, setWakeRecoveryChoice] = useState<string>(""); // total awake time after wake-ups
  const [emotionalTags, setEmotionalTags] = useState<string[]>([]);
  const [mentalTags, setMentalTags] = useState<string[]>([]);
  const [environmentTags, setEnvironmentTags] = useState<string[]>([]);
  const [bodyTags, setBodyTags] = useState<string[]>([]);
  const [protocolUsedName, setProtocolUsedName] = useState<string>("");
  const [protocolFollowed, setProtocolFollowed] = useState<string>("");

  // Latest / metrics
  const [latestNightId, setLatestNightId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<NightMetricsRow[]>([]);

  // Driver confirmation (simple fields)
  const [drivers, setDrivers] = useState<string[]>(["Nothing / none"]);
  const [isSavingNight, setIsSavingNight] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function resetNightForm() {
    // Reset *all* user-entered fields so it’s obvious the night was saved
    setSleepQuality("");
    setSleepLatencyChoice("");
    setWakeUpsChoice("");
    setWakeRecoveryChoice("");
    setEmotionalTags([]);
    setMentalTags([]);
    setEnvironmentTags([]);
    setBodyTags([]);
    setProtocolUsedName("");
    setProtocolFollowed("");
    setDrivers(["Nothing / none"]);

    // Put dates back to a sensible “last night” default
    // Start = yesterday 11:30 PM, End = today 7:30 AM
    const end = new Date();
    end.setHours(7, 30, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    start.setHours(23, 30, 0, 0);
    setSleepStartDate(toIsoLocalDate(start));
    setSleepStartTime(toLocalTimeHHMM(start));
    setSleepEndDate(toIsoLocalDate(end));
    setSleepEndTime(toLocalTimeHHMM(end));
  }

  useEffect(() => setMounted(true), []);

  // Default datetime-local values on client
  useEffect(() => {
    // Show “last night” by default, not a future wake date.
    const end = new Date();
    end.setHours(7, 30, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    start.setHours(23, 30, 0, 0);

    setSleepStartDate(toIsoLocalDate(start));
    setSleepStartTime(toLocalTimeHHMM(start));
    setSleepEndDate(toIsoLocalDate(end));
    setSleepEndTime(toLocalTimeHHMM(end));

    // sensible defaults for new inputs
    setSleepQuality("");
    setSleepLatencyChoice("");
    setWakeUpsChoice("");
    setWakeRecoveryChoice("");
    setEmotionalTags([]);
    setMentalTags([]);
    setEnvironmentTags([]);
    setBodyTags([]);
    setProtocolUsedName("");
    setProtocolFollowed("");
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

      // Rule 1: do not allow future wake dates.
      const todayLocalDate = toIsoLocalDate(new Date());
      if (endLocalDate > todayLocalDate) {
        setSaveError("Future dates are not allowed. Please choose today or an earlier date.");
        return;
      }

      const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);

      // Basic guardrails (prevents DB duration check constraints from firing).
      if (durationMinutes <= 0 || durationMinutes > 16 * 60) {
        setSaveError(
          "Sleep duration looks invalid. Please check your bedtime + wake time (crossing midnight is supported)."
        );
        return;
      }

      // Rule 2: one saved night per wake date.
      const { data: existingNight, error: existingNightError } = await supabase
        .from("sleep_nights")
        .select("id")
        .eq("user_id", userId)
        .eq("local_date", endLocalDate)
        .limit(1)
        .maybeSingle();

      if (existingNightError) {
        setSaveError(existingNightError.message || "Could not validate the selected date.");
        return;
      }

      if (existingNight?.id) {
        setSaveError(`A night for ${endLocalDate} has already been saved. Please edit that date instead of creating a duplicate.`);
        return;
      }

      const primaryDriver = drivers.find((d) => d !== "Nothing / none") ?? null;
      const extraDrivers = drivers.filter((d) => d !== primaryDriver && d !== "Nothing / none");

      const payload = {
        user_id: userId,
        sleep_start: startAt.toISOString(),
        sleep_end: endAt.toISOString(),
        // Use the wake date as the night's local_date so dashboard dates match what users expect.
        local_date: toIsoLocalDate(endAt),
        sleep_quality: Number(sleepQuality),
        sleep_latency_choice: sleepLatencyChoice,
        wake_ups_choice: wakeUpsChoice,
        wake_recovery_choice: wakeRecoveryChoice,
        mind_tags: [...emotionalTags, ...mentalTags],
        environment_tags: environmentTags,
        body_tags: bodyTags,
        primary_driver: primaryDriver,
        secondary_driver: extraDrivers.length ? extraDrivers.join(", ") : null,
        protocol_used_name: !protocolUsedName || protocolUsedName === "none" ? null : protocolUsedName,
        protocol_followed: protocolFollowed || null,
        notes: buildDriverNotes(drivers),
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
if (!wakeRecoveryChoice) missingRequired.push("Total awake time after wake-ups");
if (!emotionalTags || emotionalTags.length === 0) missingRequired.push("Emotional state");
if (!mentalTags || mentalTags.length === 0) missingRequired.push("Mental state");
if (!environmentTags || environmentTags.length === 0) missingRequired.push("Room environment");
if (!bodyTags || bodyTags.length === 0) missingRequired.push("Body state");
const canSaveNight = missingRequired.length === 0;

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
                maxDate={new Date()}
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
                maxDate={new Date()}
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
        <div className="sf-section-title">Sleep Check-In — How Was Your Sleep?</div>
        <div className="sf-help">Tap what applies.</div>

        <div className="space-y-5 mt-4">
          {/* Sleep initiation + result */}
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="sf-field-label" style={{ marginBottom: 10 }}>
                  Sleep latency<span className="sf-req">*</span>
                </div>
                <div className="sf-help" style={{ marginBottom: 12 }}>
                  How long did it take to fall asleep?
                </div>
                <select
                  className="sf-select"
                  value={sleepLatencyChoice}
                  onChange={(e) => setSleepLatencyChoice(e.target.value)}
                >
                  <option value="">Select…</option>
                  {LATENCY_CHOICES.map((v) => (
                    <option key={v} value={v}>
                      {v === "60+" ? "60+ mins" : `${v} mins`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="sf-field-label" style={{ marginBottom: 10 }}>
                  Sleep quality<span className="sf-req">*</span>
                </div>
                <div className="sf-help" style={{ marginBottom: 12 }}>
                  Overall sleep quality.
                </div>
                <select
                  className="sf-select"
                  value={sleepQuality}
                  onChange={(e) => setSleepQuality(e.target.value)}
                >
                  <option value="">Select…</option>
                  {QUALITY_CHOICES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Sleep maintenance */}
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="sf-field-label" style={{ marginBottom: 14 }}>
              Sleep maintenance
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="sf-field-label">
                  Wake ups<span className="sf-req">*</span>
                </div>
                <div className="sf-help" style={{ marginBottom: 12 }}>
                  How many times did you wake up?
                </div>
                <select
                  className="sf-select"
                  value={wakeUpsChoice}
                  onChange={(e) => setWakeUpsChoice(e.target.value)}
                >
                  <option value="">Select…</option>
                  {WAKE_CHOICES.map((v) => (
                    <option key={v} value={v}>
                      {v === "5+" ? "5+" : v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="sf-field-label">
                  Total time awake during the night<span className="sf-req">*</span>
                </div>
                <div className="sf-help" style={{ marginBottom: 12 }}>
                  Combined awake time after waking up.
                </div>
                <select
                  className="sf-select"
                  value={wakeRecoveryChoice}
                  onChange={(e) => setWakeRecoveryChoice(e.target.value)}
                >
                  <option value="">Select…</option>
                  {WAKE_RECOVERY_CHOICES.map((v) => (
                    <option key={v} value={v}>
                      {v === "60+" ? "60+ mins" : `${v.replace("-", "–")} mins`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <MultiCheckGroup
            title="Emotional state"
            options={["Not sure / none", ...EMOTIONAL_TAGS]}
            value={emotionalTags}
            onChange={setEmotionalTags}
            required
            help="Choose what best describes your emotional state."
          />

          <MultiCheckGroup
            title="Mental state"
            options={["Not sure / none", ...MENTAL_TAGS]}
            value={mentalTags}
            onChange={setMentalTags}
            required
            help="Choose what best describes your thinking state."
          />

          <MultiCheckGroup
            title="Room environment"
            options={["Not sure / none", ...ENV_TAGS]}
            value={environmentTags}
            onChange={setEnvironmentTags}
            required
            help="Choose what affected the room while you slept."
          />

          <MultiCheckGroup
            title="Body state"
            options={["Not sure / none", ...BODY_TAGS]}
            value={bodyTags}
            onChange={setBodyTags}
            required
            help="Choose what best describes your body state."
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="sf-section-title" style={{ fontWeight: 800 }}>
  Sleep hygiene<span className="sf-req">*</span>
</div>
        <div className="sf-help" style={{ marginBottom: 12 }}>
          Choose anything that happened before bed.
        </div>

        <MultiCheckGroup
          title=""
          options={[
            "Nothing / none",
            "Late caffeine",
            "Alcohol",
            "Nicotine / smoking",
            "Late meal",
            "Screen time",
            "Late intense exercise",
            "Night vitamins / supplements / electrolytes",
            "Other",
          ]}
          value={drivers}
          onChange={(next) => setDrivers(next)}
          help="Choose one or more."
        />
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="sf-field-label">Was last night's recommended protocol followed?</div>
        <div className="sf-help">This helps SleepFix learn whether the recommendation worked, partly worked, or was not tested.</div>
        <select
          className="sf-select"
          value={protocolFollowed}
          onChange={(e) => setProtocolFollowed(e.target.value)}
        >
          <option value="">Select…</option>
          <option value="yes">Yes — followed</option>
          <option value="partial">Partially followed</option>
          <option value="no">No — did not follow</option>
          <option value="none">No protocol used</option>
        </select>
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
      </div>
  );
}
