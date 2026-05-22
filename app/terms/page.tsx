"use client";

import React from "react";

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 18px", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, color: "var(--sf-brand)", marginBottom: 10 }}>
        Terms and Conditions
      </h1>

      <p style={{ color: "#555" }}>Last updated: 2026</p>

      <section className="sf-card" style={{ padding: 22, marginTop: 20 }}>
        <h2>1. About SleepFixMe</h2>
        <p>
          SleepFixMe is a self-tracking and sleep-pattern support application. It helps users record sleep information,
          review patterns, and receive protocol suggestions based on the information they enter.
        </p>

        <h2>2. Not medical advice</h2>
        <p>
          SleepFixMe is not a medical device and does not provide medical diagnosis, treatment, or professional healthcare
          advice. The app is intended for personal tracking, education, and behavioural sleep support only.
        </p>
        <p>
          If you have severe, persistent, or worsening sleep problems, breathing issues during sleep, chest pain, fainting,
          dangerous daytime sleepiness, pregnancy-related concerns, medication concerns, chronic illness, or mental health
          concerns, seek advice from a qualified healthcare professional.
        </p>

        <h2>3. User responsibility</h2>
        <p>
          You are responsible for the information you enter and for how you choose to use the app&apos;s suggestions.
          Protocols are optional and should be used with common sense. Do not follow a protocol if it feels unsafe,
          unsuitable, or inappropriate for your situation.
        </p>

        <h2>4. Account use</h2>
        <p>
          You are responsible for keeping your account secure and for using the app lawfully. Do not attempt to access
          another user&apos;s data, disrupt the app, reverse engineer protected parts of the service, or misuse the platform.
        </p>

        <h2>5. Data accuracy</h2>
        <p>
          SleepFixMe depends on user-entered information. Recommendations may be incomplete, incorrect, or unsuitable if
          entries are missing, inaccurate, inconsistent, or affected by factors the app cannot detect.
        </p>

        <h2>6. Availability</h2>
        <p>
          SleepFixMe may be updated, interrupted, changed, or discontinued at any time. We do not guarantee uninterrupted
          access or error-free operation.
        </p>

        <h2>7. Intellectual property</h2>
        <p>
          SleepFixMe, including its app design, written material, RRSM/SRM-related explanations, protocols, structure,
          and related content, is proprietary unless otherwise stated. You may use the app for personal use, but you may
          not copy, reproduce, sell, or republish protected material without permission.
        </p>

        <h2>8. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, SleepFixMe and its owner are not liable for loss, injury, damage, or
          consequences arising from use of the app, reliance on app suggestions, inability to access the app, or user-entered
          information being incomplete or inaccurate.
        </p>

        <h2>9. Changes to these terms</h2>
        <p>
          These terms may be updated from time to time. Continued use of SleepFixMe after changes means you accept the
          updated terms.
        </p>

        <h2>10. Contact</h2>
        <p>
          For questions about these terms, contact SleepFixMe support through the contact details provided on the app or website.
        </p>
      </section>
    </main>
  );
}
