import React from "react";

export type RRSMInsight = {
  domain?: string;
  title?: string;
  why?: string[];
  actions?: string[];
  confidence?: "low" | "med" | "high";
};

function prettyDomain(s: string) {
  // keep your existing logic if you already have it
  return s.replace(/\s+/g, " ").trim();
}

export default function RRSMInsightCard({ insight }: { insight: RRSMInsight }) {
  const domainRaw = insight.domain ?? "Unknown domain";
  const domain = prettyDomain(domainRaw);

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>{domain}</div>

      {insight.title && (
        <div style={{ marginTop: 6, fontWeight: 700, opacity: 0.95 }}>
          {insight.title}
        </div>
      )}

      {Array.isArray(insight.why) && insight.why.length > 0 && (
        <>
          <div style={{ marginTop: 10, fontWeight: 700, opacity: 0.9 }}>Why</div>
          <ul style={{ marginTop: 6 }}>
            {insight.why.map((w, i) => (
              <li key={i} style={{ opacity: 0.9 }}>{w}</li>
            ))}
          </ul>
        </>
      )}

      {Array.isArray(insight.actions) && insight.actions.length > 0 && (
        <>
          <div style={{ marginTop: 10, fontWeight: 700, opacity: 0.9 }}>Actions</div>
          <ul style={{ marginTop: 6 }}>
            {insight.actions.map((a, i) => (
              <li key={i} style={{ opacity: 0.9 }}>{a}</li>
            ))}
          </ul>
        </>
      )}

      {insight.confidence && (
        <div style={{ marginTop: 10, opacity: 0.75 }}>
          Confidence: <b>{insight.confidence}</b>
        </div>
      )}
    </div>
  );
}
