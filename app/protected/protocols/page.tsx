'use client';

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { runRRSMEngineV4, type RRSMProtocolResult } from "@/lib/rrsm/engine-v4";
import type { RRSMMetricsNight } from "@/lib/rrsm/engine-v2";
import { getStandardProtocolByTitle, getEscalatedProtocolForTitle, type SleepFixProtocol } from "@/lib/protocols";

type SleepNightRow = {
  id: string;
  local_date: string | null;
  created_at: string;
  sleep_quality: number | string | null;
  sleep_latency_choice: string | null;
  wake_ups_choice: string | null;
  wake_recovery_choice?: string | null;
  primary_trigger?: string | null;
  mind_tags?: string[] | null;
  environment_tags?: string[] | null;
  bed_tags?: string[] | null;
  body_tags?: string[] | null;
  primary_driver?: string | null;
  secondary_driver?: string | null;
  protocol_used_name?: string | null;
  protocol_followed?: string | null;
};


function parseLatency(choice: string | null): number | null {
  if (!choice) return null;
  const n = parseInt(choice.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function parseWakeUps(choice: string | null): number | null {
  if (!choice) return null;
  const n = parseInt(choice.replace(/[^0-9]/g, ""), 10);
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

function textFromArray(value?: string[] | null) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function mapNight(row: SleepNightRow): RRSMMetricsNight & {
  wakeRecoveryMin?: number | null;
  primaryTrigger?: string | null;
  protocolFollowed?: "yes" | "partial" | "no" | "none" | null;
} {
  const drivers = [
    row.primary_driver,
    row.secondary_driver,
    textFromArray(row.mind_tags),
    textFromArray(row.environment_tags),
    textFromArray(row.bed_tags),
    textFromArray(row.body_tags),
  ]
    .filter(Boolean)
    .join(", ");

  const protocolFollowed =
    row.protocol_followed === "yes" ||
    row.protocol_followed === "partial" ||
    row.protocol_followed === "no" ||
    row.protocol_followed === "none"
      ? row.protocol_followed
      : null;

  return {
    dateKey: row.local_date ?? row.created_at?.slice(0, 10),
    quality: row.sleep_quality == null ? null : Number(row.sleep_quality),
    latencyMin: parseLatency(row.sleep_latency_choice),
    wakeUps: parseWakeUps(row.wake_ups_choice),
    wakeRecoveryMin: parseWakeRecovery(row.wake_recovery_choice),
    primaryTrigger: row.primary_trigger ?? null,
    primaryDriver: drivers || row.primary_driver || "(no driver logged)",
    secondaryDriver: row.secondary_driver ?? null,
    protocolFollowed,
  };
}

function prettyCategory(category: string) {
  switch (category) {
    case "mind_emotional":
      return "Mind / emotional activation";
    case "body_physiology":
      return "Body / physiology activation";
    case "environment":
      return "Room temperature / environment disruption";
    case "sleep_hygiene":
      return "Personal sleep-hygiene disruption";
    case "circadian_context":
      return "Timing / life-context limitation";
    default:
      return "No clear sleep issue";
  }
}


function prettyWakeCause(cause: string) {
  switch (cause) {
    case "thermal_bed":
      return "Bed / bedding thermal disruption";
    case "room_environment":
      return "Room environment";
    case "body_discomfort":
      return "Body discomfort / physiology";
    case "mental_reactivation":
      return "Mental reactivation";
    case "emotional_activation":
      return "Emotional activation";
    case "sleep_hygiene":
      return "Sleep hygiene / habits";
    case "circadian_timing":
      return "Timing / life-context";
    default:
      return "Unknown / still learning";
  }
}


function prettyThermalSystem(state: string) {
  switch (state) {
    case "heat_load":
      return "Heat load";
    case "cold_exposure":
      return "Cold exposure";
    case "thermal_oscillation":
      return "Hot/cold oscillation";
    case "mixed_or_unclear":
      return "Mixed or unclear";
    default:
      return "No strong thermal signal";
  }
}

function evaluationText(value: RRSMProtocolResult["protocolEvaluation"]) {
  switch (value) {
    case "case_a_working":
      return "Case A: the protocol appears to be helping.";
    case "case_b_hidden_factor":
      return "Case B: protocol was followed but sleep did not improve; another factor may be present.";
    case "case_c_not_followed":
      return "Case C: protocol was not fully followed, so effectiveness cannot be judged yet.";
    default:
      return "Not enough data yet to judge whether the protocol worked.";
  }
}


function DimensionBox({
  label,
  score,
  status,
}: {
  label: string;
  score: number;
  status: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="text-sm font-bold text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-extrabold text-gray-900">{score}/100</div>
      <div className="mt-1 text-sm font-semibold text-gray-700">{status}</div>
    </div>
  );
}

function statusFor(score: number, good: string, mid: string, low: string) {
  if (score >= 75) return good;
  if (score >= 50) return mid;
  return low;
}

function simpleStatus(score: number, good: string, mid: string, low: string) {
  if (score >= 75) return good;
  if (score >= 50) return mid;
  return low;
}

function getStabilityHeadline(result: RRSMProtocolResult) {
  const d = result.sleepDimensions;
  if (!d) return result.sleepIssueDetected ? "Sleep issue detected" : "No strong sleep issue detected";

  const recovery = simpleStatus(d.sleepRecovery, "Good recovery", "Mixed recovery", "Low recovery");
  const stability = simpleStatus(d.sleepStability, "stable night", "mixed night", "unstable night");

  return `${recovery}, ${stability}`;
}

function getStabilitySentence(result: RRSMProtocolResult) {
  const d = result.sleepDimensions;
  if (!d) return result.userSummary ?? result.protocolReason;

  const recovery = simpleStatus(d.sleepRecovery, "good", "mixed", "low");
  const nightStability = simpleStatus(d.sleepStability, "stable", "mixed", "unstable");
  const wakeMaintenance = simpleStatus(d.wakeMaintenance, "stable", "disrupted", "strongly disrupted");
  const thermal = simpleStatus(d.thermalStability, "stable", "mixed", "unstable");
  const onset = simpleStatus(d.sleepOnset, "settled", "delayed", "strongly delayed");

  return `Your recovery looks ${recovery}, but the night pattern was ${nightStability}. Wake maintenance was ${wakeMaintenance}, thermal stability was ${thermal}, and sleep onset was ${onset}.`;
}

export default function ProtocolsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RRSMProtocolResult | null>(null);
  const [nightCount, setNightCount] = useState(0);
  const [accuracyFeedback, setAccuracyFeedback] = useState<"yes" | "no" | null>(null);
  const [missingDetail, setMissingDetail] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadRecommendation() {
      setLoading(true);
      setError(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        if (!cancelled) {
          setError(authErr?.message ?? "Not signed in.");
          setLoading(false);
        }
        return;
      }

      const { data, error: rowsErr } = await supabase
        .from("sleep_nights")
        .select("id,local_date,created_at,sleep_quality,sleep_latency_choice,wake_ups_choice,wake_recovery_choice,primary_trigger,mind_tags,environment_tags,bed_tags,body_tags,primary_driver,secondary_driver,protocol_used_name,protocol_followed")
        .eq("user_id", authData.user.id)
        .order("local_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(14);

      if (rowsErr) {
        if (!cancelled) {
          setError(rowsErr.message);
          setLoading(false);
        }
        return;
      }

      const mapped = [...(data ?? [])]
        .reverse()
        .map((row) => mapNight(row as SleepNightRow));
      const protocolResult = runRRSMEngineV4(mapped);

      if (!cancelled) {
        setNightCount(mapped.length);
        setResult(protocolResult);
        setAccuracyFeedback(null);
        setMissingDetail("");
        setLoading(false);
      }
    }

    loadRecommendation();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const protocol: SleepFixProtocol | null = useMemo(() => {
    if (!result) return null;
    return getStandardProtocolByTitle(result.recommendedProtocol);
  }, [result]);

  const escalatedProtocol: SleepFixProtocol | null = useMemo(() => {
    if (!result || result.protocolEvaluation !== "case_b_hidden_factor") return null;
    return getEscalatedProtocolForTitle(result.recommendedProtocol);
  }, [result]);

  const displayProtocol = escalatedProtocol ?? protocol;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">Tonight&apos;s Protocol</h1>
      <p className="mt-2 text-base text-gray-600">
        SleepFix analyses your recent sleep patterns to recommend the best protocol for tonight.
      </p>

      {loading ? (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
          Loading your protocol recommendation...
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      ) : null}

      {!loading && !error && nightCount < 1 ? (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-blue-900">No sleep record yet</h2>
          <p className="mt-2 text-gray-700">
            Save at least one night in the Sleep page so SleepFix can recommend a protocol.
          </p>
        </div>
      ) : null}

      {result && nightCount > 0 && displayProtocol ? (
        <>
          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-bold uppercase tracking-wide text-gray-500">SleepFix summary</div>
            <h2 className="mt-2 text-2xl font-bold text-blue-900">
              {getStabilityHeadline(result)}
            </h2>

            <div className="mt-4 rounded-xl bg-blue-50 p-4 text-base text-blue-900">
              {getStabilitySentence(result)}
            </div>

            {result.sleepDimensions ? (
              <div className="mt-4">
                <div className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
                  Sleep stability breakdown
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <DimensionBox
                    label="Recovery"
                    score={result.sleepDimensions.sleepRecovery}
                    status={statusFor(result.sleepDimensions.sleepRecovery, "Good", "Mixed", "Low")}
                  />

                  <DimensionBox
                    label="Night stability"
                    score={result.sleepDimensions.sleepStability}
                    status={statusFor(result.sleepDimensions.sleepStability, "Stable", "Mixed", "Unstable")}
                  />

                  <DimensionBox
                    label="Wake maintenance"
                    score={result.sleepDimensions.wakeMaintenance}
                    status={statusFor(result.sleepDimensions.wakeMaintenance, "Stable", "Disrupted", "Strongly disrupted")}
                  />

                  <DimensionBox
                    label="Thermal stability"
                    score={result.sleepDimensions.thermalStability}
                    status={statusFor(result.sleepDimensions.thermalStability, "Stable", "Mixed", "Unstable")}
                  />

                  <DimensionBox
                    label="Sleep onset"
                    score={result.sleepDimensions.sleepOnset}
                    status={statusFor(result.sleepDimensions.sleepOnset, "Settled", "Delayed", "Strongly delayed")}
                  />

                  <DimensionBox
                    label="Environment stress"
                    score={result.sleepDimensions.environmentStress}
                    status={statusFor(100 - result.sleepDimensions.environmentStress, "Low", "Moderate", "High")}
                  />
                </div>
              </div>
            ) : null}

            {result.wakeCauseSummary ? (
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <div className="text-sm font-bold uppercase tracking-wide text-indigo-700">
                  Why you may have woken up
                </div>

                <div className="mt-2 text-lg font-extrabold text-indigo-950">
                  {prettyWakeCause(result.wakeCause)}
                </div>

                <div className="mt-2 text-sm text-indigo-950">
                  {result.wakeCauseSummary}
                </div>

                <div className="mt-3 text-sm font-semibold text-indigo-900">
                  Confidence: {result.wakeCauseConfidence === "high"
                    ? "High"
                    : result.wakeCauseConfidence === "moderate"
                    ? "Moderate"
                    : "Low"}
                </div>
              </div>
            ) : null}

            {result.thermalSystemSummary ? (
              <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 p-4">
                <div className="text-sm font-bold uppercase tracking-wide text-orange-700">
                  Thermal sleep system
                </div>

                <div className="mt-2 text-lg font-extrabold text-orange-950">
                  {prettyThermalSystem(result.thermalSystemState)}
                </div>

                <div className="mt-2 text-sm text-orange-950">
                  {result.thermalSystemSummary}
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-bold text-gray-500">Plain-English read</div>
              <div className="mt-1 text-base font-semibold text-gray-900">
                SleepFix is separating how recovered you feel from how stable the night was.
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-sm font-bold text-gray-500">Main pattern</div>
                <div className="mt-1 font-semibold text-gray-900">{prettyCategory(result.dominantCategory)}</div>
              </div>

              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-sm font-bold text-gray-500">Pattern strength</div>
                <div className="mt-1 font-semibold text-gray-900">
                  {result.protocolConfidence === "low"
                    ? "Early pattern"
                    : result.protocolConfidence === "moderate"
                    ? "Pattern forming"
                    : "Strong pattern"}
                </div>
              </div>
            </div>

            {result.sleepIssueDetected && result.secondaryFactors.length > 0 ? (
              <div className="mt-4 rounded-xl border border-gray-200 p-3 text-sm text-gray-700">
                <div className="font-bold text-gray-900">Other factors to watch</div>
                <div className="mt-1">{result.secondaryFactors.map(prettyCategory).join(", ")}</div>
              </div>
            ) : null}
          </section>

          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-gray-900">Is this accurate?</h3>
            <p className="mt-2 text-gray-700">
              SleepFix needs your confirmation before treating this as the best explanation.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setAccuracyFeedback("yes")}
                className={`rounded-xl border px-4 py-3 font-bold ${
                  accuracyFeedback === "yes"
                    ? "border-blue-700 bg-blue-50 text-blue-900"
                    : "border-gray-200 bg-white text-gray-900"
                }`}
              >
                Yes, this matches
              </button>

              <button
                type="button"
                onClick={() => setAccuracyFeedback("no")}
                className={`rounded-xl border px-4 py-3 font-bold ${
                  accuracyFeedback === "no"
                    ? "border-amber-700 bg-amber-50 text-amber-900"
                    : "border-gray-200 bg-white text-gray-900"
                }`}
              >
                No, something is missing
              </button>
            </div>

            {accuracyFeedback === "no" ? (
              <div className="mt-4">
                <label className="text-sm font-bold text-gray-700">
                  What did SleepFix miss?
                </label>
                <textarea
                  value={missingDetail}
                  onChange={(e) => setMissingDetail(e.target.value)}
                  placeholder="Example: the bed felt hot, hard mattress, partner heat, noise, cold feet, bathroom wake-up..."
                  className="mt-2 min-h-[90px] w-full rounded-xl border border-gray-300 p-3 text-base"
                />
                <p className="mt-2 text-sm text-gray-600">
                  For now, this is shown only on this page. Later we can save this to an admin feedback table.
                </p>
              </div>
            ) : null}
          </section>

          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-bold uppercase tracking-wide text-gray-500">Recommended protocol</div>
            <h2 className="mt-2 text-2xl font-bold text-blue-900">{displayProtocol.title}</h2>

            {escalatedProtocol ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-bold">Deeper protocol</div>
                <div className="mt-1">
                  SleepFix is showing the deeper version because the issue appears to be recurring or unresolved.
                </div>
              </div>
            ) : null}

            <p className="mt-2 text-base text-gray-700">{displayProtocol.bestFor}</p>

            <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
              <div className="font-bold">Why this protocol?</div>
              <div className="mt-1">{result.protocolReason}</div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 p-3 text-sm text-gray-700">
              <div className="font-bold text-gray-900">Related RRSM system</div>
              <div className="mt-1">{displayProtocol.related}</div>
            </div>
          </section>

          {accuracyFeedback !== "no" ? (
            <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900">What to do tonight</h3>
              <p className="mt-2 text-gray-700">{displayProtocol.focus}</p>

              <ol className="mt-4 list-decimal space-y-3 pl-6 text-base text-gray-800">
                {displayProtocol.steps.map((s, idx) => (
                  <li key={idx} className="leading-relaxed">{s}</li>
                ))}
              </ol>

              {displayProtocol.doNot?.length ? (
                <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                  <div className="font-bold text-gray-900">Do not</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {displayProtocol.doNot.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {displayProtocol.diaryPrompt ? (
                <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                  <div className="font-bold text-gray-900">Diary follow-up</div>
                  <div className="mt-1">{displayProtocol.diaryPrompt}</div>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <h3 className="text-xl font-bold text-amber-900">Protocol paused</h3>
              <p className="mt-2 text-amber-900">
                Because you said the summary is missing something, do not treat this recommendation as final. Record the missing factor in the Diary, then check the next recommendation after another saved night.
              </p>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
