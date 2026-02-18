"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type NightMetricsRow = {
  night_id: string;
  user_id: string;
  created_at: string;
  duration_min: number | null;
  latency_min: number | null;
  wakeups_count: number | null;
  quality_num: number | null;
};

type SleepNightInsert = {
  user_id: string;
  sleep_start: string; // ISO
  sleep_end: string;   // ISO
  local_date: string;  // YYYY-MM-DD
};

type NightUserDriversUpsert = {
  night_id: string;
  user_id: string;
  primary_driver: string | null;
  secondary_driver: string | null;
};

const DRIVER_OPTIONS: string[] = [
  "Nothing / no clear driver",
  "Noise / environment",
  "Stress / racing mind",
  "Late caffeine",
  "Alcohol",
  "Late meal / heavy meal",
  "Too much screen time",
  "Late exercise",
  "Pain / discomfort",
  "Temperature (too hot/cold)",
  "Light exposure",
  "Travel / jet lag",
  "Illness / congestion",
  "Medication / supplements",
  "Partner disturbance",
  "Pets",
  "Bathroom trips",
  "Nightmares / vivid dreams",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalDateYYYYMMDD(d: Date) {
  // local date (browser timezone)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toIsoWithOffset(d: Date) {
  // keep the user's local time but send ISO string including offset (best effort)
  // JS Date -> toISOString() is UTC; we want the actual moment, so ISO UTC is fine.
  return d.toISOString();
}

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [userId, setUserId] = useState<string | null>(null);

  // night form
  const [sleepStart, setSleepStart] = useState<string>("");
const [sleepEnd, setSleepEnd] = useState<string>("");

  // latest / metrics
  const [latestNightId, setLatestNightId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<NightMetricsRow[]>([]);

  // driver confirmation
  const [primaryDriver, setPrimaryDriver] = useState<string>("Nothing / no clear driver");
  const [secondaryDriver, setSecondaryDriver] = useState<string>("Nothing / no clear driver");
  const [userNotes, setUserNotes] = useState<string>("");

  const [savingNight, setSavingNight] = useState(false);
  const [savingDrivers, setSavingDrivers] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function loadUserAndMetrics() {
    setMsg("");
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      setMsg(`Auth error: ${error.message}`);
      return;
    }
    const uid = data.user?.id ?? null;
    setUserId(uid);

    if (!uid) {
      setMsg("Not signed in.");
      return;
    }

    // load last 7 nights from the view (if present)
    const { data: rows, error: mErr } = await supabase
      .from("v_sleep_night_metrics")
      .select("night_id,user_id,created_at,duration_min,latency_min,wakeups_count,quality_num")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(7);

    if (mErr) {
      setMsg(`Metrics load error: ${mErr.message}`);
      return;
    }

    setMetrics((rows as NightMetricsRow[]) ?? []);
    setLatestNightId((rows as NightMetricsRow[])?.[0]?.night_id ?? null);
  }
// set default datetime-local values on the client (avoids Next prerender error)
const start = new Date();
start.setHours(22, 30, 0, 0);

const end = new Date(start);
end.setDate(end.getDate() + 1);
end.setHours(7, 30, 0, 0);

setSleepStart(start.toISOString().slice(0, 16));
setSleepEnd(end.toISOString().slice(0, 16));
  useEffect(() => {
    loadUserAndMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveNight() {
    setMsg("");
    if (!userId) {
      setMsg("Not signed in.");
      return;
    }

    setSavingNight(true);
    try {
      // datetime-local gives "YYYY-MM-DDTHH:mm"
      const startLocal = new Date(sleepStart);
      const endLocal = new Date(sleepEnd);

      if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) {
        throw new Error("Invalid date/time.");
      }
      if (endLocal <= startLocal) {
        throw new Error("Sleep End must be after Sleep Start.");
      }

      const payload: SleepNightInsert = {
        user_id: userId,
        sleep_start: toIsoWithOffset(startLocal),
        sleep_end: toIsoWithOffset(endLocal),
        // IMPORTANT: your table requires local_date NOT NULL
        local_date: toLocalDateYYYYMMDD(endLocal),
      };

      const { data, error } = await supabase
        .from("sleep_nights")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      const newNightId = (data as any)?.id as string | undefined;
      if (!newNightId) throw new Error("Insert succeeded but no night id returned.");

      setLatestNightId(newNightId);
      setMsg("Night saved ✅");
      await loadUserAndMetrics();
    } catch (e: any) {
      setMsg(`Save night failed ❌ ${e?.message ?? String(e)}`);
    } finally {
      setSavingNight(false);
    }
  }

  async function saveConfirmation() {
    setMsg("");
    if (!userId) {
      setMsg("Not signed in.");
      return;
    }
    if (!latestNightId) {
      setMsg("No latest night yet. Save a night first.");
      return;
    }

    setSavingDrivers(true);
    try {
      // ✅ THIS IS THE FIX:
      // write to night_user_drivers using the REAL columns:
      // night_id, user_id, primary_driver, secondary_driver
      const upsertPayload: NightUserDriversUpsert = {
        night_id: latestNightId,
        user_id: userId,
        primary_driver: primaryDriver || null,
        secondary_driver: secondaryDriver || null,
      };

      const { error } = await supabase
        .from("night_user_drivers")
        .upsert(upsertPayload, { onConflict: "night_id,user_id" });

      if (error) throw error;

      // optional: store notes somewhere else if you have a column/table for it.
      // For now, we just keep it client-side.

      setMsg("Confirmation saved ✅");
    } catch (e: any) {
      setMsg(`Save confirmation failed ❌ ${e?.message ?? String(e)}`);
    } finally {
      setSavingDrivers(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Sleep</h1>

      <div style={{ marginTop: 18 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Sleep Start</label>
        <input
          type="datetime-local"
          value={sleepStart}
          onChange={(e) => setSleepStart(e.target.value)}
          style={{ width: "100%", padding: 10 }}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Sleep End</label>
        <input
          type="datetime-local"
          value={sleepEnd}
          onChange={(e) => setSleepEnd(e.target.value)}
          style={{ width: "100%", padding: 10 }}
        />
      </div>

      <button
        onClick={saveNight}
        disabled={savingNight}
        style={{ width: "100%", padding: 12, fontWeight: 800, marginTop: 18 }}
      >
        {savingNight ? "Saving..." : "Save Night"}
      </button>

      <hr style={{ margin: "28px 0" }} />

      <h2 style={{ fontSize: 18, fontWeight: 800 }}>What do YOU think affected tonight?</h2>

      <div style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Primary driver</label>
        <select
          value={primaryDriver}
          onChange={(e) => setPrimaryDriver(e.target.value)}
          style={{ width: "100%", padding: 10 }}
        >
          {DRIVER_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Secondary driver</label>
        <select
          value={secondaryDriver}
          onChange={(e) => setSecondaryDriver(e.target.value)}
          style={{ width: "100%", padding: 10 }}
        >
          {DRIVER_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Notes (optional)</label>
        <textarea
          value={userNotes}
          onChange={(e) => setUserNotes(e.target.value)}
          placeholder="e.g., neighbor noise until midnight, but slept well after"
          style={{ width: "100%", padding: 10, minHeight: 90 }}
        />
      </div>

      <button
        onClick={saveConfirmation}
        disabled={savingDrivers}
        style={{ width: "100%", padding: 12, fontWeight: 800, marginTop: 16 }}
      >
        {savingDrivers ? "Saving..." : "Save Confirmation"}
      </button>

      {msg && <div style={{ marginTop: 12, fontWeight: 700 }}>{msg}</div>}

      <hr style={{ margin: "28px 0" }} />

      <h2 style={{ fontSize: 18, fontWeight: 800 }}>Last 7 nights (metrics view)</h2>
      <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 13, opacity: 0.95 }}>
        {metrics.length === 0 ? (
          <div>No rows yet.</div>
        ) : (
          metrics.map((m) => (
            <div key={m.night_id} style={{ padding: "8px 0", borderBottom: "1px solid #333" }}>
              <div>night_id: {m.night_id}</div>
              <div>duration_min: {String(m.duration_min)}</div>
              <div>latency_min: {String(m.latency_min)}</div>
              <div>wakeups_count: {String(m.wakeups_count)}</div>
              <div>quality_num: {String(m.quality_num)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
