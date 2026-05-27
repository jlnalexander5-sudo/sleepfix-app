'use client';

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { runRRSMEngineV4, type RRSMProtocolResult } from "@/lib/rrsm/engine-v4";
import type { RRSMMetricsNight } from "@/lib/rrsm/engine-v2";
import {
  getStandardProtocolByTitle,
  getEscalatedProtocolForTitle,
  type SleepFixProtocol,
} from "@/lib/protocols";

type SleepNightRow = {
  id: string;
  local_date: string | null;
  created_at: string;
  sleep_quality: number | string | null;
  sleep_latency_choice: string | null;
  wake_ups_choice: string | null;
  wake_recovery_choice?: string | null;
  duration_min?: number | null;
  sleep_start?: string | null;
  sleep_end?: string | null;
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

function parseNumberChoice(choice: string | null): number | null {
  if (!choice) return null;
  const n = parseInt(choice.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function deriveDurationMin(row: SleepNightRow): number | null {
  if (typeof row.duration_min === "number" && Number.isFinite(row.duration_min)) {
    return row.duration_min;
  }

  if (row.sleep_start && row.sleep_end) {
    const start = new Date(row.sleep_start).getTime();
    const end = new Date(row.sleep_end).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.round((end - start) / 60000);
    }
  }

  return null;
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
  durationMin?: number | null;
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
    latencyMin: parseNumberChoice(row.sleep_latency_choice),
    wakeUps: parseNumberChoice(row.wake_ups_choice),
    durationMin: deriveDurationMin(row),
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
      return "Room / bed environment disruption";
    case "sleep_hygiene":
      return "Sleep-rhythm habit disruption";
    case "circadian_context":
      return "Timing / life-context limitation";
    default:
      return "No clear sleep issue";
  }
}

function cleanReason(result: RRSMProtocolResult) {
  return (
    result.protocolReason ||
    result.userSummary ||
    "SleepFix selected this protocol from your recent sleep pattern."
  );
}

export default function ProtocolsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RRSMProtocolResult | null>(null);
  const [nightCount, setNightCount] = useState(0);
  const [latestNightRow, setLatestNightRow] = useState<SleepNightRow | null>(null);
  const [accuracyFeedback, setAccuracyFeedback] = useState<"yes" | "no" | null>(null);
  const [missingDetail, setMissingDetail] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

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
        .select(
          "id,local_date,created_at,sleep_start,sleep_end,duration_min,sleep_quality,sleep_latency_choice,wake_ups_choice,wake_recovery_choice,primary_trigger,mind_tags,environment_tags,bed_tags,body_tags,primary_driver,secondary_driver,protocol_used_name,protocol_followed",
        )
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

      const rows = (data ?? []) as SleepNightRow[];
      const latestRow = rows[0] ?? null;
      const mapped = [...rows].reverse().map((row) => mapNight(row));
      const protocolResult = runRRSMEngineV4(mapped);

      if (!cancelled) {
        setNightCount(mapped.length);
        setLatestNightRow(latestRow);
        setResult(protocolResult);
        setAccuracyFeedback(null);
        setMissingDetail("");
        setFeedbackMessage(null);
        setFeedbackError(null);
        setLoading(false);
      }
    }

    loadRecommendation();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function saveEngineFeedback(userAgreed: boolean, missingReasonOverride?: string) {
    if (!result) return;

    setFeedbackSaving(true);
    setFeedbackError(null);
    setFeedbackMessage(null);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      setFeedbackError(authErr?.message ?? "Not signed in.");
      setFeedbackSaving(false);
      return;
    }

    const missingReason =
      typeof missingReasonOverride === "string"
        ? missingReasonOverride.trim()
        : missingDetail.trim();

    const { error: insertErr } = await supabase.from("sleep_engine_feedback").insert({
      user_id: authData.user.id,
      sleep_night_id: latestNightRow?.id ?? null,
      local_date: latestNightRow?.local_date ?? null,
      engine_category: result.dominantCategory,
      engine_protocol: result.recommendedProtocol,
      user_agreed: userAgreed,
      missing_reason: userAgreed ? null : missingReason || null,
    });

    if (insertErr) {
      setFeedbackError(insertErr.message);
    } else {
      setFeedbackMessage(
        userAgreed
          ? "Feedback saved: this matched."
          : "Feedback saved: missing factor recorded.",
      );
    }

    setFeedbackSaving(false);
  }

  const standardProtocol: SleepFixProtocol | null = useMemo(() => {
    if (!result) return null;
    return getStandardProtocolByTitle(result.recommendedProtocol);
  }, [result]);

  const escalatedProtocol: SleepFixProtocol | null = useMemo(() => {
    if (!result || result.protocolEvaluation !== "case_b_hidden_factor") return null;
    return getEscalatedProtocolForTitle(result.recommendedProtocol);
  }, [result]);

  const displayProtocol = escalatedProtocol ?? standardProtocol;
  const protocolPaused = accuracyFeedback === "no";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">Tonight&apos;s Protocol</h1>
      <p className="mt-2 text-base text-gray-600">
        One focused action for tonight. Detailed scores and trends live in Results.
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
            <div className="text-sm font-bold uppercase tracking-wide text-gray-500">
              Focus for tonight
            </div>

            <h2 className="mt-2 text-2xl font-extrabold text-blue-900">
              {displayProtocol.title}
            </h2>

            {escalatedProtocol ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-bold">Deeper protocol</div>
                <div className="mt-1">
                  SleepFix is showing the deeper version because the issue appears recurring or unresolved.
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-blue-950">
              <div className="text-sm font-bold uppercase tracking-wide text-blue-700">
                Pattern being addressed
              </div>
              <div className="mt-1 text-lg font-extrabold">
                {prettyCategory(result.dominantCategory)}
              </div>
              <div className="mt-2 text-sm leading-relaxed">
                {cleanReason(result)}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-bold uppercase tracking-wide text-gray-500">
                Best for
              </div>
              <p className="mt-1 text-gray-800">{displayProtocol.bestFor}</p>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-gray-900">Is this the right focus?</h3>
            <p className="mt-2 text-gray-700">
              Confirm this so SleepFix can keep improving the interpretation engine.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setAccuracyFeedback("yes");
                  setMissingDetail("");
                  saveEngineFeedback(true, "");
                }}
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
                onClick={() => {
                  setAccuracyFeedback("no");
                  setFeedbackMessage(null);
                  setFeedbackError(null);
                }}
                className={`rounded-xl border px-4 py-3 font-bold ${
                  accuracyFeedback === "no"
                    ? "border-amber-700 bg-amber-50 text-amber-900"
                    : "border-gray-200 bg-white text-gray-900"
                }`}
              >
                No, something is missing
              </button>
            </div>

            {accuracyFeedback === "yes" && feedbackMessage ? (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 font-bold text-green-700">
                {feedbackMessage}
              </div>
            ) : null}

            {feedbackError && accuracyFeedback === "yes" ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">
                {feedbackError}
              </div>
            ) : null}

            {accuracyFeedback === "no" ? (
              <div className="mt-4">
                <label className="text-sm font-bold text-gray-700">
                  What did SleepFix miss?
                </label>
                <textarea
                  value={missingDetail}
                  onChange={(e) => setMissingDetail(e.target.value)}
                  placeholder="Example: bed felt hot, cold feet, hard mattress, partner heat, noise, bathroom wake-up..."
                  className="mt-2 min-h-[90px] w-full rounded-xl border border-gray-300 p-3 text-base"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => saveEngineFeedback(false)}
                    disabled={feedbackSaving || missingDetail.trim().length < 3}
                    className="rounded-xl bg-amber-700 px-4 py-3 font-bold text-white disabled:opacity-50"
                  >
                    {feedbackSaving ? "Saving feedback..." : "Save missing factor"}
                  </button>

                  {feedbackMessage ? (
                    <span className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
                      {feedbackMessage}
                    </span>
                  ) : null}

                  {feedbackError ? (
                    <span className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                      {feedbackError}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          {!protocolPaused ? (
            <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900">What to do tonight</h3>
              <p className="mt-2 text-gray-700">{displayProtocol.focus}</p>

              <ol className="mt-4 list-decimal space-y-3 pl-6 text-base text-gray-800">
                {displayProtocol.steps.map((step, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {step}
                  </li>
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
                Because you said the focus is missing something, do not treat this protocol as final. Save the missing factor, then check the next recommendation after another sleep entry.
              </p>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
