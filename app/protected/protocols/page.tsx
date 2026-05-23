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

export default function ProtocolsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RRSMProtocolResult | null>(null);
  const [nightCount, setNightCount] = useState(0);

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
            <div className="text-sm font-bold uppercase tracking-wide text-gray-500">Recommended protocol</div>
            <h2 className="mt-2 text-2xl font-bold text-blue-900">{displayProtocol.title}</h2>
            {escalatedProtocol ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-bold">Escalated protocol</div>
                <div className="mt-1">
                  The standard protocol was followed but the sleep issue remained. SleepFix is showing the deeper version tonight.
                </div>
              </div>
            ) : null}
            <p className="mt-2 text-base text-gray-700">{displayProtocol.bestFor}</p>

            <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
              <div className="font-bold">Why this protocol?</div>
              <div className="mt-1">{result.protocolReason}</div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-sm font-bold text-gray-500">Sleep issue?</div>
                <div className="mt-1 font-semibold text-gray-900">{result.sleepIssueDetected ? "Sleep issue detected" : "No clear sleep issue"}</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-sm font-bold text-gray-500">Recurring?</div>
                <div className="mt-1 font-semibold text-gray-900">{result.recurringIssue ? "Recurring pattern" : "Still monitoring"}</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-sm font-bold text-gray-500">Main factor</div>
                <div className="mt-1 font-semibold text-gray-900">{prettyCategory(result.dominantCategory)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-sm font-bold text-gray-500">Confidence</div>
                <div className="mt-1 font-semibold capitalize text-gray-900">
  {result.protocolConfidence === "low"
    ? "Early pattern"
    : result.protocolConfidence === "moderate"
    ? "Pattern forming"
    : "Strong pattern"}
</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 p-3 text-sm text-gray-700">
              <div className="font-bold text-gray-900">Related RRSM system</div>
              <div className="mt-1">{displayProtocol.related}</div>
            </div>

            {result.sleepIssueDetected && result.secondaryFactors.length > 0 ? (
              <div className="mt-4 rounded-xl border border-gray-200 p-3 text-sm text-gray-700">
                <div className="font-bold text-gray-900">Secondary factors to watch</div>
                <div className="mt-1">{result.secondaryFactors.map(prettyCategory).join(", ")}</div>
              </div>
            ) : null}
          </section>

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

            {displayProtocol.escalationNote ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="font-bold">Escalation note</div>
                <div className="mt-1">{displayProtocol.escalationNote}</div>
              </div>
            ) : null}

            {displayProtocol.diaryPrompt ? (
              <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                <div className="font-bold text-gray-900">Diary follow-up</div>
                <div className="mt-1">{displayProtocol.diaryPrompt}</div>
              </div>
            ) : null}
          </section>

          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900">Protocol review</h3>
          {!result.sleepIssueDetected ? (
  <>
    <div className="mt-3 font-semibold text-gray-900">
      No protocol review needed
    </div>

    <p className="mt-2 text-gray-700">
      There was no clear sleep issue in the latest sleep record, so SleepFix is not evaluating protocol effectiveness tonight.
    </p>
  </>
) : (
  <>
    <div className="mt-3 font-semibold text-gray-900">
      {result.protocolEvaluationLabel}
    </div>

    <p className="mt-2 text-gray-700">
      {result.protocolEvaluationReason}
    </p>
  </>
)}

            <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
              <div className="font-bold text-gray-900">How to read this</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li><strong>Case A:</strong> protocol followed and sleep improved.</li>
                <li><strong>Case B:</strong> protocol followed but sleep did not improve, so another factor may be present.</li>
                <li><strong>Case C:</strong> protocol was not followed, partially followed, or not recorded, so effectiveness cannot be judged.</li>
              </ul>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
