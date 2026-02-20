"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

const [localDate, setLocalDate] = useState("");

useEffect(() => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  setLocalDate(`${y}-${m}-${day}`);
}

export default function BaselinePage() {
  const supabase = createBrowserSupabaseClient();

  const [msg, setMsg] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);

  // Baseline 5 inputs
  const [baselineBedtime, setBaselineBedtime] = useState<string>("22:30");
  const [baselineWaketime, setBaselineWaketime] = useState<string>("07:30");
  const [baselineLatencyMin, setBaselineLatencyMin] = useState<number>(20);
  const [baselineWakeupsCount, setBaselineWakeupsCount] = useState<number>(1);
  const [baselineTotalSleepMin, setBaselineTotalSleepMin] = useState<number>(450);
  const [notes, setNotes] = useState<string>("");

  // which baseline row we’re editing (simple = “today”)
  const [localDate, setLocalDate] = useState<string>(todayLocalDate());

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id ?? null);
    })();
  }, [supabase]);

  async function loadBaseline() {
    setMsg("");
    if (!userId) {
      setMsg("Not signed in.");
      return;
    }

    const { data, error } = await supabase
      .from("rrsm_baselines")
      .select(
        "baseline_bedtime, baseline_waketime, baseline_sleep_latency_min, baseline_wakeups_count, baseline_total_sleep_min, notes"
      )
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .maybeSingle();

    if (error) {
      setMsg(`Load failed: ${error.message}`);
      return;
    }
    if (!data) {
      setMsg("No baseline saved for this date yet.");
      return;
    }

    setBaselineBedtime((data.baseline_bedtime as string) ?? "22:30");
    setBaselineWaketime((data.baseline_waketime as string) ?? "07:30");
    setBaselineLatencyMin((data.baseline_sleep_latency_min as number) ?? 20);
    setBaselineWakeupsCount((data.baseline_wakeups_count as number) ?? 1);
    setBaselineTotalSleepMin((data.baseline_total_sleep_min as number) ?? 450);
    setNotes((data.notes as string) ?? "");
    setMsg("Loaded.");
  }

  async function saveBaseline() {
    setMsg("");
    if (!userId) {
      setMsg("Not signed in.");
      return;
    }

    const payload = {
      user_id: userId,
      local_date: localDate,
      baseline_bedtime: baselineBedtime,
      baseline_waketime: baselineWaketime,
      baseline_sleep_latency_min: baselineLatencyMin,
      baseline_wakeups_count: baselineWakeupsCount,
      baseline_total_sleep_min: baselineTotalSleepMin,
      notes: notes || null,
    };

    const { error } = await supabase
      .from("rrsm_baselines")
      .upsert(payload, { onConflict: "user_id,local_date" });

    if (error) {
      setMsg(`Save failed: ${error.message}`);
      return;
    }
    setMsg("Saved baseline ✅");
  }

  const labelStyle: React.CSSProperties = { fontSize: 18, fontWeight: 700 };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 14,
    fontSize: 18,
    fontWeight: 600,
    borderRadius: 8,
    background: "#3b3b3b",
    color: "white",
    border: "1px solid #555",
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>RRSM Baseline</h1>

      <div style={{ marginTop: 18 }}>
        <label style={labelStyle}>Baseline date</label>
        <input
          type="date"
          value={localDate}
          onChange={(e) => setLocalDate(e.target.value)}
          style={inputStyle}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button
            onClick={loadBaseline}
            style={{ padding: "12px 14px", fontSize: 16, borderRadius: 8 }}
          >
            Load
          </button>
          <button
            onClick={saveBaseline}
            style={{ padding: "12px 14px", fontSize: 16, borderRadius: 8 }}
          >
            Save baseline
          </button>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={labelStyle}>Typical bedtime</label>
        <input
          type="time"
          value={baselineBedtime}
          onChange={(e) => setBaselineBedtime(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={labelStyle}>Typical wake time</label>
        <input
          type="time"
          value={baselineWaketime}
          onChange={(e) => setBaselineWaketime(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={labelStyle}>Typical sleep latency (minutes)</label>
        <input
          type="number"
          min={0}
          max={240}
          value={baselineLatencyMin}
          onChange={(e) => setBaselineLatencyMin(Number(e.target.value))}
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={labelStyle}>Typical wake-ups (count)</label>
        <input
          type="number"
          min={0}
          max={20}
          value={baselineWakeupsCount}
          onChange={(e) => setBaselineWakeupsCount(Number(e.target.value))}
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={labelStyle}>Typical total sleep (minutes)</label>
        <input
          type="number"
          min={0}
          max={1000}
          value={baselineTotalSleepMin}
          onChange={(e) => setBaselineTotalSleepMin(Number(e.target.value))}
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={labelStyle}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...inputStyle, minHeight: 90 }}
        />
      </div>

      {msg ? (
        <div style={{ marginTop: 14, fontSize: 16, opacity: 0.9 }}>{msg}</div>
      ) : null}
    </div>
  );
}
