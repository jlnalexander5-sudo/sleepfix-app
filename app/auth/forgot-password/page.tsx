"use client";

import { useState } from "react";
import { createClient } from "@/lib/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://sleepfix-app.vercel.app";

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/auth/update-password`,
    });

    if (error) setError(error.message);
    else setMessage("Check your email for the reset link.");

    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
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
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      {message && <p style={{ marginTop: 12 }}>{message}</p>}
      {error && <p style={{ marginTop: 12, color: "red" }}>{error}</p>}
    </div>
  );
}
