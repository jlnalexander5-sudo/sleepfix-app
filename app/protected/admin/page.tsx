"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const ADMIN_EMAIL = "jlnalexander5@gmail.com";

type SleepNightAdminRow = {
  id: string;
  user_id: string;
  created_at: string;
  local_date: string | null;
  sleep_quality: number | string | null;
  sleep_latency_choice: string | null;
  wake_ups_choice: string | null;
  wake_recovery_choice: string | null;
};

type InvestigationRow = {
  id: string;
  user_id: string;
  factor_name: string;
  factor_classification: string | null;
  investigation_area: string | null;
  status: string;
  threshold_amount_degree: string | null;
  threshold_time_local: string | null;
  completed_at: string | null;
  created_at: string;
};

type CandidateNoteRow = {
  id: string;
  user_id: string;
  note_date: string;
  factor_name: string;
  effect_observed: string;
  note_text: string | null;
  created_at: string;
};

type EngineFeedbackRow = {
  id: string;
  user_id: string;
  local_date: string | null;
  engine_category: string | null;
  engine_protocol: string | null;
  user_agreed: boolean | null;
  missing_reason: string | null;
  created_at: string;
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateKey(row: SleepNightAdminRow) {
  return row.local_date ?? row.created_at.slice(0, 10);
}

function shortUser(userId: string) {
  return userId ? `User ${userId.slice(0, 8)}` : "Unknown user";
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-").map(Number);

  if (year && month && day) {
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return raw;
}

function prettyArea(value: string | null | undefined) {
  switch (value) {
    case "bedroom_bed":
      return "Bedroom / bed environment";
    case "house":
      return "House";
    case "food_drink":
      return "Food / drink";
    case "physical_activity":
      return "Physical activity";
    case "environment":
      return "Environment";
    case "other":
      return "Other";
    default:
      return value ? value.replaceAll("_", " ") : "—";
  }
}

function prettyEffect(value: string) {
  if (value === "no_noticeable_effect") return "No noticeable effect";
  if (value === "possible_effect") return "Possible effect";
  return "Not sure yet";
}

function formatThreshold(row: InvestigationRow) {
  const bits = [
    row.threshold_amount_degree,
    row.threshold_time_local ? row.threshold_time_local.slice(0, 5) : null,
  ].filter(Boolean);

  return bits.length ? bits.join(" · ") : "Threshold recorded";
}

function OverviewCard({
  title,
  value,
  note,
}: {
  title: string;
  value: React.ReactNode;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-bold uppercase tracking-wide text-gray-600">{title}</div>
      <div className="mt-2 text-3xl font-extrabold text-gray-900">{value}</div>
      <div className="mt-2 text-sm leading-relaxed text-gray-600">{note}</div>
    </div>
  );
}

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nights, setNights] = useState<SleepNightAdminRow[]>([]);
  const [investigations, setInvestigations] = useState<InvestigationRow[]>([]);
  const [candidateNotes, setCandidateNotes] = useState<CandidateNoteRow[]>([]);
  const [feedback, setFeedback] = useState<EngineFeedbackRow[]>([]);
  const [optionalWarning, setOptionalWarning] = useState<string | null>(null);
  const [dateWindow, setDateWindow] = useState<{ today: string; weekStart: string } | null>(null);

  useEffect(() => {
    const now = new Date();
    const weekStartDate = new Date(now);
    weekStartDate.setDate(weekStartDate.getDate() - 6);

    setDateWindow({
      today: ymd(now),
      weekStart: ymd(weekStartDate),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAdmin() {
      setLoading(true);
      setError(null);
      setOptionalWarning(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const email = authData?.user?.email ?? "";

      if (authErr || email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        if (!cancelled) {
          setAccessDenied(true);
          setLoading(false);
        }
        return;
      }

      const [nightRes, investigationRes, candidateRes, feedbackRes] = await Promise.all([
        supabase
          .from("sleep_nights")
          .select(
            "id,user_id,created_at,local_date,sleep_quality,sleep_latency_choice,wake_ups_choice,wake_recovery_choice",
          )
          .order("local_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(500),

        supabase
          .from("sleep_investigations")
          .select(
            "id,user_id,factor_name,factor_classification,investigation_area,status,threshold_amount_degree,threshold_time_local,completed_at,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(500),

        supabase
          .from("sleep_investigation_candidate_notes")
          .select("id,user_id,note_date,factor_name,effect_observed,note_text,created_at")
          .order("note_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(100),

        supabase
          .from("sleep_engine_feedback")
          .select(
            "id,user_id,local_date,engine_category,engine_protocol,user_agreed,missing_reason,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      if (cancelled) return;

      if (nightRes.error) {
        setError(nightRes.error.message);
        setLoading(false);
        return;
      }

      if (investigationRes.error) {
        setError(investigationRes.error.message);
        setLoading(false);
        return;
      }

      setNights((nightRes.data ?? []) as unknown as SleepNightAdminRow[]);
      setInvestigations((investigationRes.data ?? []) as unknown as InvestigationRow[]);

      if (candidateRes.error) {
        setCandidateNotes([]);
        setOptionalWarning("Possible-factor notes could not be loaded.");
      } else {
        setCandidateNotes((candidateRes.data ?? []) as unknown as CandidateNoteRow[]);
      }

      if (feedbackRes.error) {
        setFeedback([]);
        setOptionalWarning((current) =>
          current
            ? `${current} Protocol feedback could not be loaded.`
            : "Protocol feedback could not be loaded.",
        );
      } else {
        setFeedback((feedbackRes.data ?? []) as unknown as EngineFeedbackRow[]);
      }

      setLoading(false);
    }

    loadAdmin();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const summary = useMemo(() => {
    const weekStart = dateWindow?.weekStart ?? "";
    const today = dateWindow?.today ?? "";

    const userIds = new Set<string>();
    nights.forEach((row) => userIds.add(row.user_id));
    investigations.forEach((row) => userIds.add(row.user_id));
    candidateNotes.forEach((row) => userIds.add(row.user_id));
    feedback.forEach((row) => userIds.add(row.user_id));

    const activeUsersThisWeek = new Set(
      weekStart && today
        ? nights
            .filter((row) => {
              const key = dateKey(row);
              return key >= weekStart && key <= today;
            })
            .map((row) => row.user_id)
        : [],
    );

    const activeInvestigations = investigations.filter((row) => row.status === "active");
    const completedInvestigations = investigations.filter((row) => row.status === "completed");
    const mismatches = feedback.filter((row) => row.user_agreed === false);
    const matches = feedback.filter((row) => row.user_agreed === true);

    return {
      users: userIds.size,
      activeUsersThisWeek: activeUsersThisWeek.size,
      activeInvestigations,
      completedInvestigations,
      mismatches,
      matches,
    };
  }, [nights, investigations, candidateNotes, feedback, dateWindow]);

  if (loading || !dateWindow) {
    return <div className="mx-auto max-w-6xl p-7">Loading admin...</div>;
  }

  if (accessDenied) {
    return (
      <div className="mx-auto max-w-4xl p-7">
        <h1 className="text-3xl font-extrabold text-blue-900">Admin</h1>
        <p className="mt-3 text-gray-700">Access denied.</p>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">Admin</h1>
      <p className="mt-2 max-w-4xl text-gray-700">
        A practical overview of what people are doing in SleepFix, what they are investigating,
        and where the interpretation engine may be missing something.
      </p>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-gray-900">
          {error}
        </div>
      ) : null}

      {optionalWarning ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-gray-900">
          {optionalWarning}
        </div>
      ) : null}

      {/* Simple overview */}
      <section className="mt-7 rounded-2xl border border-blue-200 bg-blue-50/40 p-6 shadow-sm">
        <h2 className="text-2xl font-extrabold text-gray-900">At a glance</h2>
        <p className="mt-1 text-gray-700">
          Just the numbers that are useful for running the app.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OverviewCard
            title="Users"
            value={summary.users}
            note="People who have generated activity in the app."
          />
          <OverviewCard
            title="Active this week"
            value={summary.activeUsersThisWeek}
            note="Users who recorded at least one sleep night in the last 7 days."
          />
          <OverviewCard
            title="Investigating now"
            value={summary.activeInvestigations.length}
            note="Formal investigations currently underway."
          />
          <OverviewCard
            title="Findings recorded"
            value={summary.completedInvestigations.length}
            note="Completed investigations with a recorded result."
          />
        </div>
      </section>

      {/* What needs attention */}
      <section className="mt-7 rounded-2xl border border-amber-200 bg-amber-50/50 p-6 shadow-sm">
        <h2 className="text-2xl font-extrabold text-gray-900">What needs attention?</h2>
        <p className="mt-1 text-gray-700">
          The most useful admin information is where SleepFix may have misunderstood the user.
        </p>

        {summary.mismatches.length ? (
          <div className="mt-5 grid gap-3">
            {summary.mismatches.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-xl border border-amber-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="font-bold text-gray-900">{shortUser(item.user_id)}</div>
                  <div className="text-sm text-gray-600">
                    {fmtDate(item.local_date ?? item.created_at)}
                  </div>
                </div>

                <div className="mt-2 text-sm text-gray-600">
                  SleepFix focus: {item.engine_category ?? "Unknown"}
                  {item.engine_protocol ? ` · ${item.engine_protocol.replace(/^RRSM\b/, "RSM")}` : ""}
                </div>

                <div className="mt-3 rounded-lg bg-gray-50 p-3 text-gray-900">
                  <strong>User said something was missing:</strong>{" "}
                  {item.missing_reason?.trim() || "No explanation was entered."}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-amber-300 bg-white p-5 text-gray-700">
            No engine-mismatch notes yet.
          </div>
        )}
      </section>

      {/* Current investigations */}
      <section className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm">
        <h2 className="text-2xl font-extrabold text-gray-900">Current investigations</h2>
        <p className="mt-1 text-gray-700">
          What users are actively trying to understand right now.
        </p>

        {summary.activeInvestigations.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {summary.activeInvestigations.slice(0, 12).map((item) => (
              <div key={item.id} className="rounded-xl border border-emerald-200 bg-white p-4">
                <div className="font-extrabold text-gray-900">{item.factor_name}</div>
                <div className="mt-1 text-sm text-gray-600">
                  {shortUser(item.user_id)} · {prettyArea(item.investigation_area)}
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  Started {fmtDate(item.created_at)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-emerald-300 bg-white p-5 text-gray-700">
            No active investigations at the moment.
          </div>
        )}
      </section>

      {/* Completed findings */}
      <section className="mt-7 rounded-2xl border border-violet-200 bg-violet-50/40 p-6 shadow-sm">
        <h2 className="text-2xl font-extrabold text-gray-900">Recent findings</h2>
        <p className="mt-1 text-gray-700">
          Completed investigations and the thresholds users decided were useful.
        </p>

        {summary.completedInvestigations.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {summary.completedInvestigations.slice(0, 12).map((item) => (
              <div key={item.id} className="rounded-xl border border-violet-200 bg-white p-4">
                <div className="font-extrabold text-gray-900">{item.factor_name}</div>
                <div className="mt-1 text-sm text-gray-600">{shortUser(item.user_id)}</div>
                <div className="mt-3">
                  <span className="text-sm font-bold text-gray-600">Recorded threshold: </span>
                  <span className="font-bold text-gray-900">{formatThreshold(item)}</span>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  Completed {fmtDate(item.completed_at ?? item.created_at)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-violet-300 bg-white p-5 text-gray-700">
            No completed investigation findings yet.
          </div>
        )}
      </section>

      {/* Possible factors */}
      <section className="mt-7 rounded-2xl border border-sky-200 bg-sky-50/40 p-6 shadow-sm">
        <h2 className="text-2xl font-extrabold text-gray-900">Possible factors users are noticing</h2>
        <p className="mt-1 text-gray-700">
          Useful for seeing what people are considering before they decide whether a formal investigation is needed.
        </p>

        {candidateNotes.length ? (
          <div className="mt-5 grid gap-3">
            {candidateNotes.slice(0, 10).map((item) => (
              <div key={item.id} className="rounded-xl border border-sky-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-extrabold text-gray-900">{item.factor_name}</div>
                    <div className="mt-1 text-sm text-gray-600">
                      {shortUser(item.user_id)} · {fmtDate(item.note_date)}
                    </div>
                  </div>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-semibold text-gray-900">
                    {prettyEffect(item.effect_observed)}
                  </span>
                </div>

                {item.note_text ? (
                  <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm leading-relaxed text-gray-800">
                    {item.note_text}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-sky-300 bg-white p-5 text-gray-700">
            No possible-factor notes yet.
          </div>
        )}
      </section>

      {/* Protocol feedback */}
      <section className="mt-7 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-extrabold text-gray-900">Protocol feedback</h2>
        <p className="mt-1 text-gray-700">
          A simple check of whether users thought SleepFix was focusing on the right thing.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <OverviewCard
            title="Matched"
            value={summary.matches.length}
            note='Users who chose "Yes, this matches".'
          />
          <OverviewCard
            title="Something missing"
            value={summary.mismatches.length}
            note='Users who chose "No, something is missing".'
          />
        </div>
      </section>

      {/* Recent sleep activity - collapsed */}
      <details className="mt-7 rounded-2xl border border-gray-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-6">
          <span className="text-xl font-extrabold text-gray-900">Recent sleep activity</span>
          <span className="ml-3 text-sm text-gray-600">Optional reference</span>
        </summary>

        <div className="border-t border-gray-200 p-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-3 text-sm text-gray-600">Date</th>
                  <th className="p-3 text-sm text-gray-600">User</th>
                  <th className="p-3 text-sm text-gray-600">Quality</th>
                  <th className="p-3 text-sm text-gray-600">Latency</th>
                  <th className="p-3 text-sm text-gray-600">Wake-ups</th>
                  <th className="p-3 text-sm text-gray-600">Awake after waking</th>
                </tr>
              </thead>
              <tbody>
                {nights.slice(0, 25).map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="p-3">{fmtDate(dateKey(row))}</td>
                    <td className="p-3">{shortUser(row.user_id)}</td>
                    <td className="p-3">{row.sleep_quality ?? "—"}</td>
                    <td className="p-3">
                      {row.sleep_latency_choice ? `${row.sleep_latency_choice} min` : "—"}
                    </td>
                    <td className="p-3">{row.wake_ups_choice ?? "—"}</td>
                    <td className="p-3">
                      {row.wake_recovery_choice ? `${row.wake_recovery_choice} min` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <div className="mt-7 text-sm text-gray-600">
        Admin access is restricted to <strong>{ADMIN_EMAIL}</strong>.
      </div>
    </main>
  );
}
