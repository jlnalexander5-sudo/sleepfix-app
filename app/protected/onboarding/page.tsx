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
};

const FLOW = [
  {
    step: "1",
    title: "Profile",
    href: "/protected/profile",
    detail:
      "Tell SleepFix your usual sleep context first, so normal conditions are not mistaken for problems.",
  },
  {
    step: "2",
    title: "Sleep form",
    href: "/protected/sleep",
    detail:
      "Log last night: sleep quality, time to fall asleep, wake-ups, wake recovery, and real disruptions.",
  },
  {
    step: "3",
    title: "Diary",
    href: "/protected/habits",
    detail:
      "Add what happened before sleep and during the night. This gives the engine context behind the numbers.",
  },
  {
    step: "4",
    title: "Protocol",
    href: "/protected/protocols",
    detail:
      "Review the focused action for tonight. Protocols should follow the pattern, not replace the pattern.",
  },
  {
    step: "5",
    title: "Results",
    href: "/protected/dashboard",
    detail:
      "See what happened last night first, then watch the relevant problem trend across the last 7 days.",
  },
];

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

function progressPercent(progress: UserProgress | null) {
  if (!progress) return 0;
  let score = 0;
  if (progress.hasProfile) score += 20;
  if (progress.sleepCount >= 1) score += 25;
  if (progress.diaryCount >= 1) score += 20;
  if (progress.sleepCount >= 3) score += 20;
  if (progress.sleepCount >= 7) score += 15;
  return Math.min(100, score);
}

function nextAction(progress: UserProgress | null) {
  if (!progress) return FLOW[0];
  if (!progress.hasProfile) return FLOW[0];
  if (progress.sleepCount < 1) return FLOW[1];
  if (progress.diaryCount < 1) return FLOW[2];
  if (progress.sleepCount < 3) return FLOW[1];
  if (progress.sleepCount >= 1) return FLOW[3];
  return FLOW[4];
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

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const user = authData?.user ?? null;

      if (authErr || !user) {
        if (!cancelled) {
          setError(authErr?.message ?? "Not signed in.");
          setLoading(false);
        }
        return;
      }

      const [{ data: profile }, { count: sleepCount }, { count: diaryCount }] = await Promise.all([
        supabase
          .from("rrsm_profiles")
          .select("user_id", { count: "exact" })
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
      ]);

      if (!cancelled) {
        setProgress({
          name: firstNameFromUser(user.email ?? "", user.user_metadata),
          email: user.email ?? "",
          hasProfile: Boolean(profile?.user_id),
          sleepCount: sleepCount ?? 0,
          diaryCount: diaryCount ?? 0,
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
          SleepFixMe onboarding
        </div>

        <h1 style={{ marginTop: 8, fontSize: 38, lineHeight: 1.1, fontWeight: 950, color: "#08105c" }}>
          {progress ? `Welcome, ${progress.name}` : "Welcome to SleepFixMe"}
        </h1>

        <p style={{ marginTop: 12, maxWidth: 760, color: "#374151", fontSize: 18 }}>
          SleepFix works best when it follows a clear order: profile first, then sleep entry, then diary context, then protocol, then results. This stops the app from guessing too early and helps it learn your actual sleep pattern.
        </p>

        {loading ? (
          <div style={{ marginTop: 20, color: "#555", fontWeight: 700 }}>Loading your setup...</div>
        ) : null}

        {error ? (
          <div style={{ marginTop: 20, border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 14, padding: 14, fontWeight: 800 }}>
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            <div style={{ marginTop: 22, border: "1px solid #dbe2ff", background: "white", borderRadius: 18, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: "#6b7280", textTransform: "uppercase" }}>
                    Setup progress
                  </div>
                  <div style={{ marginTop: 4, fontSize: 24, fontWeight: 950, color: "#000080" }}>
                    {pct}% complete
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
                const complete =
                  item.title === "Profile"
                    ? Boolean(progress?.hasProfile)
                    : item.title === "Sleep form"
                      ? (progress?.sleepCount ?? 0) >= 1
                      : item.title === "Diary"
                        ? (progress?.diaryCount ?? 0) >= 1
                        : item.title === "Protocol"
                          ? (progress?.sleepCount ?? 0) >= 1
                          : (progress?.sleepCount ?? 0) >= 3;

                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    style={{
                      color: "inherit",
                      textDecoration: "none",
                      border: complete ? "2px solid #16a34a" : "1px solid #d1d5db",
                      background: complete ? "#f0fdf4" : "white",
                      borderRadius: 18,
                      padding: 18,
                      minHeight: 190,
                      display: "block",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#4f46e5", textTransform: "uppercase" }}>
                        Step {index + 1}
                      </div>
                      <div style={{ fontSize: 22 }}>{complete ? "✓" : item.step}</div>
                    </div>
                    <h2 style={{ marginTop: 10, fontSize: 22, fontWeight: 950, color: "#111827" }}>
                      {item.title}
                    </h2>
                    <p style={{ marginTop: 8, color: "#4b5563", fontSize: 15 }}>
                      {item.detail}
                    </p>
                  </Link>
                );
              })}
            </div>

            <div style={{ marginTop: 24, border: "1px solid #e5e7eb", borderRadius: 18, background: "#fff", padding: 18 }}>
              <h2 style={{ fontSize: 22, fontWeight: 950, color: "#111827" }}>What SleepFix is trying to do</h2>
              <p style={{ marginTop: 8, color: "#374151" }}>
                SleepFix is not trying to throw every sleep metric at you. It is trying to identify the sleep problem that is actually relevant to you: onset delay, wake fragmentation, thermal instability, body discomfort, mental activation, rhythm disruption, or another recurring pattern.
              </p>
              <p style={{ marginTop: 8, color: "#374151" }}>
                Your Results page becomes more useful after repeated entries because SleepFix can compare last night against your own pattern instead of treating one night as the whole story.
              </p>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
