"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type ProfileRow = {
  id: string;
  created_at: string;
  display_name: string | null;
  target_bedtime: string | null;   // Postgres time -> usually comes back like "22:30:00"
  target_wake_time: string | null; // same
};

function toHHMM(t: string | null) {
  if (!t) return "";
  // convert "22:30:00" -> "22:30"
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function ProtectedPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // form fields
  const [displayName, setDisplayName] = useState("");
  const [bedtime, setBedtime] = useState("");   // "HH:MM"
  const [wakeTime, setWakeTime] = useState(""); // "HH:MM"

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
        // If middleware protects this route, you usually won't hit this,
        // but it's good to handle it anyway.
        if (!cancelled) {
          setStatus("Not logged in.");
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;

      setUserId(user.id);
      setEmail(user.email ?? null);
      setStatus("Loading profile...");

      // 1) Try to read profile
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, created_at, display_name, target_bedtime, target_wake_time")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      if (profErr) {
        if (!cancelled) {
          setError(profErr.message);
          setStatus("Failed to load profile.");
          setLoading(false);
        }
        return;
      }

      // 2) If none exists, create one
      let finalProfile = prof;

      if (!finalProfile) {
        setStatus("Creating profile...");
        const { data: created, error: createErr } = await supabase
          .from("profiles")
          .insert({ id: user.id })
          .select("id, created_at, display_name, target_bedtime, target_wake_time")
          .single<ProfileRow>();

        if (createErr) {
          if (!cancelled) {
            setError(createErr.message);
            setStatus("Failed to create profile.");
            setLoading(false);
          }
          return;
        }

        finalProfile = created;
      }

      if (cancelled) return;

      setProfile(finalProfile);
      setDisplayName(finalProfile.display_name ?? "");
      setBedtime(toHHMM(finalProfile.target_bedtime));
      setWakeTime(toHHMM(finalProfile.target_wake_time));

      setStatus("Ready.");
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function saveProfile() {
    if (!userId) return;

    setError(null);
    setStatus("Saving...");

    // Postgres "time" expects "HH:MM" or "HH:MM:SS"
    // We'll store "HH:MM:00" if user entered HH:MM
    const bed = bedtime ? `${bedtime}:00` : null;
    const wake = wakeTime ? `${wakeTime}:00` : null;

    const { data, error: upErr } = await supabase
      .from("profiles")
      .update({
        display_name: displayName || null,
        target_bedtime: bed,
        target_wake_time: wake,
      })
      .eq("id", userId)
      .select("id, created_at, display_name, target_bedtime, target_wake_time")
      .single<ProfileRow>();

    if (upErr) {
      setError(upErr.message);
      setStatus("Save failed.");
      return;
    }

    setProfile(data);
    setStatus("Saved ✅");
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Dashboard</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        {email ? `Signed in as ${email}` : "Signed in"}
      </p>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 8 }}>
          Status: {status}
        </div>

        {loading && <div>Loading...</div>}

        {error && (
          <div style={{ marginTop: 8, color: "salmon" }}>
            Error: {error}
          </div>
        )}
      </div>

      {!loading && (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Your sleep targets
          </h2>

          <label style={{ display: "block", marginBottom: 10 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Display name</div>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Julian"
              style={{ width: "100%", padding: 10, borderRadius: 8 }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Target bedtime</div>
              <input
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 8 }}
              />
            </label>

            <label style={{ display: "block" }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Target wake time</div>
              <input
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 8 }}
              />
            </label>
          </div>

          <button
            onClick={saveProfile}
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Save
          </button>

          <hr style={{ margin: "18px 0", opacity: 0.2 }} />

          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Raw profile JSON
          </h3>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, opacity: 0.9 }}>
            {JSON.stringify(profile, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
