'use client';

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { runRRSMEngineV4, type RRSMProtocolResult } from "@/lib/rrsm/engine-v4";
import type { RRSMMetricsNight } from "@/lib/rrsm/engine-v2";

type Protocol = {
  id: string;
  title: string;
  related: string;
  bestFor: string;
  focus: string;
  steps: string[];
  doNot?: string[];
};

type SleepNightRow = {
  id: string;
  local_date: string | null;
  created_at: string;
  sleep_quality: number | string | null;
  sleep_latency_choice: string | null;
  wake_ups_choice: string | null;
  mind_tags?: string[] | null;
  environment_tags?: string[] | null;
  body_tags?: string[] | null;
  primary_driver?: string | null;
  secondary_driver?: string | null;
  protocol_used_name?: string | null;
  protocol_followed?: string | null;
};

const PROTOCOLS: Protocol[] = [
  {
    id: "rrsm-quieting",
    title: "RRSM Quieting Protocol",
    related: "RB2 / RB3 — mind and emotional activation",
    bestFor: "Best for: racing thoughts, emotional replay, worry, anxiety, overstimulation, or a mind that will not switch off.",
    focus: "Reduce mental and emotional activation so the system can enter sleep without fighting itself.",
    steps: [
      "Do a 2-minute brain dump: write down tomorrow’s tasks, worries, or unresolved thoughts.",
      "Close the loop with one sentence: ‘This is recorded. I do not need to solve it now.’",
      "Use slow exhale breathing for 10 cycles: inhale gently, then exhale longer than the inhale.",
      "If thoughts restart, do not argue with them. Return to the breath and repeat the same phrase.",
    ],
    doNot: [
      "Do not problem-solve in bed.",
      "Do not check messages, news, or work tasks once the protocol starts.",
    ],
  },
  {
    id: "rrsm-body-recovery",
    title: "RRSM Body Recovery Protocol",
    related: "RB1 — body physiology, pain, inflammation, DOMS, tension",
    bestFor: "Best for: DOMS, soreness, inflammation, pain, restless body, illness, or physical discomfort affecting sleep.",
    focus: "Reduce body activation so physical discomfort does not keep pulling the system back toward waking.",
    steps: [
      "Use gentle positioning support: pillow under knees, side support, or whichever position reduces strain.",
      "Apply mild recovery support: light compression, warm/cool comfort, or gentle stretch only if it settles the body.",
      "Keep the room and bedding neutral. Avoid overheating the body.",
      "Use relaxed breathing while scanning jaw, shoulders, abdomen, hips, and legs for tension release.",
    ],
    doNot: [
      "Do not stretch aggressively before bed if the body is already inflamed or sore.",
      "Do not use this protocol as a substitute for medical advice if pain is severe, new, or worsening.",
    ],
  },
  {
    id: "rrsm-body-downshift",
    title: "RRSM Body Downshift Protocol",
    related: "RB1 — body tension and physical activation",
    bestFor: "Best for: tense, restless, or activated body without a clear DOMS/pain pattern.",
    focus: "Bring the body down gradually without forcing sleep.",
    steps: [
      "Dim the room and reduce stimulation for 20–30 minutes.",
      "Do a slow body scan: jaw → neck → shoulders → chest → belly → hips → legs.",
      "For each area, exhale slowly, not forcefully.",
      "Stay still once the body becomes heavier. Let sleep come without checking for it.",
    ],
  },
  {
    id: "sleep-environment-reset",
    title: "Sleep Environment Reset Protocol",
    related: "External sleep field — room and environmental interference",
    bestFor: "Best for: heat, cold, humidity, light, noise, mosquitoes, bedding discomfort, or repeated room disturbance.",
    focus: "Remove obvious external interference before trying deeper protocols.",
    steps: [
      "Fix the strongest room problem first: temperature, noise, light, bedding, or insects.",
      "Prepare the room before bedtime, not after you are already frustrated or awake.",
      "Keep one stable setup for 2–3 nights so the app can compare the result.",
      "If the environment cannot be fixed, use the diary to record exactly what disturbed the night.",
    ],
    doNot: [
      "Do not keep changing several room variables at once if you are trying to learn what helps.",
    ],
  },
  {
    id: "rrsm-shutdown-ritual",
    title: "RRSM Shutdown Ritual",
    related: "Personal sleep hygiene — behaviour and shutdown timing",
    bestFor: "Best for: late caffeine, nicotine, alcohol, screens, late food, late exercise, or stimulation too close to bed.",
    focus: "Create a repeatable shutdown window so the body is not asked to sleep while still activated.",
    steps: [
      "Choose one target tonight, not five. Pick the most obvious disruptor from your sleep form.",
      "Create a 60-minute shutdown window before bed: dim light, reduce scrolling, reduce food/fluid load, and avoid stimulating tasks.",
      "Replace the habit with a low-effort alternative: shower, quiet reading, gentle breathing, or preparing tomorrow’s tasks.",
      "If you slip, do not reset the whole plan. Just restart the shutdown window the next night.",
    ],
    doNot: [
      "Do not treat this as punishment. It is a test to see whether your sleep stabilises.",
      "Do not change everything at once. One consistent change gives cleaner feedback.",
    ],
  },
  {
    id: "rrsm-rhythm-support",
    title: "RRSM Rhythm Support Protocol",
    related: "Context limitation — shift work, jet lag, irregular schedule, pregnancy, chronic illness",
    bestFor: "Best for: timing constraints that the app cannot fully control, such as shift work, jet lag, irregular work hours, pregnancy, or chronic illness.",
    focus: "Improve transition quality and recovery stability while recognising real physiological limits.",
    steps: [
      "Anchor the most stable part of the day: wake time, first light exposure, first meal, or pre-sleep routine.",
      "Protect a short shutdown window even if bedtime changes.",
      "Use the diary to record schedule constraints so SleepFix does not misread them as simple behaviour problems.",
      "Aim for improvement, not perfection. The goal is less disruption, not miracle sleep under impossible conditions.",
    ],
  },
  {
    id: "no-protocol-needed",
    title: "No protocol needed tonight",
    related: "Stable sleep signal",
    bestFor: "Best for: nights where the latest sleep record does not show a clear sleep issue.",
    focus: "Keep the current routine stable and continue logging.",
    steps: [
      "Do not add unnecessary interventions tonight.",
      "Repeat the routine that appears to be working.",
      "Keep logging sleep so SleepFix can detect if the pattern changes.",
    ],
  },
];

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

