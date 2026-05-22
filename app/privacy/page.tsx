"use client";

import React from "react";

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 18px", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, color: "var(--sf-brand)", marginBottom: 10 }}>
        Privacy Policy
      </h1>

      <p style={{ color: "#555" }}>Last updated: 2026</p>

      <section className="sf-card" style={{ padding: 22, marginTop: 20 }}>
        <h2>1. Overview</h2>
        <p>
          This Privacy Policy explains how SleepFixMe handles information you provide when using the app. SleepFixMe is
          designed as a personal sleep-pattern tracking and protocol support tool.
        </p>

        <h2>2. Information we collect</h2>
        <p>SleepFixMe may collect information you enter into the app, including:</p>
        <ul>
          <li>account information, such as email address used to sign in</li>
          <li>sleep records, including sleep times, quality, latency, wake-ups, and awake time during the night</li>
          <li>sleep tags, including emotional state, mental state, room environment, body state, and sleep hygiene factors</li>
          <li>diary entries and notes you choose to save</li>
          <li>profile context, such as work pattern, sleep context, shift work, travel, pregnancy, or chronic illness selections</li>
          <li>protocol-use information, such as whether a recommended protocol was followed</li>
        </ul>

        <h2>3. How we use information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>save and display your sleep records</li>
          <li>generate sleep insights and protocol recommendations</li>
          <li>show dashboard trends and recent sleep patterns</li>
          <li>improve app functionality and user experience</li>
          <li>maintain account access and app security</li>
        </ul>

        <h2>4. Health-related information</h2>
        <p>
          Some information you enter may relate to health, sleep, body state, pregnancy, chronic illness, or wellbeing.
          You should only enter information you are comfortable storing in the app. SleepFixMe does not replace medical advice.
        </p>

        <h2>5. Data storage and security</h2>
        <p>
          SleepFixMe stores app data in a cloud database connected to authenticated user accounts. Reasonable technical
          safeguards should be used, including authenticated access, HTTPS transmission, and database access rules intended
          to restrict users to their own data.
        </p>

        <h2>6. Data sharing</h2>
        <p>
          SleepFixMe is not intended to sell your personal sleep data for advertising. Data may be processed by service
          providers used to operate the app, such as hosting, authentication, and database services.
        </p>

        <h2>7. User control</h2>
        <p>
          You may choose what information to enter. You may stop using the app at any time. Future account deletion or
          data export features may be added as the app develops.
        </p>

        <h2>8. Cookies and technical data</h2>
        <p>
          The app may use cookies, authentication tokens, browser storage, logs, or similar technologies required for login,
          security, app performance, and normal operation.
        </p>

        <h2>9. Children</h2>
        <p>
          SleepFixMe is not intended for children without appropriate parent or guardian involvement.
        </p>

        <h2>10. Changes to this policy</h2>
        <p>
          This Privacy Policy may be updated as the app develops. Continued use after changes means you accept the updated policy.
        </p>

        <h2>11. Contact</h2>
        <p>
          For privacy questions, contact SleepFixMe support through the contact details provided on the app or website.
        </p>
      </section>
    </main>
  );
}
