"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function SleepPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [sleepStart, setSleepStart] = useState("");
  const [sleepEnd, setSleepEnd] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Load logged-in user
  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUserId(data.user.id);
      }
    };
    loadUser();
  }, [supabase]);

  // Save sleep night
  const saveSleepNight = async () => {
    if (!userId) return;

    setError(null);
    setStatus("Saving night...");

    const { error } = await supabase.from("sleep_nights").insert({
      user_id: userId,
      sleep_start: sleepStart,
      sleep_end: sleepEnd,
    });

    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setStatus("Night saved ✅");
  };

  // Save user confirmation (intuition input)
  const saveDriverConfirmation = async () => {
    if (!userId) return;

    setError(null);
    setStatus("Saving confirmation...");

    const { error } = await supabase.from("night_user_drivers").insert({
      user_id: userId,
      driver_type: "confirmation",
      value_text: confirmation,
    });

    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setStatus("Confirmation saved ✅");
    setConfirmation("");
  };

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>
        Log Sleep Night
      </h1>

      <div style={{ marginBottom: 20 }}>
        <label>
          <div>Sleep Start</div>
          <input
            type="datetime-local"
            value={sleepStart}
            onChange={(e) => setSleepStart(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label>
          <div>Sleep End</div>
          <input
            type="datetime-local"
            value={sleepEnd}
            onChange={(e) => setSleepEnd(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </label>
      </div>

      <button
        onClick={saveSleepNight}
        style={{ padding: "10px 16px", marginBottom: 30 }}
      >
        Save Night
      </button>

      <hr style={{ margin: "30px 0" }} />

      <h2 style={{ fontSize: 22, marginBottom: 10 }}>
        What do YOU think affected tonight?
      </h2>

      <textarea
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        placeholder="Example: Mental overdrive, stress, substance, heat..."
        style={{ width: "100%", padding: 10, minHeight: 80 }}
      />

      <button
        onClick={saveDriverConfirmation}
        style={{ padding: "10px 16px", marginTop: 12 }}
      >
        Save Confirmation
      </button>

      {status && (
        <div style={{ marginTop: 20, color: "green" }}>{status}</div>
      )}

      {error && (
        <div style={{ marginTop: 20, color: "red" }}>{error}</div>
      )}
    </main>
  );
}
