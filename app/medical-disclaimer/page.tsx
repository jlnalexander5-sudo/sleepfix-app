"use client";

import React from "react";

export default function DisclaimerPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 18px", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 30, fontWeight: 600, color: "#1e3a8a", marginBottom: 10 }}>
        Medical Disclaimer
      </h1>

      <section className="sf-card" style={{ padding: 22, marginTop: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>1. Purpose of SleepFixMe</h2>
        <p>
          SleepFixMe is a self-observation and sleep investigation application. It helps users record sleep experiences,
          examine possible contributing factors, compare observations, and explore individual responses to suggested protocols.
          It is not intended to diagnose, treat, cure, or prevent any disease or medical condition.
        </p>

        <h2 style={{ fontSize: 20, fontWeight: 600 }}>2. Experimental framework and limitations</h2>
        <p>
          SleepFixMe applies the Rhythmic Systems Model (RSM), an explanatory framework being explored through practical
          investigation. The app and its RSM-based interpretations have not been clinically validated as diagnostic or
          therapeutic methods. Findings, thresholds, risk indicators, and suggested explanations are provisional and may
          be incomplete, inaccurate, or influenced by factors not recorded in the app.
        </p>
        <p>
          An observed association between a factor and a change in sleep does not, by itself, establish that the factor
          caused the change. Users should treat app results as working observations rather than confirmed medical findings.
        </p>

        <h2 style={{ fontSize: 20, fontWeight: 600 }}>3. Not a substitute for healthcare</h2>
        <p>
          SleepFixMe does not provide professional medical advice, diagnosis, treatment, or personalised clinical care.
          Information provided through the app should not replace assessment by a qualified healthcare professional.
          Do not delay seeking medical advice because of an app result or recommendation.
        </p>

        <h2 style={{ fontSize: 20, fontWeight: 600 }}>4. Protocols and personal safety</h2>
        <p>
          Protocols and suggestions are optional tools for self-observation. Their suitability and effectiveness are not
          guaranteed. Stop any activity that causes discomfort or worsening symptoms, and do not follow suggestions that
          feel unsafe or conflict with advice from your healthcare professional.
        </p>
        <p>
          Do not start, stop, or change prescribed medicines, medical treatments, or prescribed medical devices based on
          SleepFixMe information without consulting the clinician responsible for your care.
        </p>

        <h2 style={{ fontSize: 20, fontWeight: 600 }}>5. When to seek medical attention</h2>
        <p>
          Consult a qualified healthcare professional for persistent or worsening insomnia, suspected sleep apnoea,
          breathing difficulties during sleep, excessive daytime sleepiness, pregnancy-related sleep concerns,
          chronic illness, medication-related concerns, mental health symptoms, or any other concerning symptoms.
          If you are dangerously sleepy, avoid driving or operating machinery until it is safe to do so.
        </p>
        <p>
          For an immediate medical emergency, such as severe chest pain, serious breathing difficulty, or loss of
          consciousness, seek emergency assistance. In Australia, call 000.
        </p>

        <h2 style={{ fontSize: 20, fontWeight: 600 }}>6. Accuracy and individual differences</h2>
        <p>
          Results depend on the information users enter and may change as additional observations are recorded.
          Different people may respond differently to similar conditions. No particular sleep improvement, outcome,
          or explanation is guaranteed.
        </p>
      </section>
    </main>
  );
}
