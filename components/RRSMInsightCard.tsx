// components/RRSMInsightCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { getProtocolByName } from "@/lib/rrsm/protocols";

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


function splitCombinedWhyLines(lines: string[] | undefined): string[] {
  if (!lines) return [];
  const out: string[] = [];
  for (const raw of lines) {
    const line = String(raw ?? "").trim();
    if (!line) continue;

    // Split cases where two labels are jammed into one bullet
    // e.g. "Latency band: Fast. Wake band: Many."
    const parts = line.split(/\s+(?=Wake band:|Mismatch:|Recommended protocol family:)/);
    if (parts.length > 1) {
      for (const p of parts) {
        const t = p.trim();
        if (t) out.push(t);
      }
    } else {
      out.push(line);
    }
  }
  return out;
}

function prettyConfidence(c: string | undefined): string {
  const v = (c ?? "").toLowerCase();
  if (!v) return "";
  if (v.includes("low")) return "low — early pattern only (log a few more nights)";
  if (v.includes("medium")) return "medium — enough data for a basic pattern";
  if (v.includes("high")) return "high — consistent pattern across nights";
  return c ?? "unknown";
}

function humanizeWhyLine(line: string): string {
  let t = line.trim();

  // More human labels
  t = t.replace(/^Latency band:/i, "Time to fall asleep:");
  t = t.replace(/^Wake band:/i, "Night waking:");
  t = t.replace(/^Dominant factor:/i, "Main sleep pattern:");
  t = t.replace(/^Primary driver:/i, "Main pattern:");
  t = t.replace(/^Sleep grade:/i, "Overall sleep:");
  t = t.replace(/^Risk score:/i, "Sleep risk score:");
  t = t.replace(/^Suggested protocol:/i, "Suggested plan:");
  t = t.replace(/^Recommended protocol family:/i, "Suggested approach:");

  // Mismatch wording
  if (/^Mismatch:/i.test(t)) {
    const n = Number((t.match(/-?\d+(?:\.\d+)?/) || [])[0]);
    if (!Number.isNaN(n)) {
      if (n === 0) return "Protocol fit: Good";
      return `Protocol fit: Off by ${n}`;
    }
    return "Protocol fit: Unknown";
  }

  // Friendly band words
  t = t.replace(/\bFast\b/g, "quick");
  t = t.replace(/\bMedium\b/g, "average");
  t = t.replace(/\bMany\b/g, "frequent");

  return t;
}

function extractSuggestedPlan(why?: string[] | null): string {
  if (!why?.length) return "";
  const line =
    why.find(l => /^Suggested\s+(plan|protocol)\s*:/i.test(l)) ?? "";
  if (!line) return "";

  // Strip label and common suffixes like "Mismatch: 0."
  let s = line.replace(/^Suggested\s+(plan|protocol)\s*:\s*/i, "").trim();
  s = s.replace(/\s*Mismatch:\s*-?\d+(\.\d+)?\.?/i, "").trim();

  // "No suggestion" should behave like empty
  if (/^no\s+suggestion\.?$/i.test(s)) return "";

  // If the engine ever returns multiple sentences, keep the first meaningful chunk
  s = s.split(".")[0].trim();
  return s;
}


function tidyActionLine(line: string): string {
  let t = line.trim();

  // Collapse duplicate prefixes like "Avoid: Avoid:"
  t = t.replace(/^(\w+):\s*\1:\s*/i, "$1: ");

  // Humanize label prefixes
  t = t.replace(/^Tonight:/i, "Tonight:");
  t = t.replace(/^Avoid:/i, "Avoid:");
  t = t.replace(/^Encouragement:/i, "Encouragement:");
  t = t.replace(/^Trend note:/i, "Trend note:");

  return t;
}


