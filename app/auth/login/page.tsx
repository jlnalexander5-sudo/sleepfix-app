"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  // New visitors arriving through the marketing funnel see account creation first.
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  function track(eventName: string, params: Record<string, string> = {}) {
    if (typeof window === "undefined") return;

    const gtag = (window as typeof window & {
      gtag?: (...args: unknown[]) => void;
    }).gtag;

    if (typeof gtag === "function") {
      gtag("event", eventName, params);
    }
  }

  function changeMode(nextMode: "login" | "signup") {
    if (nextMode === mode) return;

    setMode(nextMode);
    setMsg("");

    track(
      nextMode === "signup" ? "app_signup_selected" : "app_login_selected",
      { source_page: "sleepfix_auth" }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === "login") {
        track("app_login_submit", { source_page: "sleepfix_auth" });

        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;

        track("app_login_success", { source_page: "sleepfix_auth" });
        window.location.href = "/protected/dashboard";
        return;
      }

      track("app_signup_submit", { source_page: "sleepfix_auth" });

      const emailRedirectTo = `${window.location.origin}/auth/callback?next=/protected/dashboard`;

      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { emailRedirectTo },
      });

      if (error) throw error;

      track("app_signup_success", { source_page: "sleepfix_auth" });

      window.location.href = `/auth/sign-up-success?email=${encodeURIComponent(
        cleanEmail
      )}`;
    } catch (err: any) {
      setMsg(err?.message ?? "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <main className="sf-entry-page">
      <div className="sf-entry-shell">
        <section className="sf-entry-intro">
          <div className="sf-entry-brand">
            <div className="sf-entry-mark" aria-hidden="true">
              ☾
            </div>
            <div>
              <strong>SleepFix</strong>
              <span>UNDERSTAND · INVESTIGATE · IMPROVE</span>
            </div>
          </div>

          <div className="sf-entry-copy">
            <div className="sf-entry-kicker">YOUR SLEEP INVESTIGATION</div>
            <h1>Start investigating your sleep.</h1>
            <p>
              SleepFix helps you record what happened, investigate one possible
              factor at a time, test focused responses, and build a personal
              record of what your sleep actually shows.
            </p>
          </div>

          <div className="sf-entry-steps">
            <article className="sf-entry-step sf-entry-step-profile">
              <div className="sf-entry-step-top">
                <span>STEP 1</span>
                <b>✓</b>
              </div>
              <h2>Profile</h2>
              <p>
                Set your usual sleep context so SleepFix can distinguish your
                normal conditions from possible disturbances.
              </p>
              <small>CONTEXT</small>
            </article>

            <article className="sf-entry-step sf-entry-step-focus">
              <div className="sf-entry-step-top">
                <span>STEP 2</span>
                <b>→</b>
              </div>
              <h2>Sleep</h2>
              <p>
                Record what happened during the night: sleep onset, quality,
                wake-ups, recovery, and anything that appeared disruptive.
              </p>
              <small>RECORD</small>
            </article>

            <article className="sf-entry-step sf-entry-step-focus">
              <div className="sf-entry-step-top">
                <span>STEP 3</span>
                <b>→</b>
              </div>
              <h2>Investigation</h2>
              <p>
                Examine one possible contributing factor at a time and build a
                record of the threshold or tolerance relationship you identify.
              </p>
              <small>INVESTIGATE</small>
            </article>

            <article className="sf-entry-step sf-entry-step-protocol">
              <div className="sf-entry-step-top">
                <span>STEP 4</span>
                <b>•</b>
              </div>
              <h2>Protocol</h2>
              <p>
                Use one focused action based on what SleepFix currently
                understands about the disruption you are dealing with.
              </p>
              <small>TEST</small>
            </article>

            <article className="sf-entry-step sf-entry-step-results">
              <div className="sf-entry-step-top">
                <span>STEP 5</span>
                <b>5</b>
              </div>
              <h2>Results</h2>
              <p>
                See what you have learned about your sleep: contributing
                factors, threshold findings, and the current explanation of
                your pattern.
              </p>
              <small>LEARN</small>
            </article>
          </div>

          <div className="sf-entry-benefits">
            <div>
              <span className="sf-entry-benefit-icon">▣</span>
              <strong>A clear structure</strong>
              <p>Turn nightly experience into an organised investigation.</p>
            </div>

            <div>
              <span className="sf-entry-benefit-icon">▥</span>
              <strong>Your own record</strong>
              <p>See what your sleep appears able to tolerate.</p>
            </div>

            <div>
              <span className="sf-entry-benefit-icon">↻</span>
              <strong>Keep learning</strong>
              <p>Retain findings and revisit them as circumstances change.</p>
            </div>
          </div>

          <div className="sf-entry-emphasis">
            The question is not simply what affected your sleep.
            <br />
            It is what the investigation actually shows about your sleep.
          </div>
        </section>

        <aside className="sf-auth-panel">
          <div className="sf-auth-card">
            <div className="sf-auth-brand-block">
              <div className="sf-auth-mark" aria-hidden="true">
                ☾
              </div>
              <strong>SleepFix</strong>
              <span>UNDERSTAND · INVESTIGATE · IMPROVE</span>
            </div>

            <div className="sf-auth-tabs" role="tablist" aria-label="Account">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signup"}
                className={mode === "signup" ? "active" : ""}
                onClick={() => changeMode("signup")}
              >
                Create account
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={mode === "login" ? "active" : ""}
                onClick={() => changeMode("login")}
              >
                Sign in
              </button>
            </div>

            <div className="sf-auth-heading">
              <h2>
                {mode === "signup"
                  ? "Create your account"
                  : "Welcome back"}
              </h2>
              <p>
                {mode === "signup"
                  ? "Start your sleep investigation with SleepFix."
                  : "Sign in to continue your SleepFix investigation."}
              </p>
            </div>

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
                  placeholder={
                    mode === "signup"
                      ? "Create a password (min 6 characters)"
                      : "Enter your password"
                  }
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={6}
                />
              </label>

              {msg ? <div className="sf-auth-message">{msg}</div> : null}

              <button
                className="sf-auth-button"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? mode === "login"
                    ? "Signing in..."
                    : "Creating account..."
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>

            <div className="sf-auth-switch-row">
              {mode === "login" ? (
                <>
                  Need an account?{" "}
                  <button type="button" onClick={() => changeMode("signup")}>
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button type="button" onClick={() => changeMode("login")}>
                    Sign in
                  </button>
                </>
              )}
            </div>

            <div className="sf-auth-note">
              {mode === "signup"
                ? "After creating your account, check your email to verify it before continuing."
                : "Your existing SleepFix account gives you access to your saved sleep investigation."}
            </div>
          </div>
        </aside>
      </div>

      <footer className="sf-entry-footer">
        <strong>SleepFix</strong>
        <span>An application of Rhythmic Systems</span>
      </footer>

      <style jsx>{`
        .sf-entry-page,
        .sf-entry-page * {
          box-sizing: border-box;
        }

        .sf-entry-page {
          --navy: #071a37;
          --ink: #09182e;
          --muted: #556d87;
          --blue: #176bd1;
          --line: #d7e3ef;
          --panel: #ffffff;
          min-height: 100vh;
          margin: 0;
          background:
            radial-gradient(
              circle at 18% 14%,
              rgba(37, 115, 214, 0.08),
              transparent 28%
            ),
            linear-gradient(135deg, #f7fbff 0%, #ffffff 53%, #f4f8fc 100%);
          color: var(--ink);
        }

        .sf-entry-shell {
          width: min(1500px, 100%);
          margin: 0 auto;
          padding: 42px 44px 34px;
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(390px, 0.75fr);
          gap: 46px;
          align-items: start;
        }

        .sf-entry-intro {
          min-width: 0;
        }

        .sf-entry-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 48px;
        }

        .sf-entry-mark,
        .sf-auth-mark {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          background: var(--navy);
          box-shadow: 0 10px 26px rgba(7, 26, 55, 0.15);
        }

        .sf-entry-mark {
          width: 58px;
          height: 58px;
          border-radius: 15px;
          font-size: 30px;
        }

        .sf-entry-brand strong {
          display: block;
          font-size: 31px;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .sf-entry-brand span {
          display: block;
          margin-top: 7px;
          color: #5d718a;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.13em;
        }

        .sf-entry-copy {
          max-width: 830px;
          margin-bottom: 34px;
        }

        .sf-entry-kicker {
          margin-bottom: 13px;
          color: var(--blue);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.09em;
          text-transform: uppercase;
        }

        .sf-entry-copy h1 {
          margin: 0 0 18px;
          max-width: 760px;
          font-size: clamp(48px, 5vw, 72px);
          line-height: 0.98;
          letter-spacing: -0.055em;
          color: var(--ink);
        }

        .sf-entry-copy p {
          margin: 0;
          max-width: 780px;
          color: var(--muted);
          font-size: 18px;
          line-height: 1.62;
        }

        .sf-entry-steps {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 14px;
          margin-top: 30px;
        }

        .sf-entry-step {
          min-height: 276px;
          padding: 22px 21px 20px;
          border: 1.5px solid var(--line);
          border-radius: 17px;
          background: #fff;
          display: flex;
          flex-direction: column;
        }

        .sf-entry-step-profile,
        .sf-entry-step-focus,
        .sf-entry-step-protocol {
          grid-column: span 2;
        }

        .sf-entry-step-results {
          grid-column: span 2;
        }

        .sf-entry-step-profile {
          border-color: #26a85d;
          background: #f0fbf4;
        }

        .sf-entry-step-focus {
          border-color: #6258f5;
          background: #f3f4ff;
        }

        .sf-entry-step-protocol {
          border-color: #f39a14;
          background: #fffaf0;
        }

        .sf-entry-step-results {
          background: #fff;
        }

        .sf-entry-step-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .sf-entry-step-top span,
        .sf-entry-step small {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.02em;
        }

        .sf-entry-step-top b {
          color: #111;
          font-size: 20px;
        }

        .sf-entry-step-profile .sf-entry-step-top span,
        .sf-entry-step-profile small {
          color: #008e3a;
        }

        .sf-entry-step-focus .sf-entry-step-top span,
        .sf-entry-step-focus small {
          color: #4234df;
        }

        .sf-entry-step-protocol .sf-entry-step-top span,
        .sf-entry-step-protocol small {
          color: #bf6200;
        }

        .sf-entry-step-results .sf-entry-step-top span,
        .sf-entry-step-results small {
          color: #687a90;
        }

        .sf-entry-step h2 {
          margin: 23px 0 11px;
          font-size: 24px;
          letter-spacing: -0.025em;
        }

        .sf-entry-step p {
          margin: 0;
          color: #4f657f;
          font-size: 14px;
          line-height: 1.58;
        }

        .sf-entry-step small {
          margin-top: auto;
          padding-top: 22px;
        }

        .sf-entry-benefits {
          margin-top: 31px;
          padding-top: 28px;
          border-top: 1px solid var(--line);
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 25px;
        }

        .sf-entry-benefits > div {
          min-width: 0;
        }

        .sf-entry-benefit-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
          border-radius: 50%;
          background: #e8f3ff;
          color: var(--blue);
          font-size: 22px;
          font-weight: 900;
        }

        .sf-entry-benefits strong {
          display: block;
          margin-bottom: 7px;
          font-size: 17px;
        }

        .sf-entry-benefits p {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.5;
        }

        .sf-entry-emphasis {
          margin-top: 25px;
          padding: 17px 19px;
          border-left: 4px solid var(--blue);
          border-radius: 7px;
          background: #eaf4ff;
          color: #123e7b;
          font-size: 16px;
          line-height: 1.48;
          font-weight: 850;
        }

        .sf-auth-panel {
          position: sticky;
          top: 30px;
        }

        .sf-auth-card {
          padding: 34px 30px 30px;
          border: 1px solid #dbe6f0;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 24px 60px rgba(24, 55, 93, 0.1);
        }

        .sf-auth-brand-block {
          text-align: center;
          margin-bottom: 31px;
        }

        .sf-auth-mark {
          width: 86px;
          height: 86px;
          margin: 0 auto 14px;
          border-radius: 22px;
          font-size: 43px;
        }

        .sf-auth-brand-block strong {
          display: block;
          font-size: 31px;
          line-height: 1;
          letter-spacing: -0.035em;
        }

        .sf-auth-brand-block span {
          display: block;
          margin-top: 8px;
          color: #60748e;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 0.12em;
        }

        .sf-auth-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          margin-bottom: 31px;
          border-radius: 10px;
          background: #f5f7fa;
          overflow: hidden;
        }

        .sf-auth-tabs button {
          position: relative;
          min-height: 50px;
          border: 0;
          background: transparent;
          color: #4e637c;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }

        .sf-auth-tabs button.active {
          background: #fff;
          color: var(--blue);
        }

        .sf-auth-tabs button.active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 3px;
          background: var(--blue);
        }

        .sf-auth-heading h2 {
          margin: 0 0 8px;
          font-size: 28px;
          letter-spacing: -0.03em;
        }

        .sf-auth-heading p {
          margin: 0 0 25px;
          color: var(--muted);
          font-size: 15px;
          line-height: 1.5;
        }

        .sf-auth-form {
          display: grid;
          gap: 18px;
        }

        .sf-auth-label {
          display: grid;
          gap: 8px;
          color: #17304e;
          font-size: 14px;
          font-weight: 800;
        }

        .sf-auth-input {
          width: 100%;
          height: 52px;
          border: 1px solid #cbd8e6;
          border-radius: 8px;
          background: #fff;
          padding: 0 14px;
          color: #10243f;
          font: inherit;
          outline: none;
        }

        .sf-auth-input:focus {
          border-color: #5995db;
          box-shadow: 0 0 0 3px rgba(23, 107, 209, 0.1);
        }

        .sf-auth-input::placeholder {
          color: #93a4b7;
        }

        .sf-auth-message {
          padding: 11px 13px;
          border: 1px solid #e7c6c6;
          border-radius: 8px;
          background: #fff7f7;
          color: #9d3131;
          font-size: 13px;
          line-height: 1.45;
        }

        .sf-auth-button {
          min-height: 53px;
          border: 0;
          border-radius: 8px;
          background: linear-gradient(90deg, #176bd1, #287ee0);
          color: #fff;
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 10px 24px rgba(23, 107, 209, 0.2);
        }

        .sf-auth-button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .sf-auth-switch-row {
          margin-top: 22px;
          text-align: center;
          color: #60758e;
          font-size: 13px;
        }

        .sf-auth-switch-row button {
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--blue);
          font: inherit;
          text-decoration: underline;
          cursor: pointer;
        }

        .sf-auth-note {
          margin-top: 23px;
          padding-top: 19px;
          border-top: 1px solid #e2e9f0;
          color: #70839a;
          font-size: 12px;
          line-height: 1.5;
          text-align: center;
        }

        .sf-entry-footer {
          width: min(1500px, 100%);
          margin: 0 auto;
          padding: 0 44px 35px;
          display: flex;
          justify-content: space-between;
          gap: 20px;
          color: #6c8097;
          font-size: 12px;
        }

        .sf-entry-footer strong {
          color: var(--ink);
          font-size: 18px;
        }

        @media (max-width: 1120px) {
          .sf-entry-shell {
            grid-template-columns: 1fr;
          }

          .sf-auth-panel {
            position: static;
          }

          .sf-auth-card {
            max-width: 640px;
            margin: 0 auto;
          }
        }

        @media (max-width: 820px) {
          .sf-entry-shell {
            padding: 28px 20px 30px;
          }

          .sf-entry-brand {
            margin-bottom: 34px;
          }

          .sf-entry-copy h1 {
            font-size: clamp(42px, 12vw, 58px);
          }

          .sf-entry-steps {
            grid-template-columns: 1fr;
          }

          .sf-entry-step-profile,
          .sf-entry-step-focus,
          .sf-entry-step-protocol,
          .sf-entry-step-results {
            grid-column: auto;
            min-height: 0;
          }

          .sf-entry-benefits {
            grid-template-columns: 1fr;
          }

          .sf-entry-footer {
            padding: 0 20px 28px;
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (max-width: 520px) {
          .sf-entry-brand strong {
            font-size: 26px;
          }

          .sf-entry-brand span {
            display: none;
          }

          .sf-auth-card {
            padding: 26px 20px 24px;
          }

          .sf-entry-emphasis br {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
