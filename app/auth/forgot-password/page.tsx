"use client";

import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const supabase = createBrowserSupabaseClient();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    // This is the key change: uses the domain the user is on right now
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://sleepfix-app.vercel.app";

    const redirectTo = `${origin}/auth/callback?next=/auth/update-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) setError(error.message);
    else setMessage("Check your email for the reset link.");

    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 420, margin: "48px auto" }}>
      <h1>Forgot password</h1>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", padding: 10, marginTop: 12 }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: 10, marginTop: 12 }}
        >
          {loading ? "Sending..." : "Send reset email"}
        </button>
      </form>

      {message && <p style={{ marginTop: 12 }}>{message}</p>}
      {error && <p style={{ marginTop: 12 }}>{error}</p>}
    </div>
  );
}
