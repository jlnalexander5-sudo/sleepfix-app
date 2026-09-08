"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type NightRow = {
  night_id: string;
  created_at: string;
  local_date: string | null;
  duration_min: number | null;
  latency_min: number | null;
  wakeups_count: number | null;
  wake_recovery_min: number | null;
  estimated_sleep_min: number | null;
  quality_num: number | null;
};

type InvestigationRow = {
  id: string;
  factor_name: string;
  factor_classification: "main" | "secondary" | string | null;
  investigation_area: string | null;
  status: "active" | "completed" | string;
  threshold_amount_degree: string | null;
  threshold_time_local: string | null;
  threshold_sleep_onset_minutes: number | null;
  threshold_sleep_quality: number | null;
  threshold_timezone: string | null;
  threshold_utc_offset_minutes: number | null;
  threshold_is_dst: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
};

function parseChoiceToNumber(choice: string | number | null | undefined): number | null {
  if (typeof choice === "number" && Number.isFinite(choice)) return choice;
  if (!choice) return null;
  const n = parseInt(String(choice).replace("+", ""), 10);
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

function deriveDurationMin(row: any): number | null {
  if (typeof row.duration_min === "number" && Number.isFinite(row.duration_min)) return row.duration_min;

  if (row.sleep_start && row.sleep_end) {
    const start = new Date(row.sleep_start).getTime();
    const end = new Date(row.sleep_end).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.round((end - start) / 60000);
    }
  }

  return null;
}

function calculateEstimatedSleep(
  duration: number | null,
  latency: number | null,
  wakeRecovery: number | null,
) {
  if (typeof duration !== "number") return null;
  return Math.max(0, duration - (latency ?? 0) - (wakeRecovery ?? 0));
}

