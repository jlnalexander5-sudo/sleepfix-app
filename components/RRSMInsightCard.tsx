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
          {(insight.why ?? []).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <div className="text-base font-semibold text-neutral-900">Actions</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-neutral-700">
          {(insight.actions ?? []).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      {insight.confidence ? (
        <div className="mt-4 text-base text-neutral-700">
          Confidence: <span className="font-semibold">{insight.confidence}</span>
        </div>
      ) : null}
    </div>
  );
}
