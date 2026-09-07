"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InvestigationStatus = "active" | "completed";
type FactorClassification = "main" | "secondary";

type Investigation = {
  id: string;
  user_id: string;
  factor_name: string;
  factor_classification: FactorClassification;
  investigation_area: string;
  status: InvestigationStatus;
  created_at: string;
  completed_at: string | null;
  threshold_observation_id: string | null;
  threshold_amount_degree: string | null;
  threshold_time_local: string | null;
  threshold_sleep_onset_minutes: number | null;
  threshold_sleep_quality: number | null;
  threshold_timezone: string | null;
  threshold_utc_offset_minutes: number | null;
  threshold_is_dst: boolean | null;
};

type Observation = {
  id: string;
  investigation_id: string;
  user_id: string;
  observation_date: string;
  amount_degree: string;
  factor_time_local: string | null;
  sleep_onset_minutes: number | null;
  sleep_quality: number | null;
  timezone: string;
  utc_offset_minutes: number | null;
  is_dst: boolean | null;
  created_at: string;
};

type CandidateNoteEffect = "unknown" | "no_noticeable_effect" | "possible_effect";

type CandidateNote = {
  id: string;
  user_id: string;
  note_date: string;
  factor_name: string;
  effect_observed: CandidateNoteEffect;
  note_text: string | null;
  created_at: string;
  updated_at: string;
};

const AREA_OPTIONS = [
  { value: "bedroom_bed", label: "Bedroom / bed environment" },
  { value: "house", label: "Other factors within the house" },
  { value: "food_drink", label: "Food / drink" },
  { value: "physical_activity", label: "Physical activity" },
  { value: "environment", label: "Other environmental factors" },
  { value: "other", label: "Other" },
];

