"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SLEEP_CONTEXT_OPTIONS = [
  "Regular schedule",
  "Night shift / rotating shift",
  "Irregular work hours",
  "Recent travel / jet lag",
  "Pregnancy",
  "Chronic illness",
  "Other",
] as const;

const WORK_CONTEXT_OPTIONS = [
  "Desk work",
  "Phone / screen-heavy work",
  "Driving most of the day",
  "Construction / physical labour",
  "Machinery / tools",
  "Talking / customer-facing work",
  "High-stress decision work",
  "Shift-based work",
  "Mostly standing",
  "Mostly sitting",
  "Other",
] as const;

function toggleOption(list: string[], option: string) {
  if (option === "Regular schedule") {
    return list.includes(option) ? [] : ["Regular schedule"];
  }

  const withoutRegular = list.filter((item) => item !== "Regular schedule");
  return withoutRegular.includes(option)
    ? withoutRegular.filter((item) => item !== option)
    : [...withoutRegular, option];
}

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [sleepContext, setSleepContext] = useState<string[]>([]);
  const [workContext, setWorkContext] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();

      if (authErr || !authData?.user) {
        if (!cancelled) {
          setError(authErr?.message ?? "Not signed in.");
          setLoading(false);
        }
        return;
      }

      const uid = authData.user.id;

      const { data, error: profileErr } = await supabase
        .from("rrsm_profiles")
        .select("sleep_context, work_context")
        .eq("user_id", uid)
        .maybeSingle();

      if (profileErr) {
        if (!cancelled) {
          setUserId(uid);
          setError(profileErr.message);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setUserId(uid);
        setSleepContext(Array.isArray(data?.sleep_context) ? data.sleep_context : []);
        setWorkContext(Array.isArray(data?.work_context) ? data.work_context : []);
        setLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function saveProfile() {
    if (!userId) return;

    setSaving(true);
    setNotice(null);
    setError(null);

    const payload = {
      user_id: userId,
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
      setNotice("Saved ✅");
    }

    setSaving(false);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">
        Sleep Context
      </h1>

      <p className="mt-2 text-gray-700">
        Set the background factors that can affect your sleep. This helps SleepFix avoid treating life-context limits as simple sleep habits.
      </p>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Your current sleep context</h2>
        <p className="mt-1 text-sm text-gray-600">
          Choose what applies. You do not need to change this every day.
        </p>

        {loading ? (
          <div className="mt-4 text-gray-600">Loading...</div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {SLEEP_CONTEXT_OPTIONS.map((option) => {
              const checked = sleepContext.includes(option);

              return (
                <label
                  key={option}
                  className={`rounded-xl border p-3 font-semibold ${
                    checked
                      ? "border-blue-700 bg-blue-50 text-blue-900"
                      : "border-gray-200 bg-white text-gray-900"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSleepContext((current) => toggleOption(current, option))}
                    className="mr-2"
                  />
                  {option}
                </label>
              );
            })}
          </div>
        )}


      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Daily work / activity pattern</h2>
        <p className="mt-1 text-sm text-gray-600">
          Choose what best describes your normal day. This helps SleepFix understand body load, mental load, screen load, and fatigue patterns.
        </p>

        {loading ? (
          <div className="mt-4 text-gray-600">Loading...</div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {WORK_CONTEXT_OPTIONS.map((option) => {
              const checked = workContext.includes(option);

              return (
                <label
                  key={option}
                  className={`rounded-xl border p-3 font-semibold ${
                    checked
                      ? "border-blue-700 bg-blue-50 text-blue-900"
                      : "border-gray-200 bg-white text-gray-900"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setWorkContext((current) =>
                        current.includes(option)
                          ? current.filter((item) => item !== option)
                          : [...current, option]
                      )
                    }
                    className="mr-2"
                  />
                  {option}
                </label>
              );
            })}
          </div>
        )}
      </section>

        <button
          type="button"
          onClick={saveProfile}
          disabled={loading || saving || !userId}
          className="mt-6 rounded-xl bg-black px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save sleep context"}
        </button>

        {notice ? (
          <div className="mt-3 font-semibold text-blue-900">{notice}</div>
        ) : null}

        {error ? (
          <div className="mt-3 font-semibold text-red-700">{error}</div>
        ) : null}
      </section>
    </main>
  );
}