function formatHours(min: number | null | undefined) {
  if (typeof min !== "number" || !Number.isFinite(min)) return "—";
  return `${Math.round((min / 60) * 10) / 10}h`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const raw = String(iso).slice(0, 10);
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

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const [hRaw, mRaw] = value.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;

  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
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

function prettyClassification(value: string | null | undefined) {
  if (value === "main") return "Main contributing factor";
  if (value === "secondary") return "Secondary contributing factor";
  return value || "Contributing factor";
}

function getStartingHypothesis(profile: Record<string, any> | null) {
  if (!profile) return "";

  // The Profile field was added after the original rrsm_profiles schema.
  // select("*") lets this Results page tolerate the exact deployed column name.
  const candidates = [
    "suspected_factors",
    "sleep_suspicions",
    "user_suspicions",
    "starting_hypothesis",
    "own_view",
    "user_view",
    "what_affects_sleep",
    "suspected_sleep_factors",
  ];

  for (const key of candidates) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function thresholdSummary(row: InvestigationRow) {
  const parts = [
    row.threshold_amount_degree,
    row.threshold_time_local ? formatTime(row.threshold_time_local) : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : "Threshold saved";
}

export default function ResultsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [nights, setNights] = useState<NightRow[]>([]);
  const [investigations, setInvestigations] = useState<InvestigationRow[]>([]);
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [supportingOpen, setSupportingOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      setLoading(true);
      setErr(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;

      if (cancelled) return;

      if (authErr || !uid) {
        setUserId(null);
        setErr(authErr?.message ?? null);
        setLoading(false);
        return;
      }

      setUserId(uid);

      const [nightRes, investigationRes, profileRes] = await Promise.all([
        supabase
          .from("sleep_nights")
          .select(
            [
              "id",
              "created_at",
              "local_date",
              "sleep_quality",
              "sleep_latency_choice",
              "wake_ups_choice",
              "wake_recovery_choice",
              "duration_min",
              "sleep_start",
              "sleep_end",
            ].join(","),
          )
          .eq("user_id", uid)
          .order("local_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(15),

        supabase
          .from("sleep_investigations")
          .select(
            [
              "id",
              "factor_name",
              "factor_classification",
              "investigation_area",
              "status",
              "threshold_amount_degree",
              "threshold_time_local",
              "threshold_sleep_onset_minutes",
              "threshold_sleep_quality",
              "threshold_timezone",
              "threshold_utc_offset_minutes",
              "threshold_is_dst",
              "created_at",
              "updated_at",
              "completed_at",
            ].join(","),
          )
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),

        supabase
          .from("rrsm_profiles")
          .select("*")
          .eq("user_id", uid)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (nightRes.error) {
        setErr(nightRes.error.message);
        setLoading(false);
        return;
      }

      if (investigationRes.error) {
        setErr(investigationRes.error.message);
        setLoading(false);
        return;
      }

      const mappedNights: NightRow[] = (nightRes.data ?? []).map((row: any) => {
        const quality = parseChoiceToNumber(row.sleep_quality);
        const latency = parseChoiceToNumber(row.sleep_latency_choice);
        const wakeups = parseChoiceToNumber(row.wake_ups_choice);
        const wakeRecovery = parseWakeRecovery(row.wake_recovery_choice);
        const duration = deriveDurationMin(row);

        return {
          night_id: row.id,
          created_at: row.created_at,
          local_date: row.local_date ?? null,
          duration_min: duration,
          latency_min: latency,
          wakeups_count: wakeups,
          wake_recovery_min: wakeRecovery,
          estimated_sleep_min: calculateEstimatedSleep(duration, latency, wakeRecovery),
          quality_num: quality,
        };
      });

      setNights(mappedNights);
      setInvestigations((investigationRes.data ?? []) as InvestigationRow[]);
      setProfile(profileRes.error ? null : ((profileRes.data ?? null) as Record<string, any> | null));
      setLoading(false);
    }

    loadResults();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const completed = useMemo(
    () => investigations.filter((item) => item.status === "completed"),
    [investigations],
  );

  const active = useMemo(
    () => investigations.find((item) => item.status === "active") ?? null,
    [investigations],
  );

  const startingHypothesis = useMemo(() => getStartingHypothesis(profile), [profile]);

  const latestNight = nights[0] ?? null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">Results</h1>
      <p className="mt-2 max-w-4xl text-base leading-relaxed text-gray-700">
        This page brings together what your Investigation has actually shown, what you originally suspected,
        and what is most useful to focus on next. Sleep data remains available as supporting information rather
        than being the result itself.
      </p>

      {loading ? (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 text-gray-700">
          Loading your results...
        </div>
      ) : err ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-gray-900">
          {err}
        </div>
      ) : !userId ? (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          Please sign in.
        </div>
      ) : (
        <div className="mt-7 grid gap-7">
          {/* 1. Main payoff */}
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/45 p-6 shadow-sm">
            <div className="text-sm font-bold uppercase tracking-wide text-gray-900">
              What SleepFix has identified
            </div>
            <h2 className="mt-2 text-2xl font-extrabold text-gray-900">
              Your current sleep findings
            </h2>
            <p className="mt-2 max-w-4xl text-gray-700">
              These are completed investigations where you decided that a useful threshold or disruptive point
              had been identified.
            </p>

            {completed.length ? (
              <div className="mt-5 grid gap-4">
                {completed.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-emerald-200 bg-white p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-extrabold text-gray-900">{item.factor_name}</h3>
                        <div className="mt-1 text-sm text-gray-600">
                          {prettyClassification(item.factor_classification)} · {prettyArea(item.investigation_area)}
                        </div>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-bold text-gray-900">
                        Finding recorded
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-gray-200 p-4">
                        <div className="text-sm font-bold text-gray-600">Indicated threshold</div>
                        <div className="mt-1 text-lg font-extrabold text-gray-900">
                          {thresholdSummary(item)}
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 p-4">
                        <div className="text-sm font-bold text-gray-600">Sleep onset at threshold</div>
                        <div className="mt-1 text-lg font-extrabold text-gray-900">
                          {item.threshold_sleep_onset_minutes == null
                            ? "—"
                            : `${item.threshold_sleep_onset_minutes} min`}
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 p-4">
                        <div className="text-sm font-bold text-gray-600">After-sleep quality</div>
                        <div className="mt-1 text-lg font-extrabold text-gray-900">
                          {item.threshold_sleep_quality == null
                            ? "—"
                            : `${item.threshold_sleep_quality} / 10`}
                        </div>
                      </div>
                    </div>

                    {item.threshold_is_dst !== null ? (
                      <div className="mt-3 text-sm text-gray-600">
                        Time context: {item.threshold_is_dst ? "Daylight saving time" : "Standard time"}
                        {item.threshold_timezone ? ` · ${item.threshold_timezone}` : ""}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-emerald-300 bg-white p-5 text-gray-700">
                <strong>No completed factor finding yet.</strong>
                <div className="mt-1">
                  Results will build here as you complete investigations and record the thresholds that matter to you.
                </div>
              </div>
            )}
          </section>

          {/* 2. Investigation map */}
          <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-6 shadow-sm">
            <div className="text-sm font-bold uppercase tracking-wide text-gray-900">
              Your investigation map
            </div>
            <h2 className="mt-2 text-2xl font-extrabold text-gray-900">
              What is established, and what is still being tested?
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-blue-200 bg-white p-5">
                <div className="text-lg font-extrabold text-gray-900">Completed findings</div>
                {completed.length ? (
                  <div className="mt-3 grid gap-3">
                    {completed.map((item) => (
                      <div key={item.id} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                        <div className="font-bold text-gray-900">{item.factor_name}</div>
                        <div className="mt-1 text-sm text-gray-600">
                          {thresholdSummary(item)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-gray-600">None completed yet.</p>
                )}
              </div>

              <div className="rounded-xl border border-blue-200 bg-white p-5">
                <div className="text-lg font-extrabold text-gray-900">Currently investigating</div>
                {active ? (
                  <>
                    <div className="mt-3 text-xl font-extrabold text-gray-900">{active.factor_name}</div>
                    <div className="mt-1 text-sm text-gray-600">
                      {prettyClassification(active.factor_classification)} · {prettyArea(active.investigation_area)}
                    </div>
                    <Link
                      href="/protected/habits"
                      className="mt-4 inline-block rounded-xl border border-gray-300 bg-white px-4 py-2 font-bold text-gray-900 no-underline"
                    >
                      Continue investigation →
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-gray-600">No active investigation at the moment.</p>
                    <Link
                      href="/protected/habits"
                      className="mt-4 inline-block rounded-xl border border-gray-300 bg-white px-4 py-2 font-bold text-gray-900 no-underline"
                    >
                      Start an investigation →
                    </Link>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* 3. Hypothesis vs findings */}
          <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-6 shadow-sm">
            <div className="text-sm font-bold uppercase tracking-wide text-gray-900">
              Your view compared with your findings
            </div>
            <h2 className="mt-2 text-2xl font-extrabold text-gray-900">
              What you suspected vs what Investigation has shown
            </h2>
            <p className="mt-2 max-w-4xl text-gray-700">
              Your starting view remains separate from the investigation findings. A suspicion is not turned into
              a cause simply because you entered it in Profile.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-violet-200 bg-white p-5">
                <div className="text-lg font-extrabold text-gray-900">What you originally suspected</div>
                {startingHypothesis ? (
                  <p className="mt-3 whitespace-pre-wrap leading-relaxed text-gray-800">
                    {startingHypothesis}
                  </p>
                ) : (
                  <div className="mt-3 text-gray-600">
                    No starting hypothesis is available here yet.
                    <div className="mt-3">
                      <Link href="/protected/profile" className="font-bold text-blue-900">
                        Review your Profile →
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-violet-200 bg-white p-5">
                <div className="text-lg font-extrabold text-gray-900">What Investigation has shown</div>
                {completed.length ? (
                  <div className="mt-3 grid gap-3">
                    {completed.map((item) => (
                      <div key={item.id}>
                        <div className="font-bold text-gray-900">{item.factor_name}</div>
                        <div className="text-sm text-gray-600">
                          Recorded threshold: {thresholdSummary(item)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-gray-600">
                    No completed investigation yet, so SleepFix does not convert your suspicions into findings.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* 4. Next focus */}
          <section className="rounded-2xl border border-amber-200 bg-amber-50/55 p-6 shadow-sm">
            <div className="text-sm font-bold uppercase tracking-wide text-gray-900">
              What to focus on next
            </div>

            {active ? (
              <>
                <h2 className="mt-2 text-2xl font-extrabold text-gray-900">
                  Continue: {active.factor_name}
                </h2>
                <p className="mt-2 max-w-4xl text-gray-700">
                  This is your active investigation. Keep this factor isolated where practical and continue recording
                  its amount, degree, timing and the sleep response until you decide the investigation has reached a
                  useful conclusion.
                </p>
                <Link
                  href="/protected/habits"
                  className="mt-5 inline-block rounded-xl bg-black px-5 py-3 font-bold text-white no-underline"
                >
                  Continue investigation
                </Link>
              </>
            ) : completed.length ? (
              <>
                <h2 className="mt-2 text-2xl font-extrabold text-gray-900">
                  Decide whether another factor needs testing
                </h2>
                <p className="mt-2 max-w-4xl text-gray-700">
                  You already have at least one completed finding. If another possible factor keeps appearing, move it
                  into Investigation and test it separately. Otherwise, use what you have learned rather than collecting
                  more data for its own sake.
                </p>
                <Link
                  href="/protected/habits"
                  className="mt-5 inline-block rounded-xl bg-black px-5 py-3 font-bold text-white no-underline"
                >
                  Review Investigation
                </Link>
              </>
            ) : (
              <>
                <h2 className="mt-2 text-2xl font-extrabold text-gray-900">
                  Begin with one possible contributing factor
                </h2>
                <p className="mt-2 max-w-4xl text-gray-700">
                  There is not yet a completed factor finding. Start with the most relevant main factor, beginning with
                  the bedroom or bed environment where appropriate, and investigate one factor at a time.
                </p>
                <Link
                  href="/protected/habits"
                  className="mt-5 inline-block rounded-xl bg-black px-5 py-3 font-bold text-white no-underline"
                >
                  Go to Investigation
                </Link>
              </>
            )}
          </section>

          {/* Supporting data, deliberately demoted */}
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setSupportingOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-4 p-5 text-left"
            >
              <div>
                <div className="text-lg font-extrabold text-gray-900">Supporting sleep data</div>
                <div className="mt-1 text-sm text-gray-600">
                  Optional reference only — these numbers support the investigation; they are not the result itself.
                </div>
              </div>
              <span className="text-xl text-gray-700">{supportingOpen ? "▲" : "▼"}</span>
            </button>

            {supportingOpen ? (
              <div className="border-t border-gray-200 p-5">
                {latestNight ? (
                  <>
                    <div className="text-sm font-bold text-gray-600">
                      Latest recorded night · {fmtDate(latestNight.local_date ?? latestNight.created_at)}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-gray-200 p-4">
                        <div className="text-sm text-gray-600">Sleep quality</div>
                        <div className="mt-1 text-xl font-extrabold text-gray-900">
                          {latestNight.quality_num == null ? "—" : `${latestNight.quality_num} / 10`}
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-200 p-4">
                        <div className="text-sm text-gray-600">Time to fall asleep</div>
                        <div className="mt-1 text-xl font-extrabold text-gray-900">
                          {latestNight.latency_min == null ? "—" : `${latestNight.latency_min} min`}
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-200 p-4">
                        <div className="text-sm text-gray-600">Wake-ups</div>
                        <div className="mt-1 text-xl font-extrabold text-gray-900">
                          {latestNight.wakeups_count ?? "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-200 p-4">
                        <div className="text-sm text-gray-600">Time awake after waking</div>
                        <div className="mt-1 text-xl font-extrabold text-gray-900">
                          {latestNight.wake_recovery_min == null ? "—" : `${latestNight.wake_recovery_min} min`}
                        </div>
                      </div>
                    </div>

                    <details className="mt-5 rounded-xl border border-gray-200">
                      <summary className="cursor-pointer p-4 font-bold text-gray-900">
                        Recent sleep records
                      </summary>
                      <div className="overflow-x-auto border-t border-gray-200">
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="p-3 text-sm text-gray-600">Date</th>
                              <th className="p-3 text-sm text-gray-600">Quality</th>
                              <th className="p-3 text-sm text-gray-600">Latency</th>
                              <th className="p-3 text-sm text-gray-600">Wake-ups</th>
                              <th className="p-3 text-sm text-gray-600">Wake recovery</th>
                              <th className="p-3 text-sm text-gray-600">Est. sleep</th>
                            </tr>
                          </thead>
                          <tbody>
                            {nights.map((row) => (
                              <tr key={row.night_id} className="border-t border-gray-100">
                                <td className="p-3">{fmtDate(row.local_date ?? row.created_at)}</td>
                                <td className="p-3">{row.quality_num ?? "—"}</td>
                                <td className="p-3">
                                  {row.latency_min == null ? "—" : `${row.latency_min}m`}
                                </td>
                                <td className="p-3">{row.wakeups_count ?? "—"}</td>
                                <td className="p-3">
                                  {row.wake_recovery_min == null ? "—" : `${row.wake_recovery_min}m`}
                                </td>
                                <td className="p-3">{formatHours(row.estimated_sleep_min)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </>
                ) : (
                  <div className="text-gray-600">
                    No sleep records yet.{" "}
                    <Link href="/protected/sleep" className="font-bold text-blue-900">
                      Record your first night →
                    </Link>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}
