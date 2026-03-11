"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";

type FAQItem = {
  question: string;
  answer: React.ReactNode;
};

type FAQSection = {
  id: string;
  title: string;
  intro?: string;
  items: FAQItem[];
};

function FAQAccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "16px 18px",
          background: "#fff",
          border: "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          fontSize: 16,
          fontWeight: 700,
        }}
        aria-expanded={isOpen}
      >
        <span>{item.question}</span>
        <span
          style={{
            fontSize: 20,
            lineHeight: 1,
            color: "#555",
            minWidth: 20,
            textAlign: "center",
          }}
        >
          {isOpen ? "−" : "+"}
        </span>
      </button>

      {isOpen ? (
        <div
          style={{
            padding: "0 18px 18px 18px",
            color: "#333",
            fontSize: 15,
            lineHeight: 1.7,
            borderTop: "1px solid #f0f0f0",
            background: "#fcfcfd",
          }}
        >
          <div style={{ paddingTop: 14 }}>{item.answer}</div>
        </div>
      ) : null}
    </div>
  );
}

export default function FAQPage() {
  const sections: FAQSection[] = useMemo(
    () => [
      {
        id: "getting-started",
        title: "Getting Started",
        intro: "Basic questions about what SleepFixMe is, how it works, and how much data it needs.",
        items: [
          {
            question: "What does SleepFixMe do?",
            answer: (
              <>
                <p>
                  SleepFixMe is a sleep analysis app that helps you track, interpret, and improve your sleep using the
                  <strong> RRSM model</strong>.
                </p>
                <p>
                  It does more than simply track sleep time. It looks for patterns in:
                </p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>sleep quality</li>
                  <li>time to fall asleep</li>
                  <li>night awakenings</li>
                  <li>daily behaviors</li>
                  <li>possible sleep drivers</li>
                  <li>protocol responses over time</li>
                </ul>
              </>
            ),
          },
          {
            question: "How many nights do I need to log before insights appear?",
            answer: (
              <>
                <p>
                  SleepFixMe needs at least <strong>3 complete nights</strong> to begin generating a basic RRSM insight.
                </p>
                <p>The more complete nights you log, the more reliable the analysis becomes.</p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>1–2 nights: very early signal only</li>
                  <li>3–6 nights: low confidence</li>
                  <li>7–13 nights: medium confidence</li>
                  <li>14+ nights: high confidence</li>
                </ul>
              </>
            ),
          },
          {
            question: "Why does SleepFixMe need multiple nights?",
            answer: (
              <>
                <p>
                  Sleep is a pattern problem, not just a single-night problem. One bad night does not necessarily show a
                  real trend.
                </p>
                <p>
                  Multiple nights help SleepFixME detect whether your issues are mainly about:
                </p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>recovery quality</li>
                  <li>sleep onset</li>
                  <li>fragmentation / awakenings</li>
                  <li>night-to-night instability</li>
                </ul>
              </>
            ),
          },
        ],
      },
      {
        id: "sleep-page",
        title: "Understanding the Sleep Page",
        intro: "Questions about the nightly recording page and what each input means.",
        items: [
          {
            question: "What does the Sleep page record?",
            answer: (
              <>
                <p>
                  The Sleep page records <strong>what happened during the night</strong>.
                </p>
                <p>It includes items such as:</p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>sleep start and end</li>
                  <li>sleep quality</li>
                  <li>sleep latency</li>
                  <li>wake ups</li>
                  <li>mental state</li>
                  <li>environmental conditions</li>
                  <li>body state</li>
                  <li>your best guess about what affected the night</li>
                </ul>
              </>
            ),
          },
          {
            question: "Why are some fields mandatory?",
            answer: (
              <>
                <p>
                  Some fields are required because the RRSM engine needs a minimum set of inputs to calculate a sleep
                  pattern.
                </p>
                <p>The most important required fields are:</p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>Sleep quality</li>
                  <li>Sleep latency</li>
                  <li>Wake ups</li>
                </ul>
                <p>
                  Without these, SleepFixMe cannot produce a reliable baseline insight.
                </p>
              </>
            ),
          },
          {
            question: "What is sleep latency?",
            answer: (
              <p>
                Sleep latency means <strong>how long it took you to fall asleep</strong> after trying to sleep.
              </p>
            ),
          },
          {
            question: "Why do I need to log wake ups?",
            answer: (
              <p>
                Wake ups help SleepFixMe measure <strong>fragmentation</strong>. Even if total sleep time seems okay,
                frequent awakenings can reduce recovery and destabilize sleep.
              </p>
            ),
          },
          {
            question: "What do the tags like mind state, environment, and body state do?",
            answer: (
              <>
                <p>
                  These tags help SleepFix understand which domain may be contributing to poor sleep.
                </p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li><strong>Mind state</strong>: thoughts, alertness, emotional state</li>
                  <li><strong>Environment</strong>: heat, noise, light, humidity, comfort</li>
                  <li><strong>Body state</strong>: pain, fatigue, tension, inflammation, restlessness</li>
                </ul>
              </>
            ),
          },
        ],
      },
      {
        id: "habits-page",
        title: "Understanding the Habits Page",
        intro: "Questions about why habits are separate from the sleep-page drivers.",
        items: [
          {
            question: "What is the Habits page for?",
            answer: (
              <>
                <p>
                  The Habits page records <strong>objective daily behaviors</strong>.
                </p>
                <p>Examples include:</p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>caffeine after 2pm</li>
                  <li>alcohol</li>
                  <li>exercise</li>
                  <li>screens in the last hour</li>
                </ul>
                <p>
                  These are logged separately so SleepFixMe can compare daytime inputs with nighttime outcomes.
                </p>
              </>
            ),
          },
          {
            question: "Why are Habits different from Drivers?",
            answer: (
              <>
                <p>
                  Habits are <strong>objective inputs</strong>. Drivers are your <strong>interpretation</strong>.
                </p>
                <p>Example:</p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>Habit: you ticked “Caffeine after 2pm”</li>
                  <li>Driver: you selected “Late caffeine” as something you think affected the night</li>
                </ul>
                <p>
                  SleepFixMe separates these on purpose, so it can compare what actually happened with what you believe
                  happened.
                </p>
              </>
            ),
          },
          {
            question: "Why does SleepFixMe need both habits and drivers?",
            answer: (
              <>
                <p>
                  Because the actual pattern is not always obvious from memory or intuition.
                </p>
                <p>
                  Sometimes users believe stress was the cause, but the repeated pattern may show stronger links with
                  caffeine timing, screens, or alcohol. Keeping both allows SleepFixMe to detect mismatches and hidden
                  drivers.
                </p>
              </>
            ),
          },
        ],
      },
      {
        id: "rrsm",
        title: "RRSM Explained",
        intro: "Questions about the RRSM model, scores, confidence, and risk.",
        items: [
          {
            question: "What is RRSM?",
            answer: (
              <>
                <p>
                  RRSM stands for <strong>Radial Resonance Sleep Model</strong>.
                </p>
                <p>
                  In SleepFixMe, RRSM organizes sleep analysis into four practical domains:
                </p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li><strong>Recovery</strong> — how restorative sleep felt</li>
                  <li><strong>Onset</strong> — how easily you fell asleep</li>
                  <li><strong>Fragmentation</strong> — how often sleep was interrupted</li>
                  <li><strong>Stability</strong> — how consistent sleep is across nights</li>
                </ul>
              </>
            ),
          },
          {
            question: "What is the RRSM risk score?",
            answer: (
              <>
                <p>
                  RRSM risk is a simple signal of how disrupted your current sleep pattern appears to be.
                </p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li><strong>Low</strong>: sleep looks relatively stable</li>
                  <li><strong>Moderate</strong>: some disruption or irregularity is emerging</li>
                  <li><strong>High</strong>: a stronger disruption pattern is present</li>
                </ul>
              </>
            ),
          },
          {
            question: "What is the Stability Score?",
            answer: (
              <>
                <p>
                  The Stability Score measures how consistent your sleep metrics are from night to night.
                </p>
                <p>
                  If your sleep quality, latency, and wake ups vary wildly across nights, the score drops. If those
                  metrics stay more consistent, the score rises.
                </p>
              </>
            ),
          },
          {
            question: "What does confidence mean?",
            answer: (
              <>
                <p>
                  Confidence tells you how reliable the current pattern estimate is, based mainly on how many complete
                  nights have been logged.
                </p>
                <p>
                  Low confidence does not mean the insight is wrong. It means the app still needs more data before it
                  can speak more strongly.
                </p>
              </>
            ),
          },
          {
            question: "Why does the app say 'Nothing / no clear driver'?",
            answer: (
              <>
                <p>
                  That means no clearly dominant driver has emerged yet from the information logged.
                </p>
                <p>
                  This can happen when:
                </p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>not enough nights have been logged</li>
                  <li>different drivers are appearing on different nights</li>
                  <li>the real pattern is still too mixed to identify confidently</li>
                </ul>
              </>
            ),
          },
        ],
      },
      {
        id: "drivers",
        title: "Sleep Drivers",
        intro: "Questions about what drivers mean and how they are used.",
        items: [
          {
            question: "What is a sleep driver?",
            answer: (
              <>
                <p>
                  A sleep driver is a <strong>possible influence on the night</strong>.
                </p>
                <p>Examples include:</p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>stress / worry</li>
                  <li>late caffeine</li>
                  <li>screen time</li>
                  <li>alcohol</li>
                  <li>too hot / too cold</li>
                  <li>noise</li>
                  <li>pain or discomfort</li>
                </ul>
              </>
            ),
          },
          {
            question: "Are drivers confirmed causes?",
            answer: (
              <p>
                No. Drivers are not medical or scientific proof by themselves. They are signals that SleepFixMe combines
                with patterns and habits over time.
              </p>
            ),
          },
          {
            question: "What if I do not know what affected the night?",
            answer: (
              <p>
                You can choose <strong>Nothing / no clear driver</strong>. SleepFixMe can still work with your sleep
                metrics and habits data.
              </p>
            ),
          },
        ],
      },
      {
        id: "protocols",
        title: "Protocols",
        intro: "Questions about recommended protocols and how to use them.",
        items: [
          {
            question: "What is a protocol?",
            answer: (
              <>
                <p>
                  A protocol is a short, targeted strategy recommended by SleepFixMe based on your current pattern.
                </p>
                <p>Examples include:</p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>Sleep Entry Lock Protocol</li>
                  <li>Mental Discharge Protocol</li>
                  <li>Cooling Discharge Protocol</li>
                  <li>DOMS Compression Protocol</li>
                  <li>Internal Cooling Protocol</li>
                </ul>
              </>
            ),
          },
          {
            question: "Why is a protocol recommended?",
            answer: (
              <p>
                SleepFixMe recommends a protocol when your current pattern suggests a specific area of support, such as
                sleep onset, fragmentation, or physical recovery.
              </p>
            ),
          },
          {
            question: "Do I have to use the recommended protocol?",
            answer: (
              <p>
                No. Protocols are optional. They are suggestions to help you test one structured change over several
                nights.
              </p>
            ),
          },
          {
            question: "Why does SleepFixMe ask whether I used a protocol?",
            answer: (
              <>
                <p>
                  This helps SleepFixMe learn whether the chosen protocol matched the pattern and whether your sleep
                  improved afterward.
                </p>
                <p>
                  Over time, that makes recommendations more meaningful.
                </p>
              </>
            ),
          },
        ],
      },
      {
        id: "data-security",
        title: "Data Privacy & Security",
        intro: "Questions about data handling, storage, and privacy.",
        items: [
          {
            question: "Is my sleep data private?",
            answer: (
              <>
                <p>
                  SleepFixMe is designed to keep your data private to your account.
                </p>
                <p>
                  Your records are stored in your app database and are tied to your authenticated user account.
                </p>
              </>
            ),
          },
          {
            question: "How is data secured?",
            answer: (
              <>
                <p>
                  SleepFixMe uses modern web app security practices, including authenticated access and encrypted
                  transmission over HTTPS.
                </p>
                <p>
                  Database access should be restricted so users can only access their own data.
                </p>
              </>
            ),
          },
          {
            question: "Does SleepFixMe sell or share my data?",
            answer: (
              <p>
                SleepFixMe should not sell or share your sleep data for advertising. It is intended to be a personal sleep
                analysis tool.
              </p>
            ),
          },
          {
            question: "Is SleepFixMe a medical system?",
            answer: (
              <p>
                No. SleepFixMe is a self-tracking and pattern-analysis tool. It is not a medical diagnostic device and
                does not replace professional healthcare advice.
              </p>
            ),
          },
        ],
      },
      {
        id: "troubleshooting",
        title: "Troubleshooting",
        intro: "Common questions when something does not save or looks wrong.",
        items: [
          {
            question: "Why did my night not save?",
            answer: (
              <>
                <p>Common reasons include:</p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>required fields were missing</li>
                  <li>a duplicate date was entered</li>
                  <li>a future date was entered</li>
                  <li>there was a temporary network or save error</li>
                </ul>
              </>
            ),
          },
          {
            question: "Why can’t I enter the same night twice?",
            answer: (
              <p>
                SleepFixMe prevents duplicate dates because duplicate nights would distort the pattern analysis and make
                the dashboard misleading.
              </p>
            ),
          },
          {
            question: "Why can’t I enter future dates?",
            answer: (
              <p>
                SleepFixMe only accepts completed nights. Future dates would break the time-based pattern logic.
              </p>
            ),
          },
          {
            question: "Why is my dashboard still low confidence?",
            answer: (
              <p>
                Low confidence usually means you do not yet have enough complete nights logged for a stable pattern.
              </p>
            ),
          },
        ],
      },
      {
        id: "science",
        title: "How SleepFixMe Works",
        intro: "A simple explanation of the reasoning behind the app.",
        items: [
          {
            question: "How does SleepFixMe generate insights?",
            answer: (
              <>
                <p>SleepFixMe combines several layers:</p>
                <ul style={{ margin: "10px 0 0 20px" }}>
                  <li>nightly sleep metrics</li>
                  <li>sleep tags and possible drivers</li>
                  <li>daily habits</li>
                  <li>pattern scoring across multiple nights</li>
                  <li>protocol matching</li>
                </ul>
                <p>
                  The system then looks for repeated patterns rather than judging one isolated night.
                </p>
              </>
            ),
          },
          {
            question: "Does SleepFixMe diagnose insomnia or sleep disorders?",
            answer: (
              <p>
                No. SleepFixMe can detect repeated patterns that may be useful for self-observation, but it does not
                diagnose medical sleep disorders.
              </p>
            ),
          },
          {
            question: "Why does SleepFixMe recommend one change at a time?",
            answer: (
              <p>
                Because changing multiple things at once makes it hard to know what actually helped. A targeted protocol
                or one clear adjustment gives cleaner feedback.
              </p>
            ),
          },
        ],
      },
    ],
    []
  );

  const [selectedSection, setSelectedSection] = useState<string>(sections[0].id);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const currentSection = sections.find((s) => s.id === selectedSection) ?? sections[0];

  function toggle(question: string) {
    setOpenMap((prev) => ({
      ...prev,
      [question]: !prev[question],
    }));
  }

  function openAllCurrent() {
    const next: Record<string, boolean> = { ...openMap };
    currentSection.items.forEach((item) => {
      next[item.question] = true;
    });
    setOpenMap(next);
  }

  function closeAllCurrent() {
    const next: Record<string, boolean> = { ...openMap };
    currentSection.items.forEach((item) => {
      next[item.question] = false;
    });
    setOpenMap(next);
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 800, color: "var(--sf-brand)" }}>FAQ</div>
          <div style={{ marginTop: 8, color: "#444", fontSize: 16, maxWidth: 760 }}>
            A help and explanation center for common questions, concerns, and deeper understanding of how SleepFixMe
            works.
          </div>
        </div>
      </div>

  <div
  className="sf-card"
  style={{
    marginTop: 20,
    padding: 18,
    maxWidth: 520,
  }}
