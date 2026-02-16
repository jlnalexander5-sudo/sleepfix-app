"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type LatestNightRRSM = {
  night_id: string;
  user_id: string;
  sleep_start: string | null;
  sleep_end: string | null;

  duration_hours: number | null;
  quality_num: number | null;
  latency_mins: number | null;
  wakeups_count: number | null;

  sleep_success_score: number | null;
  sleep_status: string | null;
  sleep_success_band: string | null;

  risk_score: number | null;
  risk_band: string | null;
  primary_risk: string | null;

  what_happened: string | null;
  why_this_matters: string | null;
  tonight_action_plan: string | null;
  avoid_tonight: string | null;
  encouragement: string | null;

  recommendation: string | null;
  risk_trend: string | null;
};

type UserDriverRow = {
  night_id: string;
  user_id: string;
  primary_driver: string;
  secondary_driver: string | null;
  created_at?: string;
  updated_at?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmt(dtIso: string | null) {
  if (!dtIso) return "—";
  const d = new Date(dtIso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function toNumberOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// RRSM structured driver options (no free text yet)
const DRIVER_OPTIONS = [
  "Pain / DOMS",
  "Heat / Temperature",
  "Substance ingested",
  "Cognitive load",
  "Schedule / shift disruption",
  "Environment (noise/light)",
  "Unknown",
] as const;

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [latest, setLatest] = useState<LatestNightRRSM | null>(null);

  // User-confirmed drivers for the latest night
  const [primaryDriver, setPrimaryDriver] = useState<string>(DRIVER_OPTIONS[0]);
  const [secondaryDriver, setSecondaryDriver] = useState<string>("");

  const [savingDrivers, setSavingDrivers] = useState(false);
  const [savedDriversMsg, setSavedDriversMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setStatus("Checking session...");

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

      setStatus("Loading latest RRSM night...");
      // IMPORTANT: this view must exist in Supabase
      const { data: rrsmRow, error: rrsmErr } = await supabase
        .from("v_latest_night_rrsm")
        .select("*")
        .maybeSingle<LatestNightRRSM>();

      if (rrsmErr) {
        if (!cancelled) {
          setError(rrsmErr.message);
          setStatus("Failed to load v_latest_night_rrsm.");
          setLoading(false);
        }
        return;
      }

      if (!rrsmRow) {
        if (!cancelled) {
          setLatest(null);
          setStatus("No nights found yet. Log a sleep night first.");
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;

      // Normalize numeric fields (helps if view returns strings)
      const normalized: LatestNightRRSM = {
        ...rrsmRow,
        duration_hours: toNumberOrNull((rrsmRow as any).duration_hours),
        quality_num: toNumberOrNull((rrsmRow as any).quality_num),
        latency_mins: toNumberOrNull((rrsmRow as any).latency_mins),
        wakeups_count: toNumberOrNull((rrsmRow as any).wakeups_count),
        sleep_success_score: toNumberOrNull((rrsmRow as any).sleep_success_score),
        risk_score: toNumberOrNull((rrsmRow as any).risk_score),
      };

      setLatest(normalized);

      setStatus("Loading your driver selections...");
      // Pull existing user confirmation for this night (if any)
      const { data: driverRow, error: driverErr } = await supabase
        .from("night_user_drivers")
        .select("night_id, user_id, primary_driver, secondary_driver")
        .eq("night_id", normalized.night_id)
        .maybeSingle<UserDriverRow>();

      if (driverErr) {
        // Non-fatal: still show RRSM output, but show error
        setError(driverErr.message);
        setStatus("Loaded RRSM, but failed to load driver selections.");
        setLoading(false);
        return;
      }

      if (driverRow) {
        setPrimaryDriver(driverRow.primary_driver || DRIVER_OPTIONS[0]);
        setSecondaryDriver(driverRow.secondary_driver || "");
        setSavedDriversMsg("Loaded your previous selection ✅");
      } else {
        // Defaults
        setPrimaryDriver(DRIVER_OPTIONS[0]);
        setSecondaryDriver("");
        setSavedDriversMsg("");
      }

      setStatus("Ready.");
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function saveDrivers() {
    if (!userId || !latest?.night_id) return;

    setSavingDrivers(true);
    setError(null);
    setSavedDriversMsg("");
    setStatus("Saving driver selection...");

    const payload: UserDriverRow = {
      night_id: latest.night_id,
      user_id: userId,
      primary_driver: primaryDriver,
      secondary_driver: secondaryDriver ? secondaryDriver : null,
    };

    const { error: upErr } = await supabase
      .from("night_user_drivers")
      .upsert(payload, { onConflict: "night_id" });

    if (upErr) {
      setError(upErr.message);
      setStatus("Save failed.");
      setSavingDrivers(false);
      return;
    }

    setSavingDrivers(false);
    setStatus("Ready.");
    setSavedDriversMsg("Saved ✅ (this will refine RRSM over time)");
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Sleep</h1>
      <p style={{ opacity: 0.85, marginBottom: 18 }}>
        {email ? `Signed in as ${email}` : "Signed in"}
      </p>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 8 }}>
          Status: {status}
        </div>
        {loading && <div>Loading...</div>}
        {error && (
          <div style={{ marginTop: 8, color: "salmon" }}>
            Error: {error}
          </div>
        )}
      </div>

      {!loading && !latest && (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            No RRSM nights yet
          </div>
          <div style={{ opacity: 0.85 }}>
            Log a sleep night first so RRSM can generate “Why / What / Tonight”.
          </div>
        </div>
      )}

      {!loading && latest && (
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
          {/* LEFT: RRSM Explanation */}
          <section
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 10 }}>
              Latest night (RRSM)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Sleep start</div>
                <div style={{ fontWeight: 700 }}>{fmt(latest.sleep_start)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Sleep end</div>
                <div style={{ fontWeight: 700 }}>{fmt(latest.sleep_end)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Duration</div>
                <div style={{ fontWeight: 700 }}>
                  {latest.duration_hours == null ? "—" : `${latest.duration_hours.toFixed(2)}h`}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Quality</div>
                <div style={{ fontWeight: 700 }}>
                  {latest.quality_num == null ? "—" : `${latest.quality_num}/5`}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Latency</div>
                <div style={{ fontWeight: 700 }}>
                  {latest.latency_mins == null ? "—" : `${latest.latency_mins}m`}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Wake-ups</div>
                <div style={{ fontWeight: 700 }}>
                  {latest.wakeups_count == null ? "—" : `${latest.wakeups_count}`}
                </div>
              </div>
            </div>

            <hr style={{ margin: "14px 0", opacity: 0.2 }} />

            <div style={{ display: "grid", gap: 10 }}>
              <Block title="What happened?" text={latest.what_happened} />
              <Block title="Why this matters" text={latest.why_this_matters} />
              <Block title="Tonight action plan" text={latest.tonight_action_plan} />
              <Block title="Avoid tonight" text={latest.avoid_tonight} />
              <Block title="Encouragement" text={latest.encouragement} />
            </div>
          </section>

          {/* RIGHT: Risk + User confirmation */}
          <section
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 10 }}>RRSM signal</div>

            <div style={{ display: "grid", gap: 10 }}>
              <MiniStat label="Sleep success score" value={latest.sleep_success_score} suffix="" />
              <MiniText label="Sleep status" value={latest.sleep_status} />
              <MiniText label="Sleep band" value={latest.sleep_success_band} />
              <MiniStat label="Risk score" value={latest.risk_score} suffix="" />
              <MiniText label="Risk band" value={latest.risk_band} />
              <MiniText label="Primary risk" value={latest.primary_risk} />
              <MiniText label="Risk trend" value={latest.risk_trend} />
              <MiniText label="Recommendation" value={latest.recommendation} />
            </div>

            <hr style={{ margin: "14px 0", opacity: 0.2 }} />

            <div style={{ fontWeight: 800, marginBottom: 8 }}>
              Your confirmation (structured)
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
              RRSM suggests drivers — you confirm the right ones. This is how it becomes precise for you over time.
            </div>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                Primary driver
              </div>
              <select
                value={primaryDriver}
                onChange={(e) => setPrimaryDriver(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 10 }}
              >
                {DRIVER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                Secondary driver (optional)
              </div>
              <select
                value={secondaryDriver}
                onChange={(e) => setSecondaryDriver(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 10 }}
              >
                <option value="">— None</option>
                {DRIVER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={saveDrivers}
              disabled={savingDrivers}
              style={{
                width: "100%",
                marginTop: 6,
                padding: "10px 14px",
                borderRadius: 12,
                fontWeight: 800,
                cursor: savingDrivers ? "not-allowed" : "pointer",
              }}
            >
              {savingDrivers ? "Saving..." : "Save confirmation"}
            </button>

            {savedDriversMsg && (
              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
                {savedDriversMsg}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function Block({ title, text }: { title: string; text: string | null }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{title}</div>
      <div style={{ fontWeight: 650, lineHeight: 1.35 }}>
        {text && text.trim().length > 0 ? text : "—"}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 18 }}>
        {value == null ? "—" : `${Math.round(value)}${suffix}`}
      </div>
    </div>
  );
}

function MiniText({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
      <div style={{ fontWeight: 750 }}>{value && value.length ? value : "—"}</div>
    </div>
  );
}
