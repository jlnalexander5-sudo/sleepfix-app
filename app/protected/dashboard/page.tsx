"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type DailyHabitRow = {
  id: string;
  user_id: string;
  created_at: string;
  date: string; // YYYY-MM-DD
  caffeine_after_2pm: boolean | null;
  alcohol: boolean | null;
  exercise: boolean | null;
  screens_last_hour: boolean | null;
};

type SleepLogRow = {
  id: string;
  user_id: string;
  created_at: string;
  sleep_start: string | null; // timestamptz
  sleep_end: string | null; // timestamptz
  quality: number | null; // smallint
  notes: string | null;
};

function toYYYYMMDDLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtLocal(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  // shows in user's local time
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [today, setToday] = useState<string>("");

  const [habits, setHabits] = useState<DailyHabitRow | null>(null);
  const [sleep, setSleep] = useState<SleepLogRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setStatus("Checking session...");

      const t = toYYYYMMDDLocal();
      setToday(t);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        if (!cancelled) {
          setError(userErr.message);
          setStatus("Failed to get user.");
          setLoading(false);
        }
        return;
      }

      const user = userData.user;
      if (!user) {
        if (!cancelled) {
          setStatus("Not logged in.");
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;
      setUserId(user.id);
      setEmail(user.email ?? null);

      // 1) Load / create today's habits row
      setStatus("Loading today's habits...");
      const { data: existingHabits, error: habitsErr } = await supabase
        .from("daily_habits")
        .select(
          "id, user_id, created_at, date, caffeine_after_2pm, alcohol, exercise, screens_last_hour"
        )
        .eq("user_id", user.id)
        .eq("date", t)
        .maybeSingle<DailyHabitRow>();

      if (habitsErr) {
        if (!cancelled) {
          setError(habitsErr.message);
          setStatus("Failed to load habits.");
          setLoading(false);
        }
        return;
      }

      let habitsRow = existingHabits;

      if (!habitsRow) {
        setStatus("Creating today's habits row...");
        const { data: created, error: createErr } = await supabase
          .from("daily_habits")
          .insert({
            user_id: user.id,
            date: t,
            caffeine_after_2pm: false,
            alcohol: false,
            exercise: false,
            screens_last_hour: false,
          })
          .select(
            "id, user_id, created_at, date, caffeine_after_2pm, alcohol, exercise, screens_last_hour"
          )
          .single<DailyHabitRow>();

        if (createErr) {
          if (!cancelled) {
            setError(createErr.message);
            setStatus("Failed to create habits row.");
            setLoading(false);
          }
          return;
        }
        habitsRow = created;
      }

      // 2) Load latest sleep log (most recent sleep_start)
      setStatus("Loading latest sleep log...");
      const { data: latestSleep, error: sleepErr } = await supabase
        .from("sleep_logs")
        .select("id, user_id, created_at, sleep_start, sleep_end, quality, notes")
        .eq("user_id", user.id)
        .order("sleep_start", { ascending: false })
        .limit(1)
        .maybeSingle<SleepLogRow>();

      if (sleepErr) {
        if (!cancelled) {
          setError(sleepErr.message);
          setStatus("Failed to load sleep log.");
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;
      setHabits(habitsRow ?? null);
      setSleep(latestSleep ?? null);
      setStatus("Ready.");
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const yesNo = (v: boolean | null | undefined) => (v ? "✅" : "❌");

  return (
    <main style={{ maxWidth: 820, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Dashboard
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        {email ? `Signed in as ${email}` : "Signed in"}
        {today ? ` • Today: ${today}` : ""}
      </p>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.8 }}>Status: {status}</div>
        {loading && <div style={{ marginTop: 8 }}>Loading...</div>}
        {error && (
          <div style={{ marginTop: 8, color: "salmon" }}>Error: {error}</div>
        )}
      </div>

      {!loading && (
        <div style={{ display: "grid", gap: 16 }}>
          {/* Today habits */}
          <section
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Today’s habits
              </h2>
              <Link href="/protected/habits" style={{ opacity: 0.9 }}>
                Open habits →
              </Link>
            </div>

            <div style={{ marginTop: 12, lineHeight: 1.9 }}>
              <div>
                {yesNo(habits?.caffeine_after_2pm)} Caffeine after 2pm
              </div>
              <div>{yesNo(habits?.alcohol)} Alcohol</div>
              <div>{yesNo(habits?.exercise)} Exercise</div>
              <div>{yesNo(habits?.screens_last_hour)} Screens last hour</div>
            </div>
          </section>

          {/* Latest sleep */}
          <section
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Latest sleep log
              </h2>
              <Link href="/protected/sleep" style={{ opacity: 0.9 }}>
                Open sleep →
              </Link>
            </div>

            {!sleep ? (
              <div style={{ marginTop: 12, opacity: 0.85 }}>
                No sleep logs yet.
              </div>
            ) : (
              <div style={{ marginTop: 12, lineHeight: 1.9 }}>
                <div>
                  <span style={{ opacity: 0.8 }}>Start:</span>{" "}
                  {fmtLocal(sleep.sleep_start)}
                </div>
                <div>
                  <span style={{ opacity: 0.8 }}>End:</span>{" "}
                  {fmtLocal(sleep.sleep_end)}
                </div>
                <div>
                  <span style={{ opacity: 0.8 }}>Quality:</span>{" "}
                  {sleep.quality ?? "—"} / 5
                </div>
                {sleep.notes ? (
                  <div style={{ marginTop: 10, opacity: 0.9 }}>
                    <div style={{ opacity: 0.8, marginBottom: 4 }}>Notes:</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{sleep.notes}</div>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {/* quick nav buttons */}
          <section style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link
              href="/protected/habits"
              style={{
                display: "inline-block",
                padding: "10px 14px",
                borderRadius: 10,
                fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              Go to Habits
            </Link>
            <Link
              href="/protected/sleep"
              style={{
                display: "inline-block",
                padding: "10px 14px",
                borderRadius: 10,
                fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              Go to Sleep
            </Link>
          </section>
        </div>
      )}
    </main>
  );
}
