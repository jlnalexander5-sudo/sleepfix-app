"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type UserProgress = {
  name: string;
  email: string;
  hasProfile: boolean;
  sleepCount: number;
  diaryCount: number;
  sleepLoggedToday: boolean;
  diaryLoggedToday: boolean;
  todayYMD: string;
  latestSleepDate: string | null;
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
      "Set your usual sleep context first, so stable conditions are not mistaken for sleep problems.",
  },
  {
    step: "2",
    title: "Sleep form",
    href: "/protected/sleep",
    detail:
      "Log last night's sleep: quality, latency, wake-ups, wake recovery, and real disruptions.",
  },
  {
    step: "3",
    title: "Diary",
    href: "/protected/habits",
    detail:
      "Add what happened before sleep and during the night so SleepFix can explain the pattern better.",
  },
  {
    step: "4",
    title: "Protocol",
    href: "/protected/protocols",
    detail:
      "Review the focused action recommended from your latest saved sleep record.",
  },
  {
    step: "5",
    title: "Results",
    href: "/protected/results",
    detail:
      "Check last night first, then watch only the trends that are relevant to your sleep problem.",
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

function flowState(progress: UserProgress | null, item: FlowItem): "done" | "current" | "ready" | "locked" {
  if (!progress) return item.title === "Profile" ? "current" : "locked";

  if (item.title === "Profile") return progress.hasProfile ? "done" : "current";
  if (item.title === "Sleep form") {
    if (!progress.hasProfile) return "locked";
    return progress.sleepLoggedToday ? "done" : "current";
  }
  if (item.title === "Diary") {
    if (!progress.sleepLoggedToday) return "locked";
    return progress.diaryLoggedToday ? "done" : "current";
  }
  if (item.title === "Protocol") {
    if (!progress.sleepLoggedToday) return "locked";
    return "ready";
  }
  if (item.title === "Results") {
    if (!progress.sleepLoggedToday) return "locked";
    return "ready";
  }

  return "locked";
}

function progressPercent(progress: UserProgress | null) {
  if (!progress) return 0;
  let score = 0;
  if (progress.hasProfile) score += 20;
  if (progress.sleepLoggedToday) score += 30;
  if (progress.diaryLoggedToday) score += 20;
  if (progress.sleepLoggedToday) score += 15; // protocol unlocked
  if (progress.sleepLoggedToday) score += 15; // results unlocked
  return Math.min(100, score);
}

function nextAction(progress: UserProgress | null) {
  if (!progress) return FLOW[0];
  if (!progress.hasProfile) return FLOW[0];
  if (!progress.sleepLoggedToday) return FLOW[1];
  if (!progress.diaryLoggedToday) return FLOW[2];
  return FLOW[3];
}

function dailyStatusText(progress: UserProgress | null) {
  if (!progress) return "Loading today's flow...";
  if (!progress.hasProfile) return "Start with your profile so SleepFix has your baseline context.";
  if (!progress.sleepLoggedToday) return "Today's next step: log last night's sleep.";
  if (!progress.diaryLoggedToday) return "Sleep logged. Add diary context while the night is still fresh.";
  return "Today's core flow is complete. Review your protocol, then check Results.";
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
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const user = authData?.user ?? null;

      if (authErr || !user) {
        if (!cancelled) {
          setError(authErr?.message ?? "Not signed in.");
          setLoading(false);
        }
        return;
      }

      const [profileRes, sleepCountRes, diaryCountRes, todaySleepRes, todayDiaryRes, latestSleepRes] = await Promise.all([
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
          .from("sleep_diary_entries")
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
          .from("sleep_diary_entries")
          .select("id")
          .eq("user_id", user.id)
          .eq("entry_date", todayYMD)
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
      ]);

      if (!cancelled) {
        setProgress({
          name: firstNameFromUser(user.email ?? "", user.user_metadata),
          email: user.email ?? "",
          hasProfile: Boolean(profileRes.data?.user_id),
          sleepCount: sleepCountRes.count ?? 0,
          diaryCount: diaryCountRes.count ?? 0,
          sleepLoggedToday: Boolean(todaySleepRes.data?.id),
          diaryLoggedToday: Boolean(todayDiaryRes.data?.id),
          todayYMD,
          latestSleepDate:
            latestSleepRes.data?.local_date ??
            (latestSleepRes.data?.created_at ? String(latestSleepRes.data.created_at).slice(0, 10) : null),
        });
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const pct = progressPercent(progress);
  const action = nextAction(progress);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section
        style={{
          border: "1px solid #c9d2ff",
          background: "linear-gradient(135deg, #eef3ff 0%, #ffffff 70%)",
          borderRadius: 24,
          padding: 28,
          boxShadow: "0 12px 35px rgba(20, 30, 90, 0.08)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 900, color: "#2636b8", textTransform: "uppercase", letterSpacing: 0.8 }}>
          Start page
        </div>

        <h1 style={{ marginTop: 8, fontSize: 38, lineHeight: 1.1, fontWeight: 950, color: "#08105c" }}>
          {progress ? `Welcome, ${progress.name}` : "Welcome to SleepFixMe"}
        </h1>

        <p style={{ marginTop: 12, maxWidth: 780, color: "#374151", fontSize: 18 }}>
          SleepFixMe is built to reduce sleep confusion. It does not try to flood you with every possible metric. It guides you through a repeatable daily flow so the app can identify the sleep problem that is actually relevant to you.
        </p>

        <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          <div style={{ border: "1px solid #dbe2ff", background: "white", borderRadius: 18, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#4f46e5", textTransform: "uppercase" }}>Why it is different</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 950, color: "#111827" }}>Problem-first, not metric-first</div>
            <p style={{ marginTop: 6, color: "#4b5563" }}>
              Most sleep apps report scores. SleepFixMe tries to separate the actual disruption pattern: onset delay, wake fragmentation, thermal instability, body load, mental activation, or rhythm disruption.
            </p>
          </div>

          <div style={{ border: "1px solid #dbe2ff", background: "white", borderRadius: 18, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#4f46e5", textTransform: "uppercase" }}>Personal relevance</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 950, color: "#111827" }}>Only the signals that matter</div>
            <p style={{ marginTop: 6, color: "#4b5563" }}>
              Your Results page should emphasize the issues affecting you, not irrelevant data that creates noise or false confidence.
            </p>
          </div>

          <div style={{ border: "1px solid #dbe2ff", background: "white", borderRadius: 18, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#4f46e5", textTransform: "uppercase" }}>Daily habit loop</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 950, color: "#111827" }}>Fresh input, fresh protocol</div>
            <p style={{ marginTop: 6, color: "#4b5563" }}>
              The Start page resets around today’s sleep workflow so users know exactly what to do next and do not rely on stale recommendations.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ marginTop: 20, color: "#555", fontWeight: 700 }}>Loading today's flow...</div>
        ) : null}

        {error ? (
          <div style={{ marginTop: 20, border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 14, padding: 14, fontWeight: 800 }}>
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            <div style={{ marginTop: 24, border: "1px solid #dbe2ff", background: "white", borderRadius: 18, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: "#6b7280", textTransform: "uppercase" }}>
                    Today&apos;s SleepFix flow
                  </div>
                  <div style={{ marginTop: 4, fontSize: 24, fontWeight: 950, color: "#000080" }}>
                    {pct}% complete
                  </div>
                  <div style={{ marginTop: 6, color: "#374151", fontWeight: 700 }}>
                    {dailyStatusText(progress)}
                  </div>
                  <div style={{ marginTop: 4, color: "#6b7280", fontSize: 14 }}>
                    Today: {formatYMD(progress?.todayYMD ?? null)} · Latest sleep record: {formatYMD(progress?.latestSleepDate ?? null)}
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

              <div style={{ marginTop: 12, height: 12, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "#4f46e5" }} />
              </div>
            </div>

            <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              {FLOW.map((item, index) => {
                const state = flowState(progress, item);
                const complete = state === "done";
                const current = state === "current";
                const ready = state === "ready";
                const locked = state === "locked";

                return (
                  <Link
                    key={item.title}
                    href={locked ? "#" : item.href}
                    aria-disabled={locked}
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
                            : "#f9fafb",
                      opacity: locked ? 0.62 : 1,
                      borderRadius: 18,
                      padding: 18,
                      minHeight: 190,
                      display: "block",
                      pointerEvents: locked ? "none" : "auto",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: complete ? "#15803d" : current ? "#4338ca" : ready ? "#b45309" : "#6b7280", textTransform: "uppercase" }}>
                        Step {index + 1}
                      </div>
                      <div style={{ fontSize: 22 }}>
                        {complete ? "✓" : current ? "→" : ready ? "•" : item.step}
                      </div>
                    </div>
                    <h2 style={{ marginTop: 10, fontSize: 22, fontWeight: 950, color: "#111827" }}>
                      {item.title}
                    </h2>
                    <p style={{ marginTop: 8, color: "#4b5563", fontSize: 15 }}>
                      {item.detail}
                    </p>
                    <div style={{ marginTop: 12, fontSize: 13, fontWeight: 900, color: complete ? "#15803d" : current ? "#4338ca" : ready ? "#b45309" : "#6b7280", textTransform: "uppercase" }}>
                      {complete ? "Complete today" : current ? "Do this next" : ready ? "Ready to review" : "Locked until earlier steps"}
                    </div>
                  </Link>
                );
              })}
            </div>

            <div style={{ marginTop: 24, border: "1px solid #e5e7eb", borderRadius: 18, background: "#fff", padding: 18 }}>
              <h2 style={{ fontSize: 22, fontWeight: 950, color: "#111827" }}>The rule SleepFixMe follows</h2>
              <p style={{ marginTop: 8, color: "#374151" }}>
                First collect the right context. Then log the night. Then add diary context. Only after that should SleepFixMe recommend a protocol and show results. This reduces false positives, stale advice, and irrelevant metrics.
              </p>
              <p style={{ marginTop: 8, color: "#374151" }}>
                The app becomes more useful as your baseline grows because it compares last night against your own recurring sleep pattern, not against a generic sleep score.
              </p>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
