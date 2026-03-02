// components/RRSMInsightCard.tsx
"use client";

export type RRSMInsight = {
  domain?: string;        // optional domain label
  code?: string;          // e.g. "RB2 / DN2"
  title: string;          // e.g. "Rhythm variability pattern detected"
  why: string[];          // bullet lines
  actions: string[];      // bullet lines
  confidence?: "low" | "medium" | "high";
};

export type RRSMUserInput = {
  // New (preferred): multi-select drivers
  drivers?: string[] | null;

  // Backward compatible (older builds)
  primaryDriver?: string | null;
  secondaryDriver?: string | null;

  notes?: string | null;
};

function normalizeLine(s: string): string {
  // Remove accidental duplicated prefixes like "Avoid: Avoid: ..."
  const dupPrefix = s.match(/^([A-Za-z][A-Za-z\s]+):\s*\1:\s*/);
  if (dupPrefix) {
    return s.replace(/^([A-Za-z][A-Za-z\s]+):\s*\1:\s*/i, "$1: ");
  }
  return s;
}

function explodeLines(lines?: string[] | null): string[] {
  if (!lines || lines.length === 0) return [];
  const out: string[] = [];
  for (const raw of lines) {
    const line = normalizeLine(String(raw)).trim();
    if (!line) continue;

    // Split a few common “two facts in one bullet” patterns.
    if (line.includes("Latency band:") && line.includes("Wake band:")) {
      const parts = line.split(/\s*(?=Wake band:)/);
      out.push(...parts.map((p) => p.trim()).filter(Boolean));
      continue;
    }
    if (line.includes("Suggested protocol:") && line.includes("Mismatch:")) {
      const parts = line.split(/\s*(?=Mismatch:)/);
      out.push(...parts.map((p) => p.trim()).filter(Boolean));
      continue;
    }
    if (line.includes("Dominant factor:") && line.includes("Recommended protocol family:")) {
      const parts = line.split(/\s*(?=Recommended protocol family:)/);
      out.push(...parts.map((p) => p.trim()).filter(Boolean));
      continue;
    }

    out.push(line);
  }
  return out;
}

export default function RRSMInsightCard(props: {
  insight: RRSMInsight | null;
  loading?: boolean;
  error?: string | null;
  userInput?: RRSMUserInput;
}) {
  const { insight, loading, error, userInput } = props;

  if (loading) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="text-base text-neutral-600">Analyzing RRSM…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <div className="text-base font-semibold text-red-800">RRSM analyze failed</div>
        <div className="mt-1 text-base text-red-700">{error}</div>
      </div>
    );
  }

  if (!insight) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="text-base text-neutral-700 font-semibold">No RRSM insight yet</div>
        <div className="mt-1 text-base text-neutral-600">
          Not enough logged signals in your last window.
        </div>
      </div>
    );
  }

  const hasUserInput =
    !!userInput &&
    (
      (Array.isArray(userInput.drivers) && userInput.drivers.length > 0) ||
      !!userInput.primaryDriver ||
      !!userInput.secondaryDriver ||
      !!userInput.notes
    );

  const whyLines = explodeLines(insight.why);
  const actionLines = explodeLines(insight.actions);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="text-sm font-semibold text-neutral-600">
        {(insight.code ?? "RRSM") + (insight.code ? " " : "")}
      </div>

      <div className="mt-1 text-lg font-bold text-neutral-900">{insight.title}</div>

      {hasUserInput && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div className="text-base font-semibold text-neutral-900">Your input</div>
          <div className="mt-2 space-y-1 text-base text-neutral-700">
            {Array.isArray(userInput?.drivers) && userInput!.drivers!.length > 0 ? (
              <div>
                <span className="font-semibold">Drivers:</span> {userInput!.drivers!.join(", ")}
              </div>
            ) : null}
            {userInput?.primaryDriver ? (
              <div>
                <span className="font-semibold">Primary:</span> {userInput.primaryDriver}
              </div>
            ) : null}
            {userInput?.secondaryDriver ? (
              <div>
                <span className="font-semibold">Secondary:</span> {userInput.secondaryDriver}
              </div>
            ) : null}
            {userInput?.notes ? (
              <div>
                <span className="font-semibold">Notes:</span> {userInput.notes}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="text-base font-semibold text-neutral-900">Why</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-neutral-700">
          {whyLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <div className="text-base font-semibold text-neutral-900">Actions</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-neutral-700">
          {actionLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        {actionLines.some((l) => /^encouragement:/i.test(l)) ? (
          <div className="mt-2 text-sm text-neutral-600">
            “Encouragement” is just supportive context—your actual to-do items are the other bullets.
          </div>
        ) : null}
      </div>

      {insight.confidence ? (
        <div className="mt-4 text-base text-neutral-700">
          Confidence: <span className="font-semibold">{insight.confidence}</span>
          <div className="mt-1 text-sm text-neutral-600">
            {String(insight.confidence).toLowerCase() === "low"
              ? "Low = limited signal (often because you only have a few valid nights). As you log more consistent nights, confidence should rise."
              : String(insight.confidence).toLowerCase() === "medium"
                ? "Medium = enough signal for a solid first recommendation, but patterns may still change."
                : "High = strong, consistent signal across your recent window."}
          </div>
        </div>
      ) : null}
    </div>
  );
}