function textFromArray(value?: string[] | null) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function mapNight(row: SleepNightRow): RRSMMetricsNight & { protocolFollowed?: "yes" | "partial" | "no" | "none" | null } {
  const drivers = [
    row.primary_driver,
    row.secondary_driver,
    textFromArray(row.mind_tags),
    textFromArray(row.environment_tags),
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
    primaryDriver: drivers || row.primary_driver || "(no driver logged)",
    secondaryDriver: row.secondary_driver ?? null,
    protocolFollowed,
  };
}

function protocolIdFromTitle(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("quieting")) return "rrsm-quieting";
  if (lower.includes("body recovery")) return "rrsm-body-recovery";
  if (lower.includes("body downshift")) return "rrsm-body-downshift";
  if (lower.includes("environment")) return "sleep-environment-reset";
  if (lower.includes("shutdown")) return "rrsm-shutdown-ritual";
  if (lower.includes("rhythm")) return "rrsm-rhythm-support";
  if (lower.includes("no protocol")) return "no-protocol-needed";
  return "rrsm-quieting";
}

function prettyCategory(category: string) {
  switch (category) {
    case "mind_emotional":
      return "Mind / emotional activation";
    case "body_physiology":
      return "Body / physiology activation";
    case "environment":
      return "Room / environment disruption";
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
        .select("id,local_date,created_at,sleep_quality,sleep_latency_choice,wake_ups_choice,mind_tags,environment_tags,body_tags,primary_driver,secondary_driver,protocol_used_name,protocol_followed")
        .eq("user_id", authData.user.id)
        .order("local_date", { ascending: true })
        .limit(14);

      if (rowsErr) {
        if (!cancelled) {
          setError(rowsErr.message);
          setLoading(false);
        }
        return;
      }

      const mapped = (data ?? []).map((row) => mapNight(row as SleepNightRow));
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

  const protocol = useMemo(() => {
    if (!result) return PROTOCOLS[0];
    const id = protocolIdFromTitle(result.recommendedProtocol);
    return PROTOCOLS.find((p) => p.id === id) ?? PROTOCOLS[0];
  }, [result]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">Tonight&apos;s Protocol</h1>
      <p className="mt-2 text-base text-gray-600">
        SleepFix uses your recent sleep records to recommend the protocol most likely to match tonight&apos;s sleep issue.
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

      {result && nightCount > 0 ? (
        <>
          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-bold uppercase tracking-wide text-gray-500">Recommended protocol</div>
            <h2 className="mt-2 text-2xl font-bold text-blue-900">{protocol.title}</h2>
            <p className="mt-2 text-base text-gray-700">{protocol.bestFor}</p>

            <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
              <div className="font-bold">Why this protocol?</div>
              <div className="mt-1">{result.protocolReason}</div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-sm font-bold text-gray-500">Sleep issue?</div>
                <div className="mt-1 font-semibold text-gray-900">{result.sleepIssueDetected ? "Yes" : "No clear issue"}</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-sm font-bold text-gray-500">Recurring?</div>
                <div className="mt-1 font-semibold text-gray-900">{result.recurringIssue ? "Yes" : "Not yet"}</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-sm font-bold text-gray-500">Main factor</div>
                <div className="mt-1 font-semibold text-gray-900">{prettyCategory(result.dominantCategory)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-sm font-bold text-gray-500">Confidence</div>
                <div className="mt-1 font-semibold capitalize text-gray-900">{result.protocolConfidence}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 p-3 text-sm text-gray-700">
              <div className="font-bold text-gray-900">Related RRSM system</div>
              <div className="mt-1">{protocol.related}</div>
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
            <p className="mt-2 text-gray-700">{protocol.focus}</p>

            <ol className="mt-4 list-decimal space-y-3 pl-6 text-base text-gray-800">
              {protocol.steps.map((s, idx) => (
                <li key={idx} className="leading-relaxed">{s}</li>
              ))}
            </ol>

            {protocol.doNot?.length ? (
              <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                <div className="font-bold text-gray-900">Do not</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {protocol.doNot.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
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
