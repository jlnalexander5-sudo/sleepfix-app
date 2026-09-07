"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type UserProgress = {
  name: string;
  email: string;
  hasProfile: boolean;
  sleepCount: number;
  sleepLoggedToday: boolean;
  todayYMD: string;
  latestSleepDate: string | null;
  activeInvestigationId: string | null;
  activeInvestigationName: string | null;
  completedInvestigationCount: number;
};

type FlowItem = {
  step: string;
  title: string;
  href: string;
  detail: string;
};

const FLOW: FlowItem[] = [
  {
    step: "1",
    title: "Profile",
    href: "/protected/profile",
    detail:
      "Set your usual sleep context so SleepFix can distinguish your normal conditions from possible disturbances.",
  },
  {
    step: "2",
    title: "Sleep",
    href: "/protected/sleep",
    detail:
      "Record what happened during the night: sleep onset, quality, wake-ups, recovery, and anything that appeared disruptive.",
  },
  {
    step: "3",
    title: "Investigation",
    href: "/protected/habits",
    detail:
      "Investigate one possible contributing factor at a time and map the amount, degree, timing, or exposure at which your sleep changes.",
  },
  {
    step: "4",
    title: "Protocol",
    href: "/protected/protocols",
    detail:
      "Use one focused action based on what SleepFix currently understands about the disruption you are dealing with.",
  },
  {
    step: "5",
    title: "Results",
    href: "/protected/results",
    detail:
      "See what you have learned about your sleep: contributing factors, threshold findings, and the current explanation of your pattern.",
  },
];

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatYMD(ymd: string | null) {
  if (!ymd) return "No sleep entry yet";
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function firstNameFromUser(email: string, metadata: any) {
  const raw =
    metadata?.full_name ??
    metadata?.name ??
    metadata?.first_name ??
    email?.split("@")[0] ??
    "there";

  const first = String(raw).trim().split(/\s+/)[0];
  if (!first) return "there";

  return first.charAt(0).toUpperCase() + first.slice(1);
}

type FlowState = "done" | "current" | "ready" | "available";

function flowState(
  progress: UserProgress | null,
  item: FlowItem,
): FlowState {
  if (!progress) {
    return item.title === "Profile" ? "current" : "available";
  }

  if (item.title === "Profile") {
    return progress.hasProfile ? "done" : "current";
  }

  if (item.title === "Sleep") {
    if (!progress.hasProfile) return "available";
    return progress.sleepLoggedToday ? "done" : "current";
  }

  if (item.title === "Investigation") {
    if (progress.activeInvestigationId) return "current";
    if (progress.sleepCount > 0) return "ready";
    return "available";
  }

  if (item.title === "Protocol") {
    return progress.sleepCount > 0 ? "ready" : "available";
  }

  if (item.title === "Results") {
    return progress.completedInvestigationCount > 0 ? "ready" : "available";
  }

  return "available";
}

function nextAction(progress: UserProgress | null) {
  if (!progress) return FLOW[0];

  if (!progress.hasProfile) return FLOW[0];

  if (!progress.sleepLoggedToday) return FLOW[1];

  if (progress.activeInvestigationId) return FLOW[2];

  if (progress.completedInvestigationCount === 0) return FLOW[2];

  return FLOW[3];
}

function nextActionText(progress: UserProgress | null) {
  if (!progress) return "Loading your current SleepFix path...";

  if (!progress.hasProfile) {
    return "Start with your usual sleep context.";
  }

  if (!progress.sleepLoggedToday) {
    return "Next: record your latest completed night.";
  }

  if (progress.activeInvestigationId) {
    return `Continue your investigation of ${progress.activeInvestigationName ?? "the current factor"}.`;
  }

  if (progress.completedInvestigationCount === 0) {
    return "Your sleep record is saved. Next, begin investigating the factor that appears most relevant.";
  }

  return "Your core record is up to date. Review the current protocol or continue investigating another factor.";
}

export default function OnboardingPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const todayYMD = toYMD(new Date());
      const { data: authData, error: authErr } =
        await supabase.auth.getUser();

      const user = authData?.user ?? null;

      if (authErr || !user) {
        if (!cancelled) {
          setError(authErr?.message ?? "Not signed in.");
          setLoading(false);
        }
        return;
      }

      const [
        profileRes,
        sleepCountRes,
        todaySleepRes,
        latestSleepRes,
        activeInvestigationRes,
        completedInvestigationCountRes,
      ] = await Promise.all([
        supabase
          .from("rrsm_profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase
          .from("sleep_nights")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),

        supabase
          .from("sleep_nights")
          .select("id")
          .eq("user_id", user.id)
          .eq("local_date", todayYMD)
          .limit(1)
          .maybeSingle(),

        supabase
          .from("sleep_nights")
          .select("local_date,created_at")
          .eq("user_id", user.id)
          .order("local_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabase
          .from("sleep_investigations")
          .select("id,factor_name")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),

        supabase
          .from("sleep_investigations")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "completed"),
      ]);

      if (!cancelled) {
        setProgress({
          name: firstNameFromUser(
            user.email ?? "",
            user.user_metadata,
          ),
          email: user.email ?? "",
          hasProfile: Boolean(profileRes.data?.user_id),
          sleepCount: sleepCountRes.count ?? 0,
          sleepLoggedToday: Boolean(todaySleepRes.data?.id),
          todayYMD,
          latestSleepDate:
            latestSleepRes.data?.local_date ??
            (latestSleepRes.data?.created_at
              ? String(latestSleepRes.data.created_at).slice(0, 10)
              : null),
          activeInvestigationId:
            activeInvestigationRes.data?.id ?? null,
          activeInvestigationName:
            activeInvestigationRes.data?.factor_name ?? null,
          completedInvestigationCount:
            completedInvestigationCountRes.count ?? 0,
        });

        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const action = nextAction(progress);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section
        style={{
          border: "1px solid #c9d2ff",
          background:
            "linear-gradient(135deg, #eef3ff 0%, #ffffff 70%)",
          borderRadius: 24,
          padding: 28,
          boxShadow: "0 12px 35px rgba(20, 30, 90, 0.08)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 900,
            color: "#2636b8",
            textTransform: "uppercase",
            letterSpacing: 0.8,
          }}
        >
          Start page
        </div>

        <h1
          style={{
            marginTop: 8,
            fontSize: 38,
            lineHeight: 1.1,
            fontWeight: 950,
            color: "#08105c",
          }}
        >
          {progress
            ? `Welcome, ${progress.name}`
            : "Welcome to SleepFixMe"}
        </h1>

        <p
          style={{
            marginTop: 12,
            maxWidth: 800,
            color: "#374151",
            fontSize: 18,
          }}
        >
          SleepFixMe is designed to help you understand{" "}
          <strong>why your sleep is being disrupted</strong>. It does
          not treat every factor that is present as a cause, and it
          does not make you collect metrics for their own sake. The
          aim is to identify the disturbances that actually matter to
          you, investigate your tolerance to them, and build a clearer
          explanation of your sleep over time.
        </p>

        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              border: "1px solid #dbe2ff",
              background: "white",
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: "#4f46e5",
                textTransform: "uppercase",
              }}
            >
              Why it is different
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 18,
                fontWeight: 950,
                color: "#111827",
              }}
            >
              Explanation-first, not metric-first
            </div>

            <p style={{ marginTop: 6, color: "#4b5563" }}>
              Sleep scores can describe what happened. SleepFixMe is
              built to help you work out what appears to be disrupting
              your sleep and why.
            </p>
          </div>

          <div
            style={{
              border: "1px solid #dbe2ff",
              background: "white",
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: "#4f46e5",
                textTransform: "uppercase",
              }}
            >
              Investigation
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 18,
                fontWeight: 950,
                color: "#111827",
              }}
            >
              One factor at a time
            </div>

            <p style={{ marginTop: 6, color: "#4b5563" }}>
              A factor can be present without being disruptive. Test
              one possible disturbance at a time so you can compare
              what happens when its amount, degree, timing, or
              exposure changes.
            </p>
          </div>

          <div
            style={{
              border: "1px solid #dbe2ff",
              background: "white",
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: "#4f46e5",
                textTransform: "uppercase",
              }}
            >
              Personal relevance
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 18,
                fontWeight: 950,
                color: "#111827",
              }}
            >
              Your tolerance, your pattern
            </div>

            <p style={{ marginTop: 6, color: "#4b5563" }}>
              SleepFixMe helps you build a personal map of the
              disturbances that matter, the range you appear able to
              tolerate, and what changes when that tolerance is
              exceeded.
            </p>
          </div>
        </div>

        {loading ? (
          <div
            style={{
              marginTop: 20,
              color: "#555",
              fontWeight: 700,
            }}
          >
            Loading your current SleepFix path...
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              marginTop: 20,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              borderRadius: 14,
              padding: 14,
              fontWeight: 800,
            }}
          >
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            <div
              style={{
                marginTop: 24,
                border: "1px solid #dbe2ff",
                background: "white",
                borderRadius: 18,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 900,
                      color: "#6b7280",
                      textTransform: "uppercase",
                    }}
                  >
                    Your current SleepFix path
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      color: "#111827",
                      fontSize: 20,
                      fontWeight: 900,
                    }}
                  >
                    {nextActionText(progress)}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      color: "#6b7280",
                      fontSize: 14,
                    }}
                  >
                    Today:{" "}
                    {formatYMD(progress?.todayYMD ?? null)} · Latest
                    sleep record:{" "}
                    {formatYMD(progress?.latestSleepDate ?? null)}
                  </div>
                </div>

                <Link
                  href={action.href}
                  style={{
                    alignSelf: "center",
                    display: "inline-block",
                    background: "#000080",
                    color: "white",
                    textDecoration: "none",
                    padding: "12px 18px",
                    borderRadius: 12,
                    fontWeight: 900,
                  }}
                >
                  Continue: {action.title}
                </Link>
              </div>
            </div>

            <div
              style={{
                marginTop: 24,
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              {FLOW.map((item, index) => {
                const state = flowState(progress, item);
                const complete = state === "done";
                const current = state === "current";
                const ready = state === "ready";

                let detail = item.detail;

                if (
                  item.title === "Investigation" &&
                  progress?.activeInvestigationName
                ) {
                  detail = `Current investigation: ${progress.activeInvestigationName}. Continue building the record until you are satisfied with the threshold you have identified.`;
                }

                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    style={{
                      color: "inherit",
                      textDecoration: "none",
                      border: complete
                        ? "2px solid #16a34a"
                        : current
                          ? "2px solid #4f46e5"
                          : ready
                            ? "2px solid #f59e0b"
                            : "1px solid #d1d5db",
                      background: complete
                        ? "#f0fdf4"
                        : current
                          ? "#eef2ff"
                          : ready
                            ? "#fffbeb"
                            : "#ffffff",
                      borderRadius: 18,
                      padding: 18,
                      minHeight: 205,
                      display: "block",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 900,
                          color: complete
                            ? "#15803d"
                            : current
                              ? "#4338ca"
                              : ready
                                ? "#b45309"
                                : "#6b7280",
                          textTransform: "uppercase",
                        }}
                      >
                        Step {index + 1}
                      </div>

                      <div style={{ fontSize: 22 }}>
                        {complete
                          ? "✓"
                          : current
                            ? "→"
                            : ready
                              ? "•"
                              : item.step}
                      </div>
                    </div>

                    <h2
                      style={{
                        marginTop: 10,
                        fontSize: 22,
                        fontWeight: 950,
                        color: "#111827",
                      }}
                    >
                      {item.title}
                    </h2>

                    <p
                      style={{
                        marginTop: 8,
                        color: "#4b5563",
                        fontSize: 15,
                      }}
                    >
                      {detail}
                    </p>

                    <div
                      style={{
                        marginTop: 12,
                        fontSize: 13,
                        fontWeight: 900,
                        color: complete
                          ? "#15803d"
                          : current
                            ? "#4338ca"
                            : ready
                              ? "#b45309"
                              : "#6b7280",
                        textTransform: "uppercase",
                      }}
                    >
                      {complete
                        ? "Context saved"
                        : current
                          ? "Current focus"
                          : ready
                            ? "Ready"
                            : "Available"}
                    </div>
                  </Link>
                );
              })}
            </div>

            <div
              style={{
                marginTop: 24,
                border: "1px solid #e5e7eb",
                borderRadius: 18,
                background: "#fff",
                padding: 18,
              }}
            >
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 950,
                  color: "#111827",
                }}
              >
                How SleepFixMe works
              </h2>

              <p style={{ marginTop: 8, color: "#374151" }}>
                First establish your usual context. Then record what
                happened during sleep. Use Investigation to examine
                the disturbances that appear relevant and map the
                amount, degree, timing, or exposure at which your
                sleep changes. Protocols provide focused actions based
                on what is currently understood.
              </p>

              <p style={{ marginTop: 8, color: "#374151" }}>
                Results are not intended to become another collection
                of sleep scores. As your investigations develop, they
                should show what you have actually learned about your
                sleep: which contributing factors matter, where their
                apparent tolerance boundaries lie, and what responses
                are most useful.
              </p>

              <p style={{ marginTop: 8, color: "#374151" }}>
                SleepFixMe applies the Rhythmic Systems Model (RSM).
                For the broader model, its development, and research,
                visit{" "}
                <a
                  href="https://rhythmicsystems.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#000080",
                    fontWeight: 800,
                  }}
                >
                  rhythmicsystems.com
                </a>
                .
              </p>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
