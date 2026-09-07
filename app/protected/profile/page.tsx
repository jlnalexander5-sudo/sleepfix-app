"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RRSMProfileRow = {
  id?: string;
  user_id?: string;
  sleep_context?: string[] | null;
  work_context?: string[] | null;
  suspected_factors?: string | null;
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
  const [suspectedFactors, setSuspectedFactors] = useState("");

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
        .select("sleep_context,work_context,suspected_factors")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (!cancelled) {
        if (profileErr) {
          setError(profileErr.message);
        } else {
          const profile = (data ?? {}) as RRSMProfileRow;
          setSleepContext(Array.isArray(profile.sleep_context) ? profile.sleep_context : []);
          setWorkContext(Array.isArray(profile.work_context) ? profile.work_context : []);
          setSuspectedFactors(typeof profile.suspected_factors === "string" ? profile.suspected_factors : "");
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
      suspected_factors: suspectedFactors.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error: saveErr } = await supabase
      .from("rrsm_profiles")
      .upsert(payload, { onConflict: "user_id" });

    if (saveErr) {
      setError(saveErr.message);
    } else {
      setMessage("Saved successfully.");
    }

    setSaving(false);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">Profile</h1>
      <p className="mt-2 text-base text-gray-600">
        Tell SleepFix about your usual sleep and lifestyle context. These background details help the engine interpret
        nightly records, while your own view of what affects your sleep is stored separately for later comparison with
        Investigation findings.
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
            description="Choose the items that describe your usual sleep context. These are background clues, not confirmed causes."
            options={SLEEP_CONTEXT_OPTIONS}
            values={sleepContext}
            onChange={setSleepContext}
          />

          <CheckboxGrid
            title="Work / lifestyle context"
            description="Choose the work or lifestyle conditions that are commonly part of your routine."
            options={WORK_CONTEXT_OPTIONS}
            values={workContext}
            onChange={setWorkContext}
          />


          <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-6 shadow-sm">
            <h2 className="text-xl font-extrabold text-gray-900">Your own view</h2>
            <p className="mt-1 text-gray-700">
              What do you currently think affects your sleep?
            </p>
            <p className="mt-2 text-sm text-gray-600">
              This is your starting hypothesis. SleepFix stores it separately from the engine&apos;s profile weighting so
              your own suspicion does not become evidence simply because you entered it here. Later, it can be compared with
              what your Investigation actually shows.
            </p>

            <textarea
              value={suspectedFactors}
              onChange={(e) => setSuspectedFactors(e.target.value)}
              maxLength={1200}
              placeholder="Example: I think bedroom temperature, late caffeine, work stress, or exercise timing may be affecting my sleep..."
              className="mt-4 min-h-[130px] w-full rounded-xl border border-gray-300 bg-white p-3 text-base text-gray-900"
            />

            <div className="mt-2 text-right text-xs text-gray-500">
              {suspectedFactors.length}/1200
            </div>
          </section>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-extrabold text-gray-900">Why this matters</h2>
            <p className="mt-2 text-gray-700">
              The profile does not decide what is causing your insomnia. It gives SleepFix background context that can
              modify the engine&apos;s interpretation when the nightly sleep record points in the same direction. Your own
              suspected factors remain separate so they can be tested through Investigation rather than assumed to be true.
            </p>

         <div className="mt-5 flex flex-wrap items-center gap-4">
  <button
    type="button"
    onClick={saveProfile}
    disabled={saving}
    className="rounded-xl bg-blue-900 px-5 py-3 font-bold text-white disabled:opacity-60"
  >
    {saving ? "Saving..." : "Save profile"}
  </button>

  {message ? (
    <span className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-bold text-green-700">
      {message}
    </span>
  ) : null}

  {error ? (
    <span className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">
      {error}
    </span>
  ) : null}
</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
