"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RRSMProfileRow = {
  id?: string;
  user_id?: string;
  sleep_context?: string[] | null;
  work_context?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const SLEEP_CONTEXT_OPTIONS = [
  "Usually sleeps cold",
  "Usually sleeps hot",
  "Temperature changes wake me",
  "Noise sensitive",
  "Light sensitive",
  "Partner affects sleep",
  "New mattress / bedding change",
  "Pain or discomfort affects sleep",
  "Mind stays active at night",
  "Wake-ups are the main issue",
  "Sleep onset is the main issue",
];

const WORK_CONTEXT_OPTIONS = [
  "Desk work / screen-heavy",
  "Physical labour",
  "Mostly standing",
  "Mostly driving",
  "Shift work",
  "Irregular schedule",
  "High-stress decisions",
  "Customer-facing / talking",
  "Early starts",
  "Late finishes",
  "Travel affects routine",
];

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function CheckboxGrid({
  title,
  description,
  options,
  values,
  onChange,
}: {
  title: string;
  description: string;
  options: string[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-extrabold text-gray-900">{title}</h2>
      <p className="mt-1 text-gray-600">{description}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const checked = values.includes(option);

          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(toggleValue(values, option))}
              className={`rounded-xl border px-4 py-3 text-left font-semibold ${
                checked
                  ? "border-blue-700 bg-blue-50 text-blue-950"
                  : "border-gray-200 bg-white text-gray-900"
              }`}
            >
              <span className="mr-2">{checked ? "☑" : "☐"}</span>
              {option}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sleepContext, setSleepContext] = useState<string[]>([]);
  const [workContext, setWorkContext] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);
      setMessage(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();

      if (authErr || !authData?.user) {
        if (!cancelled) {
          setError(authErr?.message ?? "Not signed in.");
          setLoading(false);
        }
        return;
      }

      const { data, error: profileErr } = await supabase
        .from("rrsm_profiles")
        .select("sleep_context,work_context")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (!cancelled) {
        if (profileErr) {
          setError(profileErr.message);
        } else {
          const profile = (data ?? {}) as RRSMProfileRow;
          setSleepContext(Array.isArray(profile.sleep_context) ? profile.sleep_context : []);
          setWorkContext(Array.isArray(profile.work_context) ? profile.work_context : []);
        }

        setLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setMessage(null);

    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr || !authData?.user) {
      setError(authErr?.message ?? "Not signed in.");
      setSaving(false);
      return;
    }

    const payload = {
      user_id: authData.user.id,
      sleep_context: sleepContext,
      work_context: workContext,
      updated_at: new Date().toISOString(),
    };

    const { error: saveErr } = await supabase
      .from("rrsm_profiles")
      .upsert(payload, { onConflict: "user_id" });

    if (saveErr) {
      setError(saveErr.message);
    } else {
      setMessage("Profile saved.");
    }

    setSaving(false);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">Profile</h1>
      <p className="mt-2 text-base text-gray-600">
        Tell SleepFix about your usual sleep context so the engine can interpret your nightly records more accurately.
      </p>

      {loading ? (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
          Loading profile...
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4 font-semibold text-green-700">
          {message}
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-6 grid gap-6">
          <CheckboxGrid
            title="Sleep context"
            description="Choose the patterns that commonly affect your sleep."
            options={SLEEP_CONTEXT_OPTIONS}
            values={sleepContext}
            onChange={setSleepContext}
          />

          <CheckboxGrid
            title="Work / lifestyle context"
            description="Choose the usual work or lifestyle context that may affect sleep."
            options={WORK_CONTEXT_OPTIONS}
            values={workContext}
            onChange={setWorkContext}
          />

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-extrabold text-gray-900">Why this matters</h2>
            <p className="mt-2 text-gray-700">
              The profile does not replace your nightly sleep record. It gives SleepFix background context so it can
              separate repeated patterns from one-off disruptions.
            </p>

            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="mt-5 rounded-xl bg-blue-900 px-5 py-3 font-bold text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