function toYMD(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatClock(time: string | null) {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, h ?? 0, m ?? 0);
  return date.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMinutes(minutes: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

function areaLabel(value: string) {
  return AREA_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function candidateEffectLabel(value: CandidateNoteEffect) {
  if (value === "no_noticeable_effect") return "No noticeable sleep effect";
  if (value === "possible_effect") return "Possible sleep effect";
  return "Not sure yet";
}

function timezoneOffsetMinutesForLocalDateTime(
  dateYMD: string,
  timeHM: string,
  timeZone: string,
) {
  const [y, mo, d] = dateYMD.split("-").map(Number);
  const [h, mi] = timeHM.split(":").map(Number);

  const assumedUtc = new Date(
    Date.UTC(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0),
  );

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(assumedUtc);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const representedAsUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
  );

  let offset = Math.round((representedAsUtc - assumedUtc.getTime()) / 60000);

  const correctedInstant = new Date(assumedUtc.getTime() - offset * 60000);
  const correctedParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(correctedInstant);

  const correctedMap = Object.fromEntries(
    correctedParts.map((p) => [p.type, p.value]),
  );
  const correctedRepresented = Date.UTC(
    Number(correctedMap.year),
    Number(correctedMap.month) - 1,
    Number(correctedMap.day),
    Number(correctedMap.hour),
    Number(correctedMap.minute),
  );

  offset = Math.round(
    (correctedRepresented - correctedInstant.getTime()) / 60000,
  );

  return offset;
}

function isDstForLocalDate(dateYMD: string, timeHM: string, timeZone: string) {
  const [year] = dateYMD.split("-").map(Number);
  const currentOffset = timezoneOffsetMinutesForLocalDateTime(
    dateYMD,
    timeHM,
    timeZone,
  );
  const janOffset = timezoneOffsetMinutesForLocalDateTime(
    `${year}-01-15`,
    "12:00",
    timeZone,
  );
  const julOffset = timezoneOffsetMinutesForLocalDateTime(
    `${year}-07-15`,
    "12:00",
    timeZone,
  );

  const standardOffset = Math.min(janOffset, julOffset);
  return currentOffset > standardOffset;
}

export default function HabitsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [candidateNotes, setCandidateNotes] = useState<CandidateNote[]>([]);
  const [expandedInvestigationId, setExpandedInvestigationId] = useState<
    string | null
  >(null);
  const [selectedThresholdObservationId, setSelectedThresholdObservationId] =
    useState<string | null>(null);

  const [factorName, setFactorName] = useState("");
  const [factorClassification, setFactorClassification] =
    useState<FactorClassification>("main");
  const [investigationArea, setInvestigationArea] = useState("bedroom_bed");

  const [observationDate, setObservationDate] = useState("");
  const [amountDegree, setAmountDegree] = useState("");
  const [factorTime, setFactorTime] = useState("");
  const [sleepOnsetMinutes, setSleepOnsetMinutes] = useState("");
  const [sleepQuality, setSleepQuality] = useState("");
  const [editingObservationId, setEditingObservationId] = useState<
    string | null
  >(null);

  const [editingInvestigation, setEditingInvestigation] = useState(false);
  const [editFactorName, setEditFactorName] = useState("");
  const [editFactorClassification, setEditFactorClassification] =
    useState<FactorClassification>("main");
  const [editInvestigationArea, setEditInvestigationArea] =
    useState("bedroom_bed");

  const [candidateDate, setCandidateDate] = useState("");
  const [candidateFactorName, setCandidateFactorName] = useState("");
  const [candidateEffect, setCandidateEffect] =
    useState<CandidateNoteEffect>("unknown");
  const [candidateNoteText, setCandidateNoteText] = useState("");
  const [editingCandidateNoteId, setEditingCandidateNoteId] =
    useState<string | null>(null);

  const activeInvestigation =
    investigations.find((item) => item.status === "active") ?? null;

  const activeObservations = activeInvestigation
    ? observations
        .filter((item) => item.investigation_id === activeInvestigation.id)
        .sort((a, b) =>
          `${a.observation_date}T${a.factor_time_local ?? ""}`.localeCompare(
            `${b.observation_date}T${b.factor_time_local ?? ""}`,
          ),
        )
    : [];

  const completedInvestigations = investigations
    .filter((item) => item.status === "completed")
    .sort((a, b) =>
      (b.completed_at ?? b.created_at).localeCompare(
        a.completed_at ?? a.created_at,
      ),
    );

  useEffect(() => {
    const today = toYMD(new Date());
    setObservationDate(today);
    setCandidateDate(today);
  }, []);

  async function reloadData(uid: string) {
    const [investigationResult, observationResult, candidateResult] =
      await Promise.all([
        supabase
          .from("sleep_investigations")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),
        supabase
          .from("sleep_investigation_observations")
          .select("*")
          .eq("user_id", uid)
          .order("observation_date", { ascending: true })
          .order("factor_time_local", { ascending: true }),
        supabase
          .from("sleep_investigation_candidate_notes")
          .select("*")
          .eq("user_id", uid)
          .order("note_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

    if (investigationResult.error) throw investigationResult.error;
    if (observationResult.error) throw observationResult.error;
    if (candidateResult.error) throw candidateResult.error;

    setInvestigations((investigationResult.data ?? []) as Investigation[]);
    setObservations((observationResult.data ?? []) as Observation[]);
    setCandidateNotes((candidateResult.data ?? []) as CandidateNote[]);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data, error: authError } = await supabase.auth.getUser();

      if (authError || !data.user) {
        if (!cancelled) {
          setError(authError?.message ?? "Not signed in.");
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;

      setUserId(data.user.id);

      try {
        await reloadData(data.user.id);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Unable to load investigations.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  function clearObservationForm() {
    setEditingObservationId(null);
    setObservationDate(toYMD(new Date()));
    setAmountDegree("");
    setFactorTime("");
    setSleepOnsetMinutes("");
    setSleepQuality("");
  }

  function clearCandidateForm() {
    setEditingCandidateNoteId(null);
    setCandidateDate(toYMD(new Date()));
    setCandidateFactorName("");
    setCandidateEffect("unknown");
    setCandidateNoteText("");
  }

  function beginEditCandidateNote(note: CandidateNote) {
    setEditingCandidateNoteId(note.id);
    setCandidateDate(note.note_date);
    setCandidateFactorName(note.factor_name);
    setCandidateEffect(note.effect_observed);
    setCandidateNoteText(note.note_text ?? "");
    setError(null);
    setMessage("");
  }

  async function saveCandidateNote() {
    if (!userId || !candidateDate || !candidateFactorName.trim()) {
      setError("Enter a date and possible factor before saving the note.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage("");

    const payload = {
      user_id: userId,
      note_date: candidateDate,
      factor_name: candidateFactorName.trim(),
      effect_observed: candidateEffect,
      note_text: candidateNoteText.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const result = editingCandidateNoteId
      ? await supabase
          .from("sleep_investigation_candidate_notes")
          .update(payload)
          .eq("id", editingCandidateNoteId)
          .eq("user_id", userId)
      : await supabase
          .from("sleep_investigation_candidate_notes")
          .insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    const wasEditing = Boolean(editingCandidateNoteId);
    clearCandidateForm();
    setMessage(wasEditing ? "Possible factor note updated." : "Possible factor note saved.");
    await reloadData(userId);
    setSaving(false);
  }

  async function deleteCandidateNote(noteId: string) {
    if (!userId) return;

    setSaving(true);
    setError(null);
    setMessage("");

    const { error: deleteError } = await supabase
      .from("sleep_investigation_candidate_notes")
      .delete()
      .eq("id", noteId)
      .eq("user_id", userId);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    if (editingCandidateNoteId === noteId) clearCandidateForm();
    setMessage("Possible factor note deleted.");
    await reloadData(userId);
    setSaving(false);
  }

  function useCandidateForInvestigation(note: CandidateNote) {
    if (activeInvestigation) {
      setError(
        `Finish the current investigation of "${activeInvestigation.factor_name}" before starting another factor.`,
      );
      return;
    }

    setFactorName(note.factor_name);
    setError(null);
    setMessage(
      `"${note.factor_name}" is ready in Start an Investigation. Choose its classification and area, then start when you are ready.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function startInvestigation() {
    if (!userId || !factorName.trim()) return;

    if (activeInvestigation) {
      setError(
        `Finish the current investigation of "${activeInvestigation.factor_name}" before starting another factor.`,
      );
      return;
    }

    setSaving(true);
    setError(null);
    setMessage("");

    const { error: insertError } = await supabase
      .from("sleep_investigations")
      .insert({
        user_id: userId,
        factor_name: factorName.trim(),
        factor_classification: factorClassification,
        investigation_area: investigationArea,
        status: "active",
      });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setFactorName("");
    setMessage("Investigation started.");
    await reloadData(userId);
    setSaving(false);
  }

  function beginEditInvestigation() {
    if (!activeInvestigation) return;

    setEditFactorName(activeInvestigation.factor_name);
    setEditFactorClassification(
      activeInvestigation.factor_classification,
    );
    setEditInvestigationArea(activeInvestigation.investigation_area);
    setEditingInvestigation(true);
    setError(null);
    setMessage("");
  }

  function cancelEditInvestigation() {
    setEditingInvestigation(false);
    setEditFactorName("");
  }

  async function saveInvestigationDetails() {
    if (!userId || !activeInvestigation || !editFactorName.trim()) {
      setError("Enter the contributing factor name.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage("");

    const { error: updateError } = await supabase
      .from("sleep_investigations")
      .update({
        factor_name: editFactorName.trim(),
        factor_classification: editFactorClassification,
        investigation_area: editInvestigationArea,
      })
      .eq("id", activeInvestigation.id)
      .eq("user_id", userId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setEditingInvestigation(false);
    setMessage("Investigation details updated.");
    await reloadData(userId);
    setSaving(false);
  }

  function beginEditObservation(observation: Observation) {
    setEditingObservationId(observation.id);
    setObservationDate(observation.observation_date);
    setAmountDegree(observation.amount_degree);
    setFactorTime(
      observation.factor_time_local
        ? observation.factor_time_local.slice(0, 5)
        : "",
    );
    setSleepOnsetMinutes(
      observation.sleep_onset_minutes != null
        ? String(observation.sleep_onset_minutes)
        : "",
    );
    setSleepQuality(
      observation.sleep_quality != null
        ? String(observation.sleep_quality)
        : "",
    );
    setError(null);
    setMessage("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function saveObservation() {
    if (!userId || !activeInvestigation) return;

    const onset =
      sleepOnsetMinutes.trim() === ""
        ? null
        : Number(sleepOnsetMinutes);
    const quality =
      sleepQuality.trim() === ""
        ? null
        : Number(sleepQuality);

    if (!observationDate || !amountDegree.trim()) {
      setError("Enter the date and amount / degree before saving.");
      return;
    }

    if (
      onset != null &&
      (!Number.isFinite(onset) || onset < 0 || !Number.isInteger(onset))
    ) {
      setError("Time to fall asleep must be a whole number of minutes.");
      return;
    }

    if (
      quality != null &&
      (!Number.isFinite(quality) || quality < 1 || quality > 10)
    ) {
      setError("After-sleep quality must be between 1 and 10.");
      return;
    }

    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const utcOffsetMinutes = factorTime
      ? timezoneOffsetMinutesForLocalDateTime(
          observationDate,
          factorTime,
          timezone,
        )
      : null;

    const isDst = factorTime
      ? isDstForLocalDate(observationDate, factorTime, timezone)
      : null;

    setSaving(true);
    setError(null);
    setMessage("");

    const payload = {
      investigation_id: activeInvestigation.id,
      user_id: userId,
      observation_date: observationDate,
      amount_degree: amountDegree.trim(),
      factor_time_local: factorTime || null,
      sleep_onset_minutes: onset,
      sleep_quality: quality,
      timezone,
      utc_offset_minutes: utcOffsetMinutes,
      is_dst: isDst,
    };

    const result = editingObservationId
      ? await supabase
          .from("sleep_investigation_observations")
          .update(payload)
          .eq("id", editingObservationId)
          .eq("user_id", userId)
          .eq("investigation_id", activeInvestigation.id)
      : await supabase
          .from("sleep_investigation_observations")
          .insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    const wasEditing = Boolean(editingObservationId);
    clearObservationForm();
    setMessage(wasEditing ? "Observation updated." : "Observation saved.");
    await reloadData(userId);
    setSaving(false);
  }

  async function finishInvestigation() {
    if (!userId || !activeInvestigation || !selectedThresholdObservationId) {
      setError(
        "Select the observation that represents the threshold you want to record.",
      );
      return;
    }

    const thresholdObservation = observations.find(
      (item) => item.id === selectedThresholdObservationId,
    );

    if (!thresholdObservation) {
      setError("The selected threshold observation could not be found.");
      return;
    }

    if (
      !thresholdObservation.factor_time_local ||
      thresholdObservation.sleep_onset_minutes == null ||
      thresholdObservation.sleep_quality == null
    ) {
      setError(
        "Complete the selected observation before using it as the threshold.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    setMessage("");

    const { error: updateError } = await supabase
      .from("sleep_investigations")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        threshold_observation_id: thresholdObservation.id,
        threshold_amount_degree: thresholdObservation.amount_degree,
        threshold_time_local: thresholdObservation.factor_time_local,
        threshold_sleep_onset_minutes:
          thresholdObservation.sleep_onset_minutes,
        threshold_sleep_quality: thresholdObservation.sleep_quality,
        threshold_timezone: thresholdObservation.timezone,
        threshold_utc_offset_minutes: thresholdObservation.utc_offset_minutes,
        threshold_is_dst: thresholdObservation.is_dst,
      })
      .eq("id", activeInvestigation.id)
      .eq("user_id", userId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSelectedThresholdObservationId(null);
    clearObservationForm();
    setMessage(
      "Investigation completed and threshold added to your results.",
    );
    await reloadData(userId);
    setSaving(false);
  }

  async function continueInvestigation(investigation: Investigation) {
    if (!userId) return;

    if (activeInvestigation && activeInvestigation.id !== investigation.id) {
      setError(
        `You already have an active investigation: "${activeInvestigation.factor_name}". Finish it before continuing another factor.`,
      );
      return;
    }

    setSaving(true);
    setError(null);
    setMessage("");

    const { error: updateError } = await supabase
      .from("sleep_investigations")
      .update({
        status: "active",
        completed_at: null,
      })
      .eq("id", investigation.id)
      .eq("user_id", userId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setExpandedInvestigationId(investigation.id);
    setSelectedThresholdObservationId(
      investigation.threshold_observation_id ?? null,
    );
    setMessage(`Continuing investigation: ${investigation.factor_name}.`);
    await reloadData(userId);
    setSaving(false);
  }

  function investigationObservations(investigationId: string) {
    return observations
      .filter((item) => item.investigation_id === investigationId)
      .sort((a, b) =>
        `${a.observation_date}T${a.factor_time_local ?? ""}`.localeCompare(
          `${b.observation_date}T${b.factor_time_local ?? ""}`,
        ),
      );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-base">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Investigation</h1>

        <p className="mt-2 max-w-4xl text-neutral-700">
          Investigate one possible contributing factor at a time. Start with
          the main factors that may be disrupting your sleep, beginning with
          the bedroom and bed environment. Once those main factors and their
          threshold limits are understood, move on to secondary factors.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="font-bold">One factor at a time</div>
            <p className="mt-1 text-sm text-neutral-700">
              Changing more than one possible contributing factor at the same
              time can make it difficult to determine which factor affected
              your sleep.
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="font-bold">Daylight saving</div>
            <p className="mt-1 text-sm text-neutral-700">
              Enter the actual time shown on the clock when the factor
              occurred. SleepFix automatically records your timezone, UTC
              offset, and daylight-saving status. Do not adjust the time
              yourself.
            </p>
          </div>
        </div>

        <details className="mt-4 rounded-xl border bg-white p-4">
          <summary className="cursor-pointer font-bold">
            See example investigation: Coke drink
          </summary>

          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-3 py-2">Factor</th>
                  <th className="px-3 py-2">Amount / degree</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Time to fall asleep</th>
                  <th className="px-3 py-2">
                    How did you feel after sleeping?
                  </th>
                </tr>
              </thead>

              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-2">Coke drink</td>
                  <td className="px-3 py-2">500 ml</td>
                  <td className="px-3 py-2">1:00 pm</td>
                  <td className="px-3 py-2">30 min</td>
                  <td className="px-3 py-2">9 / 10</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2">Coke drink</td>
                  <td className="px-3 py-2">500 ml</td>
                  <td className="px-3 py-2">2:00 pm</td>
                  <td className="px-3 py-2">35 min</td>
                  <td className="px-3 py-2">9 / 10</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Coke drink</td>
                  <td className="px-3 py-2">500 ml</td>
                  <td className="px-3 py-2">3:00 pm</td>
                  <td className="px-3 py-2">3 hr</td>
                  <td className="px-3 py-2">8 / 10</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-sm text-neutral-700">
            In this example, the person may still feel good after sleeping,
            but the time taken to fall asleep increased from about 30 minutes
            to 3 hours. The sleep-onset change therefore remains an important
            part of the investigation.
          </p>
        </details>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border bg-white p-6">
          Loading investigation…
        </div>
      ) : null}

      {!loading ? (
        <section className="mb-8 rounded-xl border border-blue-200 bg-blue-50/30 p-5">
          <h2 className="text-xl font-semibold">Possible Factor Notes</h2>

          <p className="mt-1 text-neutral-700">
            Keep a reference of anything you may want to investigate later, including factors that appeared to have no effect this time. A note is not treated as a cause or a completed investigation.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            <label className="grid gap-2 xl:col-span-2">
              <span className="font-semibold">Date</span>
              <input
                type="date"
                value={candidateDate}
                max={toYMD(new Date())}
                onChange={(e) => setCandidateDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>

            <label className="grid gap-2 xl:col-span-3">
              <span className="font-semibold">Possible factor</span>
              <input
                value={candidateFactorName}
                onChange={(e) => setCandidateFactorName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="e.g. cashew nuts"
              />
            </label>

            <label className="grid gap-2 xl:col-span-3">
              <span className="font-semibold">What happened to sleep?</span>
              <select
                value={candidateEffect}
                onChange={(e) =>
                  setCandidateEffect(e.target.value as CandidateNoteEffect)
                }
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="unknown">Not sure yet</option>
                <option value="no_noticeable_effect">No noticeable sleep effect</option>
                <option value="possible_effect">Possible sleep effect</option>
              </select>
            </label>

            <label className="grid gap-2 md:col-span-2 xl:col-span-4">
              <span className="font-semibold">Reference note</span>
              <textarea
                value={candidateNoteText}
                onChange={(e) => setCandidateNoteText(e.target.value)}
                maxLength={1000}
                className="min-h-[90px] w-full rounded-lg border px-3 py-2"
                placeholder="e.g. Ate a handful in the evening. Fell asleep normally and sleep seemed unaffected."
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveCandidateNote}
              disabled={saving || !candidateDate || !candidateFactorName.trim()}
              className="rounded-xl bg-black px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {saving
                ? "Saving…"
                : editingCandidateNoteId
                  ? "Update factor note"
                  : "Save factor note"}
            </button>

            {editingCandidateNoteId ? (
              <button
                type="button"
                onClick={clearCandidateForm}
                className="rounded-xl border border-neutral-300 px-5 py-3 font-bold"
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          <div className="mt-6 grid gap-3">
            {candidateNotes.map((note) => (
              <div key={note.id} className="rounded-xl border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold">{note.factor_name}</div>
                    <div className="mt-1 text-sm text-neutral-600">
                      {formatDate(note.note_date)} · {candidateEffectLabel(note.effect_observed)}
                    </div>
                  </div>

                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-700">
                    Possible factor
                  </span>
                </div>

                {note.note_text ? (
                  <div className="mt-3 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
                    {note.note_text}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => beginEditCandidateNote(note)}
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => useCandidateForInvestigation(note)}
                    disabled={Boolean(activeInvestigation)}
                    className="rounded-lg border border-black px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    Use for investigation
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteCandidateNote(note.id)}
                    disabled={saving}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {!candidateNotes.length ? (
              <div className="rounded-lg border border-dashed bg-white p-4 text-sm text-neutral-500">
                No possible factor notes saved yet.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {!loading && !activeInvestigation ? (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-xl font-semibold">Start an Investigation</h2>

          <p className="mt-1 text-neutral-600">
            Begin with a main contributing factor in the bedroom or bed
            environment. Move to secondary factors after the main factors have
            been investigated.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="grid gap-2">
              <span className="font-semibold">Factor being investigated</span>
              <input
                value={factorName}
                onChange={(e) => setFactorName(e.target.value)}
                className="rounded-lg border px-3 py-2"
                placeholder="e.g. bedroom temperature"
              />
            </label>

            <label className="grid gap-2">
              <span className="font-semibold">Factor classification</span>
              <select
                value={factorClassification}
                onChange={(e) =>
                  setFactorClassification(
                    e.target.value as FactorClassification,
                  )
                }
                className="rounded-lg border px-3 py-2"
              >
                <option value="main">Main contributing factor</option>
                <option value="secondary">
                  Secondary contributing factor
                </option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="font-semibold">Investigation area</span>
              <select
                value={investigationArea}
                onChange={(e) => setInvestigationArea(e.target.value)}
                className="rounded-lg border px-3 py-2"
              >
                {AREA_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={startInvestigation}
            disabled={!userId || !factorName.trim() || saving}
            className="mt-5 rounded-xl bg-black px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? "Starting…" : "Start investigation"}
          </button>
        </section>
      ) : null}

      {!loading && activeInvestigation ? (
        <section className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold uppercase tracking-wide text-green-700">
                Active investigation
              </div>

              {!editingInvestigation ? (
                <>
                  <h2 className="mt-1 text-2xl font-bold">
                    {activeInvestigation.factor_name}
                  </h2>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full bg-neutral-100 px-3 py-1">
                      {activeInvestigation.factor_classification === "main"
                        ? "Main contributing factor"
                        : "Secondary contributing factor"}
                    </span>

                    <span className="rounded-full bg-neutral-100 px-3 py-1">
                      {areaLabel(activeInvestigation.investigation_area)}
                    </span>

                    <button
                      type="button"
                      onClick={beginEditInvestigation}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 font-semibold hover:bg-neutral-50"
                    >
                      Edit investigation
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-3 rounded-xl border border-neutral-200 p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="grid gap-2">
                      <span className="font-semibold">
                        Contributing factor
                      </span>
                      <input
                        value={editFactorName}
                        onChange={(e) =>
                          setEditFactorName(e.target.value)
                        }
                        className="rounded-lg border px-3 py-2"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="font-semibold">
                        Factor classification
                      </span>
                      <select
                        value={editFactorClassification}
                        onChange={(e) =>
                          setEditFactorClassification(
                            e.target.value as FactorClassification,
                          )
                        }
                        className="rounded-lg border px-3 py-2"
                      >
                        <option value="main">
                          Main contributing factor
                        </option>
                        <option value="secondary">
                          Secondary contributing factor
                        </option>
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="font-semibold">
                        Investigation area
                      </span>
                      <select
                        value={editInvestigationArea}
                        onChange={(e) =>
                          setEditInvestigationArea(e.target.value)
                        }
                        className="rounded-lg border px-3 py-2"
                      >
                        {AREA_OPTIONS.map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={saveInvestigationDetails}
                      disabled={saving || !editFactorName.trim()}
                      className="rounded-xl bg-black px-4 py-2 font-bold text-white disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save investigation changes"}
                    </button>

                    <button
                      type="button"
                      onClick={cancelEditInvestigation}
                      disabled={saving}
                      className="rounded-xl border border-neutral-300 px-4 py-2 font-bold disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-neutral-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold">
                {editingObservationId
                  ? "Edit observation"
                  : "Add observation"}
              </h3>

              {editingObservationId ? (
                <button
                  type="button"
                  onClick={clearObservationForm}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <label className="grid gap-2">
                <span className="font-semibold">Date</span>
                <input
                  type="date"
                  value={observationDate}
                  max={toYMD(new Date())}
                  onChange={(e) => setObservationDate(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>

              <label className="grid gap-2">
                <span className="font-semibold">Amount / degree</span>
                <input
                  value={amountDegree}
                  onChange={(e) => setAmountDegree(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="e.g. 22 degrees, 500 ml, 30 min"
                />
              </label>

              <label className="grid gap-2">
                <span className="font-semibold">Time factor occurred</span>
                <input
                  type="time"
                  value={factorTime}
                  onChange={(e) => setFactorTime(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>

              <label className="grid gap-2">
                <span className="font-semibold">Time to fall asleep</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={sleepOnsetMinutes}
                    onChange={(e) =>
                      setSleepOnsetMinutes(e.target.value)
                    }
                    className="min-w-0 flex-1 rounded-lg border px-3 py-2"
                    placeholder="30"
                  />
                  <span className="shrink-0 text-sm text-neutral-500">
                    min
                  </span>
                </div>
              </label>

              <label className="grid gap-2 md:col-span-2 xl:col-span-1">
                <span className="font-semibold">
                  How did you feel after sleeping?
                </span>

                <select
                  value={sleepQuality}
                  onChange={(e) => setSleepQuality(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                >
                  <option value="">No entry yet</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(
                    (score) => (
                      <option key={score} value={score}>
                        {score} / 10
                      </option>
                    ),
                  )}
                </select>

                <span className="text-xs text-neutral-500">
                  1 = very poor · 10 = excellent
                </span>
              </label>
            </div>

            <p className="mt-4 text-sm text-neutral-600">
              You can save the observation before the night is complete. Date
              and amount / degree are enough to save it. Return later and use
              Edit to add the factor time, time taken to fall asleep, and how
              you felt after sleeping.
            </p>

            <button
              type="button"
              onClick={saveObservation}
              disabled={saving}
              className="mt-5 rounded-xl bg-black px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {saving
                ? "Saving…"
                : editingObservationId
                  ? "Update observation"
                  : "Save observation"}
            </button>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-bold">Investigation History</h3>

            <p className="mt-1 text-sm text-neutral-600">
              All observations remain attached to this investigation. Edit any
              observation if you entered something incorrectly. Select the
              observation that represents the threshold you want to record.
            </p>

            <div className="mt-4 overflow-x-auto rounded-xl border">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-neutral-50">
                  <tr className="border-b text-left">
                    <th className="px-3 py-3">Threshold</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Amount / degree</th>
                    <th className="px-3 py-3">Time</th>
                    <th className="px-3 py-3">Time to fall asleep</th>
                    <th className="px-3 py-3">After-sleep quality</th>
                    <th className="px-3 py-3">DST context</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {activeObservations.map((observation) => (
                    <tr
                      key={observation.id}
                      className="border-b last:border-b-0"
                    >
                      <td className="px-3 py-3">
                        <input
                          type="radio"
                          name="threshold"
                          checked={
                            selectedThresholdObservationId ===
                            observation.id
                          }
                          onChange={() =>
                            setSelectedThresholdObservationId(
                              observation.id,
                            )
                          }
                          aria-label={`Use ${formatDate(
                            observation.observation_date,
                          )} as threshold`}
                        />
                      </td>

                      <td className="px-3 py-3">
                        {formatDate(observation.observation_date)}
                      </td>

                      <td className="px-3 py-3">
                        {observation.amount_degree}
                      </td>

                      <td className="px-3 py-3">
                        {formatClock(observation.factor_time_local)}
                      </td>

                      <td className="px-3 py-3">
                        {formatMinutes(
                          observation.sleep_onset_minutes,
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {observation.sleep_quality != null ? `${observation.sleep_quality} / 10` : "—"}
                      </td>

                      <td className="px-3 py-3">
                        {observation.is_dst == null
                          ? "—"
                          : observation.is_dst
                            ? "DST"
                            : "Standard time"}
                      </td>

                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            beginEditObservation(observation)
                          }
                          className="rounded-lg border border-neutral-300 px-3 py-1.5 font-semibold hover:bg-neutral-50"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}

                  {!activeObservations.length ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-3 py-5 text-center text-neutral-500"
                      >
                        No observations saved yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={finishInvestigation}
              disabled={
                saving ||
                !activeObservations.length ||
                !selectedThresholdObservationId
              }
              className="mt-5 rounded-xl bg-black px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {saving
                ? "Saving…"
                : "Finish investigation and save threshold"}
            </button>
          </div>
        </section>
      ) : null}

      {!loading ? (
        <section className="mt-8 rounded-xl border bg-white p-5">
          <h2 className="text-xl font-semibold">Investigation Records</h2>

          <p className="mt-1 text-neutral-600">
            Completed investigations remain here as inactive records. Nothing
            is erased when an investigation is finished.
          </p>

          <div className="mt-4 grid gap-3">
            {investigations.map((investigation) => {
              const rows = investigationObservations(investigation.id);
              const expanded =
                expandedInvestigationId === investigation.id ||
                investigation.status === "active";

              return (
                <div
                  key={investigation.id}
                  className="rounded-xl border border-neutral-200"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedInvestigationId(
                        expandedInvestigationId === investigation.id
                          ? null
                          : investigation.id,
                      )
                    }
                    className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
                  >
                    <div>
                      <div className="font-bold">
                        {investigation.factor_name}
                      </div>

                      <div className="mt-1 text-sm text-neutral-600">
                        {investigation.factor_classification === "main"
                          ? "Main contributing factor"
                          : "Secondary contributing factor"}{" "}
                        · {areaLabel(investigation.investigation_area)}
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${
                        investigation.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {investigation.status === "active"
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="border-t p-4">
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">
                                Amount / degree
                              </th>
                              <th className="px-3 py-2">Time</th>
                              <th className="px-3 py-2">
                                Time to fall asleep
                              </th>
                              <th className="px-3 py-2">
                                After-sleep quality
                              </th>
                              <th className="px-3 py-2">DST context</th>
                            </tr>
                          </thead>

                          <tbody>
                            {rows.map((row) => (
                              <tr
                                key={row.id}
                                className="border-b last:border-b-0"
                              >
                                <td className="px-3 py-2">
                                  {formatDate(row.observation_date)}
                                </td>
                                <td className="px-3 py-2">
                                  {row.amount_degree}
                                </td>
                                <td className="px-3 py-2">
                                  {formatClock(row.factor_time_local)}
                                </td>
                                <td className="px-3 py-2">
                                  {formatMinutes(
                                    row.sleep_onset_minutes,
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {row.sleep_quality != null ? `${row.sleep_quality} / 10` : "—"}
                                </td>
                                <td className="px-3 py-2">
                                  {row.is_dst == null
                                    ? "—"
                                    : row.is_dst
                                      ? "DST"
                                      : "Standard time"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {investigation.status === "completed" ? (
                        <button
                          type="button"
                          onClick={() =>
                            continueInvestigation(investigation)
                          }
                          disabled={
                            saving || Boolean(activeInvestigation)
                          }
                          className="mt-4 rounded-xl border border-black px-4 py-2 font-bold disabled:opacity-50"
                        >
                          Continue investigation
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {!investigations.length ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-neutral-500">
                No investigations recorded yet.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {!loading ? (
        <section className="mt-8 rounded-xl border bg-white p-5">
          <h2 className="text-xl font-semibold">
            Contributing Factors Disrupting Your Sleep
          </h2>

          <p className="mt-1 text-neutral-600">
            This table builds as you complete investigations and record the
            threshold that you are satisfied with.
          </p>

          <div className="mt-4 overflow-x-auto rounded-xl border">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-neutral-50">
                <tr className="border-b text-left">
                  <th className="px-3 py-3">Contributing factor</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Area</th>
                  <th className="px-3 py-3">Amount / degree</th>
                  <th className="px-3 py-3">Indicated threshold</th>
                  <th className="px-3 py-3">Time to fall asleep</th>
                  <th className="px-3 py-3">After-sleep quality</th>
                  <th className="px-3 py-3">DST context</th>
                </tr>
              </thead>

              <tbody>
                {completedInvestigations.map((investigation) => (
                  <tr
                    key={investigation.id}
                    className="cursor-pointer border-b last:border-b-0 hover:bg-neutral-50"
                    onClick={() =>
                      setExpandedInvestigationId(investigation.id)
                    }
                  >
                    <td className="px-3 py-3 font-semibold">
                      {investigation.factor_name}
                    </td>
                    <td className="px-3 py-3">
                      {investigation.factor_classification === "main"
                        ? "Main"
                        : "Secondary"}
                    </td>
                    <td className="px-3 py-3">
                      {areaLabel(investigation.investigation_area)}
                    </td>
                    <td className="px-3 py-3">
                      {investigation.threshold_amount_degree ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      {formatClock(
                        investigation.threshold_time_local,
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {formatMinutes(
                        investigation.threshold_sleep_onset_minutes,
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {investigation.threshold_sleep_quality != null
                        ? `${investigation.threshold_sleep_quality} / 10`
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {investigation.threshold_is_dst == null
                        ? "—"
                        : investigation.threshold_is_dst
                          ? "DST"
                          : "Standard time"}
                    </td>
                  </tr>
                ))}

                {!completedInvestigations.length ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-5 text-center text-neutral-500"
                    >
                      No completed investigations yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