>
        <div>
          <label
            htmlFor="faq-section"
            style={{ display: "block", fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#444" }}
          >
            Jump to section
          </label>

          <select
            id="faq-section"
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontSize: 15,
            }}
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.title}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={openAllCurrent}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Open all in section
            </button>

            <button
              onClick={closeAllCurrent}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Close all in section
            </button>
          </div>
        </div> 
        </div>
     <div
  style={{
    marginTop: 22,
    background: "rgba(60,80,255,0.05)",
    padding: 16,
    borderRadius: 12,
    transition: "all 0.2s ease",
  }}
>
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
  {currentSection.title}
</div>
{currentSection.intro ? (
  <div style={{ color: "#555", marginBottom: 16, fontSize: 15 }}>
    {currentSection.intro}
  </div>
) : null}  
       <div style={{ display: "grid", gap: 12 }}>
          {currentSection.items.map((item) => (
            <FAQAccordionItem
              key={item.question}
              item={item}
              isOpen={Boolean(openMap[item.question])}
              onToggle={() => toggle(item.question)}
            />
          ))}
        </div>
      </div>

      <div
        className="sf-card"
        style={{
          marginTop: 24,
          padding: 18,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Still not sure about something?</div>
          <div style={{ color: "#555", marginTop: 4 }}>
            Use the Dashboard, Sleep, Habits, and Protocols pages together — the FAQ is here to explain how those
            pieces fit.
          </div>
        </div>

      <div style={{ marginTop: 40, textAlign: "center" }}>
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      style={{
        padding: "10px 16px",
        borderRadius: 8,
        border: "1px solid #ccc",
        background: "#f8f8f8",
        cursor: "pointer",
      }}
    >
      Back to top
    </button>
  </div>
          </div>
      </div>
     );
}
