'use client';

import React from 'react';

type Insight = {
  domain: string;
  title: string;
  why: string[];
  actions: string[];
  confidence: 'low' | 'medium' | 'high';
};

export default function RRSMInsightCard({
  insight,
  className = '',
}: {
  insight: Insight | null;
  className?: string;
}) {
  if (!insight) {
    return (
      <div className={`rounded-2xl border bg-white p-5 ${className}`}>
        <div className="text-sm font-semibold">RRSM: what to do next</div>
        <div className="mt-2 text-sm text-neutral-600">
          No RRSM insight yet. Add a few nights in Sleep.
        </div>
      </div>
    );
  }

  const confidenceText =
    insight.confidence === 'high'
      ? 'High'
      : insight.confidence === 'medium'
        ? 'Medium'
        : 'Low';

  const confidenceClass =
    insight.confidence === 'high'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : insight.confidence === 'medium'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-rose-50 text-rose-800 border-rose-200';

  return (
    <div className={`rounded-2xl border bg-white p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">RRSM: what to do next</div>
          <div className="mt-3 rounded-xl border bg-neutral-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
              {insight.domain || 'RRSM'}
            </div>

            <div className="mt-2 text-lg font-semibold leading-snug text-neutral-900">
              {insight.title}
            </div>
          </div>
        </div>

        <span
          className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${confidenceClass}`}
          title="How confident RRSM is in this suggestion (based on your recent data)"
        >
          {confidenceText}
        </span>
      </div>

      <div className="mt-4 space-y-4 text-sm leading-relaxed text-neutral-800">
        <div>
          <div className="text-sm font-semibold text-neutral-900">Why</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-700">
            {insight.why.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-sm font-semibold text-neutral-900">Actions</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-700">
            {insight.actions.map((a, idx) => (
              <li key={idx}>{a}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 text-xs text-neutral-500">
        Tip: RRSM is using patterns across recent nights. The more you log, the more accurate it becomes.
      </div>
    </div>
  );
}
