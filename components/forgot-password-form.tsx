"use client";

import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function ForgotPasswordForm() {
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

    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || "https://sleepfix-app.vercel.app";

    const redirectTo = `${origin}/auth/callback?next=/auth/update-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
});

    if (error) setError(error.message);
    else setMessage("Check your email for the reset link.");

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <input
        type="email"
        value={email}
        placeholder="you@example.com"
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <button type="submit" disabled={loading}>
        {loading ? "Sending..." : "Send reset email"}
      </button>

      {message && <p style={{ color: "green" }}>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </form>
  );
}