function ProtocolFeedback({ insightTitle, suggestedPlan }: { insightTitle: string; suggestedPlan: string }) {
  const storageKey = useMemo(() => "sleepfix_protocol_used_latest", []);
  const [protocolUsed, setProtocolUsed] = useState<null | boolean>(null);
  const [savedTick, setSavedTick] = useState(false);

  // Only show on "Tonight plan" insights (keeps UI clean during baseline messages)
  const shouldShow = useMemo(() => {
    const t = (insightTitle ?? "").toLowerCase();
    return (t.includes("Last Night") || t.includes("rrsm")) && (suggestedPlan ?? "").trim().length > 0;
  }, [insightTitle, suggestedPlan]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "true") setProtocolUsed(true);
      if (raw === "false") setProtocolUsed(false);
    } catch {}
  }, [storageKey]);

  function handle(used: boolean) {
    setProtocolUsed(used);
    setSavedTick(true);
    try {
      window.localStorage.setItem(storageKey, String(used));
    } catch {}
    window.setTimeout(() => setSavedTick(false), 1200);
  }

  if (!shouldShow) return null;

  return (
   <div
  style={{
    marginTop: 18,
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    background: "#ffffff",
    padding: 24,
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
  }}
>
      <div className="text-base font-semibold text-neutral-900">Protocol check</div>
      <div className="mt-1 text-base text-neutral-700">
        Suggested protocol: <span className="font-semibold">{suggestedPlan}</span>
        <div className="mt-1">Did you use it last night?</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handle(true)}
          className={
            "rounded-md border px-3 py-2 text-base font-semibold transition " +
            (protocolUsed === true
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100")
          }
          aria-pressed={protocolUsed === true}
        >
          ✔ Used protocol
        </button>

        <button
          type="button"
          onClick={() => handle(false)}
          className={
            "rounded-md border px-3 py-2 text-base font-semibold transition " +
            (protocolUsed === false
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100")
          }
          aria-pressed={protocolUsed === false}
        >
          ✖ Did not use
        </button>

        {savedTick ? (
          <span className="self-center text-base font-semibold text-green-700">
            Saved
          </span>
        ) : null}
      </div>

      <div className="mt-2 text-sm text-neutral-600">
        This helps SleepFix learn what works for you.
      </div>
    </div>
  );
}

function ProtocolDetails({ protocolName }: { protocolName: string }) {
  const protocol = useMemo(() => getProtocolByName(protocolName), [protocolName]);

  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"used" | "not_used" | null>(null);

  if (!protocol) return null;

  return (
    <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-5">
      <div className="text-base font-semibold text-neutral-900">Suggested protocol</div>
      <div className="mt-1 text-sm text-neutral-700">
        <span className="font-medium">{protocol.name}</span> — {protocol.oneLine}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
        >
          {open ? "Hide steps" : "View steps"}
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setChoice("used")}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              choice === "used"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
            }`}
          >
            ✓ Used protocol
          </button>
          <button
            type="button"
            onClick={() => setChoice("not_used")}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              choice === "not_used"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
            }`}
          >
            ✕ Did not use
          </button>
        </div>
      </div>

      <div className="mt-2 text-xs text-neutral-600">
        {choice ? "Saved for learning (local only for now)." : "This helps SleepFix learn what works for you."}
      </div>

      {open ? (
        <div className="mt-4">
          <div className="text-sm font-semibold text-neutral-900">Tonight steps</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
            {protocol.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>

          {protocol.avoid?.length ? (
            <>
              <div className="mt-4 text-sm font-semibold text-neutral-900">Avoid tonight</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
                {protocol.avoid.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          ) : null}

          {protocol.notes?.length ? (
            <>
              <div className="mt-4 text-sm font-semibold text-neutral-900">Notes</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
                {protocol.notes.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function RRSMInsightCard(props: {
  insight: RRSMInsight | null;
  loading?: boolean;
  error?: string | null;
  userInput?: RRSMUserInput;
}) {
  const { insight, loading, error, userInput } = props;
  const suggestedPlan = extractSuggestedPlan(insight?.why);

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

  const displayTitle = (() => {
    const raw = insight.title ?? "";
    if (/^Tonight\s+plan\s*:/i.test(raw)) {
      return raw.replace(/^Tonight\s+plan\s*:/i, "This night’s performance:").trim();
    }
    return raw;
  })();

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="text-sm font-semibold text-neutral-600">
        {(insight.code ?? "RRSM") + (insight.code ? " " : "")}
      </div>

      <div className="mt-1 text-lg font-bold text-neutral-900">{displayTitle}</div>


      <div className="mt-4">
        <div className="text-base font-semibold text-neutral-900">Why</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-neutral-700">
          {splitCombinedWhyLines(insight.why).map((line, i) => (
            <li key={i}>{humanizeWhyLine(line)}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <div className="text-base font-semibold text-neutral-900">Actions</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-neutral-700">
          {(insight.actions ?? []).map((line, i) => (
            <li key={i}>{tidyActionLine(line)}</li>
          ))}
        </ul>
      </div>

      {insight.confidence ? (
        <div className="mt-4 text-base text-neutral-700">
          Confidence: <span className="font-semibold">{prettyConfidence(insight.confidence)}</span>
        </div>
      ) : null}

    {suggestedPlan ? <ProtocolDetails protocolName={suggestedPlan} /> : null}
    </div>
  );
}
