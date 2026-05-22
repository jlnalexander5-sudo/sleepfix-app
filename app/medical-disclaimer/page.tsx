"use client";

import React from "react";

export default function DisclaimerPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 18px", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, color: "var(--sf-brand)", marginBottom: 10 }}>
        Medical Disclaimer
      </h1>

      <section className="sf-card" style={{ padding: 22, marginTop: 20 }}>
        <p>
          SleepFixMe is a self-tracking and sleep-pattern support tool. It is not a medical device and does not diagnose,
          treat, cure, or prevent any disease or medical condition.
        </p>

        <p>
          Protocols, insights, and recommendations are for general self-observation and behavioural support only. They are
          not a substitute for professional medical advice, diagnosis, or treatment.
        </p>

        <p>
          Seek advice from a qualified healthcare professional if you have severe or persistent insomnia, suspected sleep
          apnoea, breathing problems, chest pain, fainting, dangerous fatigue, pregnancy-related concerns, chronic illness,
          medication concerns, mental health concerns, or any symptom that worries you.
        </p>

        <p>
          Do not follow any suggestion or protocol that feels unsafe, unsuitable, or inconsistent with advice from your
          healthcare provider.
        </p>
      </section>
    </main>
  );
}
