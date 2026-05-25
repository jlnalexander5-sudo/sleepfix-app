"use client";

import React, { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const FEEDBACK_CATEGORIES = [
  "Bug",
  "Confusing result",
  "Wrong protocol",
  "Something missing",
  "Suggestion",
  "Other",
];

export default function FeedbackPage() {
  const supabase = useMemo(() => createClient(), []);
  const [category, setCategory] = useState("Suggestion");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitFeedback() {
    setSaving(true);
    setSuccess(null);
    setError(null);

    const cleanMessage = message.trim();

    if (cleanMessage.length < 5) {
      setError("Please write a little more detail before sending.");
      setSaving(false);
      return;
    }

    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr || !authData?.user) {
      setError(authErr?.message ?? "Not signed in.");
      setSaving(false);
      return;
    }

    const { error: insertErr } = await supabase.from("user_feedback").insert({
      user_id: authData.user.id,
      category,
      message: cleanMessage,
      page:
        typeof window !== "undefined"
          ? window.location.pathname
          : "/protected/feedback",
    });

    if (insertErr) {
      setError(insertErr.message);
    } else {
      setSuccess("Feedback sent. Thank you — this helps improve SleepFix.");
      setMessage("");
      setCategory("Suggestion");
    }

    setSaving(false);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">
        Feedback
      </h1>

      <p className="mt-2 text-base text-gray-600">
        Tell us what felt confusing, wrong, annoying, missing, or useful. This
        helps improve the SleepFix engine and user experience.
      </p>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="text-sm font-bold text-gray-700">
          Type of feedback
        </label>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-2 w-full rounded-xl border border-gray-300 bg-white p-3 text-base"
        >
          {FEEDBACK_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <label className="mt-5 block text-sm font-bold text-gray-700">
          What should we know?
        </label>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Example: the protocol did not match my real issue, the wording was confusing, the app missed something, or I found a bug..."
          className="mt-2 min-h-[150px] w-full rounded-xl border border-gray-300 p-3 text-base"
        />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submitFeedback}
            disabled={saving || message.trim().length < 5}
            className="rounded-xl bg-blue-900 px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? "Sending..." : "Send feedback"}
          </button>

          {success ? (
            <span className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-bold text-green-700">
              {success}
            </span>
          ) : null}

          {error ? (
            <span className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">
              {error}
            </span>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-700">
        <div className="font-bold text-gray-900">Why this matters</div>
        <p className="mt-1">
          SleepFix is being refined through real sleep records and real user
          corrections. If the app misses something, that feedback helps identify
          the next engine improvement.
        </p>
      </section>
    </main>
  );
}
