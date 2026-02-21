"use client";

import React from "react";

export type RRSMInsight = {
  created_at: string;
  dominant_domain: string;
  dominance_pct: number;            // 0-100
  scores: Record<string, number>;   // domain -> score
  reasons: string[];                // why this result
  actions: string[];                // what to do next
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function prettyDomain(d: string) {
  return d.replace(/_/g, " ");
}

export default function RRSMInsightCard({
  insight,
}: {
  insight: RRSMInsight | null;
}) {
  if (!insight) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>RRSM Insight</div>
        <div style={{ marginTop: 8, opacity: 0.85 }}>
          No analysis yet. Once RRSM runs, your diagnosis + next steps will show here.
        </div>
      </div>
    );
  }

  const pct = clamp(insight.dominance_pct);
  const domain = prettyDomain(insight.dominant_domain);

  const sorted = Object.entries(insight.scores ?? {})
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 5);

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, opacity: 0.8 }}>RRSM Diagnosis</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
            {domain}
          </div>
          <div style={{ marginTop: 6, fontSize: 14, opacity: 0.85 }}>
            Dominance: <b>{pct}%</b>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Last updated</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
            {new Date(insight.created_at).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Dominance bar */}
      <div style={{ marginTop: 12 }}>
        <div style={barOuter}>
          <div style={{ ...barInner, width: `${pct}%` }} />
        </div>
      </div>

      {/* Top domains */}
      {sorted.length ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Top domains</div>
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {sorted.map(([k, v]) => {
              const p = clamp(Math.round((v / Math.max(1, sorted[0][1])) * 100));
              return (
                <div key={k} style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      opacity: 0.9,
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{prettyDomain(k)}</span>
                    <span style={{ fontWeight: 700 }}>{v}</span>
                  </div>
                  <div style={miniBarOuter}>
                    <div style={{ ...miniBarInner, width: `${p}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Reasons */}
      {insight.reasons?.length ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Why this showed up</div>
          <ul style={{ marginTop: 8, paddingLeft: 18, opacity: 0.9 }}>
            {insight.reasons.slice(0, 6).map((r, idx) => (
              <li key={idx} style={{ marginBottom: 6, lineHeight: 1.35 }}>
                {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Actions */}
      {insight.actions?.length ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>What to do next</div>
          <ul style={{ marginTop: 8, paddingLeft: 18, opacity: 0.9 }}>
            {insight.actions.slice(0, 5).map((a, idx) => (
              <li key={idx} style={{ marginBottom: 6, lineHeight: 1.35 }}>
                {a}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  padding: 16,
  border: "1px solid #333",
  background: "#1f1f1f",
  color: "white",
};

const barOuter: React.CSSProperties = {
  height: 10,
  borderRadius: 999,
  background: "#333",
  overflow: "hidden",
};

const barInner: React.CSSProperties = {
  height: 10,
  borderRadius: 999,
  background: "#8b5cf6",
};

const miniBarOuter: React.CSSProperties = {
  height: 8,
  borderRadius: 999,
  background: "#2f2f2f",
  overflow: "hidden",
};

const miniBarInner: React.CSSProperties = {
  height: 8,
  borderRadius: 999,
  background: "#22c55e",
};
