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
import { buildAdaptiveReminderState, type AdaptiveReminderState } from "@/lib/rrsm/adaptive-reminder";
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

type SavedNightRow = {
  id: string;
  local_date: string | null;
  created_at: string;
  sleep_start: string | null;
  sleep_end: string | null;
  sleep_quality: number | string | null;
  sleep_latency_choice: string | null;
  wake_ups_choice: string | null;
  wake_recovery_choice: string | null;
  mind_tags: string[] | null;
  environment_tags: string[] | null;
  bed_tags: string[] | null;
  body_tags: string[] | null;
  protocol_followed: string | null;
  notes: string | null;
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

const ROOM_NO_ISSUE = "No clear room issue";

const ENV_TAGS = [
  "Room too hot",
  "Room too cold",
  "Room too noisy",
  "Room too bright",
  "Room too humid",
  "Room too dry",
  "Room felt stuffy / poor airflow",
  "Other room issue",
] as const;

const BED_TAGS = [
  "No bed / bedding issue",
  "Mattress too hard",
  "Mattress too soft",
  "Bed felt hot",
  "Bed felt cold",
  "Too many blankets",
  "Too few blankets",
  "Partner body heat",
  "Sleepwear too warm",
  "Sleepwear too light",
  "Pillow too warm",
  "Pillow too cold",
  "Pillow / position issue",
  "New mattress / still adjusting",
  "New pillow / still adjusting",
  "Other bed factor",
] as const;

const BODY_TAGS = [
  "Pain",
  "Muscle soreness / DOMS",
  "Body discomfort / pressure",
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
  allowEmpty = false,
}: {
  title: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  required?: boolean;
  help?: string;
  allowEmpty?: boolean;
}) {
  // Mutually exclusive "none" option (if present)
  const NONE =
    options.find((o) => {
      const lower = o.toLowerCase();
      return (
        lower.includes("not sure") ||
        lower.includes("no clear") ||
        lower.includes("no bed / bedding issue") ||
        lower.includes("nothing / none")
      );
    }) ?? null;

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
      // Optional groups may be left completely blank.
      if (next.length === 0 && NONE && !allowEmpty) next = [NONE];
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


function formatSavedNightDate(ymd: string | null, createdAt: string) {
  const value = ymd ?? createdAt.slice(0, 10);
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function splitMindTags(tags: string[] | null | undefined) {
  const values = Array.isArray(tags) ? tags : [];
  const emotionalSet = new Set<string>(["Not sure / none", ...EMOTIONAL_TAGS]);
  const mentalSet = new Set<string>(["Not sure / none", ...MENTAL_TAGS]);

  return {
    emotional: values.filter((tag) => emotionalSet.has(tag)),
    mental: values.filter((tag) => mentalSet.has(tag)),
  };
}

function OptionalContextSection({
  title,
  value,
  children,
}: {
  title: string;
  value: string[];
  children: React.ReactNode;
}) {
  const selectedCount = value.length;

  return (
    <details className="rounded-xl border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 font-extrabold text-gray-900">
        <span>{title}</span>
        <span className="text-sm font-semibold text-gray-500">
          {selectedCount > 0
            ? `${selectedCount} selected`
            : "Optional"}
        </span>
      </summary>
      <div className="border-t border-gray-100 px-4 pt-4">
        {children}
      </div>
    </details>
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
  const [bedTags, setBedTags] = useState<string[]>([]);
  const [bodyTags, setBodyTags] = useState<string[]>([]);
  const [unusualNotes, setUnusualNotes] = useState<string>("");
  const [protocolUsedName, setProtocolUsedName] = useState<string>("");
  const [protocolFollowed, setProtocolFollowed] = useState<string>("");

  // Latest / metrics
  const [latestNightId, setLatestNightId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<NightMetricsRow[]>([]);
  const [adaptiveReminder, setAdaptiveReminder] = useState<AdaptiveReminderState | null>(null);
  const [recentNights, setRecentNights] = useState<SavedNightRow[]>([]);
  const [editingNightId, setEditingNightId] = useState<string | null>(null);

  const [isSavingNight, setIsSavingNight] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function resetNightForm() {
    setEditingNightId(null);
    // Reset *all* user-entered fields so it’s obvious the night was saved
    setSleepQuality("");
    setSleepLatencyChoice("");
    setWakeUpsChoice("");
    setWakeRecoveryChoice("");
    setEmotionalTags([]);
    setMentalTags([]);
    setEnvironmentTags([]);
    setBedTags([]);
    setBodyTags([]);
    setUnusualNotes("");
    setProtocolUsedName("");
    setProtocolFollowed("");

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

  async function reloadRecentNights(uid: string) {
    const { data, error } = await supabase
      .from("sleep_nights")
      .select(
        "id,local_date,created_at,sleep_start,sleep_end,sleep_quality,sleep_latency_choice,wake_ups_choice,wake_recovery_choice,mind_tags,environment_tags,bed_tags,body_tags,protocol_followed,notes",
      )
      .eq("user_id", uid)
      .order("local_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(14);

    if (!error) setRecentNights((data ?? []) as SavedNightRow[]);
  }

  function beginEditNight(night: SavedNightRow) {
    const start = night.sleep_start ? new Date(night.sleep_start) : null;
    const end = night.sleep_end ? new Date(night.sleep_end) : null;
    const split = splitMindTags(night.mind_tags);

    setEditingNightId(night.id);

    if (start) {
      setSleepStartDate(toIsoLocalDate(start));
      setSleepStartTime(toLocalTimeHHMM(start));
    }
    if (end) {
      setSleepEndDate(toIsoLocalDate(end));
      setSleepEndTime(toLocalTimeHHMM(end));
    }

    setSleepQuality(night.sleep_quality == null ? "" : String(night.sleep_quality));
    setSleepLatencyChoice(night.sleep_latency_choice ?? "");
    setWakeUpsChoice(night.wake_ups_choice ?? "");
    setWakeRecoveryChoice(night.wake_recovery_choice ?? "");
    setEmotionalTags(split.emotional);
    setMentalTags(split.mental);
    setEnvironmentTags(Array.isArray(night.environment_tags) ? night.environment_tags : []);
    setBedTags(Array.isArray(night.bed_tags) ? night.bed_tags : []);
    setBodyTags(Array.isArray(night.body_tags) ? night.body_tags : []);
    setProtocolFollowed(night.protocol_followed ?? "");
    setUnusualNotes(night.notes ?? "");
    setSaveNotice(null);
    setSaveError(null);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditNight() {
    resetNightForm();
    setSaveNotice("Edit cancelled.");
    setSaveError(null);
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
    setBedTags([]);
    setBodyTags([]);
    setUnusualNotes("");
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

      const { data: recentRows } = await supabase
        .from("sleep_nights")
        .select("created_at, local_date")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);

      setAdaptiveReminder(buildAdaptiveReminderState((recentRows ?? []) as any[]));
      await reloadRecentNights(userId);
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

      if (existingNight?.id && existingNight.id !== editingNightId) {
        setSaveError(`A night for ${endLocalDate} has already been saved. Please edit that saved night instead of creating a duplicate.`);
        return;
      }

      // Optional context is recorded as observation, not as a confirmed cause.
      const environmentObservationTags = environmentTags.includes(ROOM_NO_ISSUE)
        ? []
        : environmentTags;

      const payload = {
        user_id: userId,
        sleep_start: startAt.toISOString(),
        sleep_end: endAt.toISOString(),
        // Use the wake date as the night's local_date so dashboard dates match what users expect.
        local_date: toIsoLocalDate(endAt),
        duration_min: durationMinutes,
        sleep_quality: Number(sleepQuality),
        sleep_latency_choice: sleepLatencyChoice,
        wake_ups_choice: wakeUpsChoice,
        wake_recovery_choice: wakeRecoveryChoice,
        mind_tags: [...emotionalTags, ...mentalTags],
        environment_tags: environmentObservationTags,
        bed_tags: bedTags,
        body_tags: bodyTags,
        primary_driver: null,
        secondary_driver: null,
        protocol_used_name: !protocolUsedName || protocolUsedName === "none" ? null : protocolUsedName,
        protocol_followed: protocolFollowed || null,
        notes: unusualNotes.trim() || null,
      };

      const saveResult = editingNightId
        ? await supabase
            .from("sleep_nights")
            .update(payload)
            .eq("id", editingNightId)
            .eq("user_id", userId)
            .select("id")
            .single()
        : await supabase
            .from("sleep_nights")
            .insert(payload)
            .select("id")
            .single();

      if (saveResult.error) {
        setSaveError(saveResult.error.message || "Failed to save.");
        return;
      }

      const wasEditing = Boolean(editingNightId);
      setLatestNightId(saveResult.data?.id ?? null);
      setAdaptiveReminder(null);
      await reloadRecentNights(userId);

      resetNightForm();
      setSaveNotice(wasEditing ? "Night updated ✅" : "Saved ✅");
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
        details > summary::-webkit-details-marker {
          display: none;
        }
      `}</style>

      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 18, fontFamily: "Verdana, sans-serif", color: "#000080" }}>Sleep</h1>

      {editingNightId ? (
        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
          <div className="font-extrabold">Editing a saved night</div>
          <div className="mt-1 text-sm">
            Update any field or note, then choose <strong>Update night</strong>. This changes the existing record rather than creating a duplicate.
          </div>
          <button
            type="button"
            onClick={cancelEditNight}
            className="mt-3 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-bold"
          >
            Cancel edit
          </button>
        </div>
      ) : null}

      {adaptiveReminder?.shouldShow ? (
        <div
          style={{
            marginBottom: 16,
            border: "1px solid #c7d2fe",
            borderRadius: 16,
            background: "#eef2ff",
            padding: 14,
            color: "#1e1b4b",
          }}
        >
          <div style={{ fontWeight: 900 }}>{adaptiveReminder.title}</div>
          <div style={{ marginTop: 4 }}>{adaptiveReminder.message}</div>
        </div>
      ) : null}


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

        <div className="mt-6">
          <div className="sf-section-title">Optional context</div>
          <div className="sf-help" style={{ marginBottom: 14 }}>
            Add only what was noticeable or relevant. These observations are not treated as confirmed causes.
          </div>

          <div className="grid gap-3">
            <OptionalContextSection title="Emotional state" value={emotionalTags}>
              <MultiCheckGroup
                title=""
                options={["Not sure / none", ...EMOTIONAL_TAGS]}
                value={emotionalTags}
                onChange={setEmotionalTags}
                allowEmpty
                help="What was your emotional state?"
              />
            </OptionalContextSection>

            <OptionalContextSection title="Mental state" value={mentalTags}>
              <MultiCheckGroup
                title=""
                options={["Not sure / none", ...MENTAL_TAGS]}
                value={mentalTags}
                onChange={setMentalTags}
                allowEmpty
                help="What was your thinking state?"
              />
            </OptionalContextSection>

            <OptionalContextSection title="Room conditions" value={environmentTags}>
              <MultiCheckGroup
                title=""
                options={[ROOM_NO_ISSUE, ...ENV_TAGS]}
                value={environmentTags}
                onChange={setEnvironmentTags}
                allowEmpty
                help="What room conditions were present or noticeable during the night?"
              />
            </OptionalContextSection>

            <OptionalContextSection title="Bed / bedding" value={bedTags}>
              <MultiCheckGroup
                title=""
                options={[...BED_TAGS]}
                value={bedTags}
                onChange={setBedTags}
                allowEmpty
                help="What bed or bedding conditions were present or noticeable?"
              />
            </OptionalContextSection>

            <OptionalContextSection title="Body state" value={bodyTags}>
              <MultiCheckGroup
                title=""
                options={["Not sure / none", ...BODY_TAGS]}
                value={bodyTags}
                onChange={setBodyTags}
                allowEmpty
                help="What did you notice physically?"
              />
            </OptionalContextSection>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="sf-field-label">Anything unusual or different last night?</div>
            <div className="sf-help" style={{ marginBottom: 12 }}>
              Optional — note anything that stood out, even if you are not sure whether it mattered. You can list several
              possibilities here and, if needed, investigate them one at a time later.
            </div>
            <textarea
              value={unusualNotes}
              onChange={(e) => setUnusualNotes(e.target.value)}
              maxLength={1500}
              placeholder="Example: room felt warmer than usual, late coffee, argument before bed, different pillow, hard workout..."
              className="w-full rounded-xl border border-gray-300 bg-white p-3 text-base text-gray-900"
              style={{ minHeight: 120, resize: "vertical" }}
            />
            <div className="mt-2 text-right text-xs text-gray-500">
              {unusualNotes.length}/1500
            </div>
          </div>
        </div>
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
        {isSavingNight ? "Saving…" : editingNightId ? "Update night" : "Save night"}
      </button>
      {saveNotice && (
        <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: "#000080" }}>{saveNotice}</div>
      )}
      {saveError && (
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: "#B00020" }}>{saveError}</div>
      )}

      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="sf-section-title">Saved notes</div>
        <div className="sf-help" style={{ marginBottom: 14 }}>
          Only nights where you recorded something unusual or different appear here. Use Edit night if you need to correct or add to a saved note.
        </div>

        <div className="grid gap-3">
          {recentNights
            .filter((night) => Boolean(night.notes?.trim()))
            .map((night) => (
              <details key={night.id} className="rounded-xl border border-gray-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
                  <div className="font-extrabold text-gray-900">
                    {formatSavedNightDate(night.local_date, night.created_at)}
                  </div>
                  <span className="text-sm font-semibold text-gray-500">
                    View note
                  </span>
                </summary>

                <div className="border-t border-gray-100 p-4">
                  <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-gray-800">
                    {night.notes?.trim()}
                  </div>

                  <button
                    type="button"
                    onClick={() => beginEditNight(night)}
                    className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 font-bold text-gray-900"
                  >
                    Edit night
                  </button>
                </div>
              </details>
            ))}

          {!recentNights.some((night) => Boolean(night.notes?.trim())) ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              No saved notes yet.
            </div>
          ) : null}
        </div>
      </section>
      </div>
  );
}
