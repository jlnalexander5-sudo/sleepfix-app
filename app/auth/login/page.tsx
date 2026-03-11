"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.href = "/protected/dashboard";
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMsg("Check your email to confirm your sign up.");
      }
    } catch (err: any) {
      setMsg(err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="sf-auth-page">
      <div className="sf-auth-shell">
        <div className="sf-auth-card">
          <div className="sf-auth-brand">SleepFixMe</div>
          <h1 className="sf-auth-title">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="sf-auth-subtitle">
            Sign in to access your sleep dashboard, habits, protocols, and RRSM insights.
          </p>

          <form onSubmit={handleSubmit} className="sf-auth-form">
            <label className="sf-auth-label">
              Email
              <input
                className="sf-auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="sf-auth-label">
              Password
              <input
                className="sf-auth-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </label>

            {msg ? <div className="sf-auth-message">{msg}</div> : null}

            <button className="sf-auth-button" type="submit" disabled={loading}>
              {loading
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Sign in"
                  : "Sign up"}
            </button>
          </form>

          <button
            type="button"
            className="sf-auth-switch"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMsg("");
            }}
          >
            {mode === "login"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </main>
  );
}
