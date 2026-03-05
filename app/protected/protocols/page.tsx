'use client';

import React, { useEffect, useMemo, useState } from "react";

type Protocol = {
  id: string;
  title: string;
  bestFor: string;
  steps: string[];
};

const PROTOCOLS: Protocol[] = [
  {
    id: "pre-sleep-discharge",
    title: "Pre-Sleep Discharge Protocol",
    bestFor: "Best for: sleep onset resistance, racing mind / \u201ccan\u2019t switch off\u201d.",
    steps: ["Remove rhythmic stimulation: no music, no scrolling, no complex thought, no narrative replay.", "Breath as the rhythm governor: inhale 4s \u2192 pause 2s \u2192 exhale 6s \u2192 pause 2s. Keep it gentle (no breath holds).", "Keep it simple: if your mind re-engages, return to the breathing pattern without trying to \u201csolve\u201d anything."],
  },
  {
    id: "rb2-deceleration",
    title: "RB2 Deceleration Protocol",
    bestFor: "Best for: over-activation, adrenaline / \u201cwired\u201d body, difficulty downshifting.",
    steps: ["Slow your inputs: dim light, reduce conversation, no task-switching.", "Longer exhale breathing: 6\u20138s exhale, 3\u20134s inhale, 10 cycles.", "Body downshift: scan jaw \u2192 throat \u2192 chest \u2192 belly and soften each area 2\u20133 breaths."],
  },
  {
    id: "internal-cooling",
    title: "Internal Cooling Protocol",
    bestFor: "Best for: \u201chot core / active mind\u201d feeling without needing cold temperature changes.",
    steps: ["Let awareness soften out to the soles of feet, back of knees, elbows, and palms.", "Do not \u201cfocus hard\u201d \u2014 just allow attention to spread.", "This reduces rhythmic concentration and helps the system downshift."],
  },
  {
    id: "sleep-entry-lock",
    title: "Sleep Entry Lock Protocol",
    bestFor: "Best for: sleep fragmentation, frequent awakenings, \u201cclarity spikes\u201d when drifting off.",
    steps: ["Once sleepy, don\u2019t re-engage thought (no checking, no planning).", "Let micro-images dissolve; don\u2019t \u201ctrack\u201d them.", "If clarity spikes, return to gentle breath and let sleep happen without effort."],
  },
  {
    id: "mental-discharge",
    title: "Mental Discharge Protocol",
    bestFor: "Best for: racing thoughts, anxiety, overstimulation.",
    steps: ["2-minute brain dump (write thoughts/tasks).", "10 slow breaths with longer exhale.", "Short, calming audio or silence."],
  },
  {
    id: "cooling-discharge",
    title: "Cooling Discharge Protocol",
    bestFor: "Best for: heat, restlessness, agitation at bedtime.",
    steps: ["Cool rinse/wash (face/hands) or cool cloth on neck for 30\u201360s.", "Slow breathing 10 cycles; soften shoulders/jaw.", "Lights low; keep stimuli minimal."],
  },
  {
    id: "doms-compression",
    title: "DOMS Compression Protocol",
    bestFor: "Best for: muscle soreness / physical strain disrupting sleep recovery.",
    steps: ["Gentle compression (socks / light wraps) or weighted blanket (light).", "Legs elevated 5\u201310 minutes if comfortable.", "Hydration + light stretch; keep it easy."],
  },
];

function getIdFromHash(hash: string): string | null {
  const h = (hash || "").replace("#", "").trim();
  return h ? h : null;
}

export default function ProtocolsPage() {
  const [hashId, setHashId] = useState<string | null>(null);

  useEffect(() => {
    const apply = () => setHashId(getIdFromHash(window.location.hash));
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const selected: Protocol = useMemo(() => {
    const id = hashId;
    if (id) {
      const found = PROTOCOLS.find((p) => p.id === id);
      if (found) return found;
    }
    // default: show the first protocol
    return PROTOCOLS[0];
  }, [hashId]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">RRSM Protocols</h1>
      <p className="mt-2 text-base text-gray-600">
        This page shows <span className="font-semibold">one</span> protocol at a time. Your dashboard links here
        and opens the recommended protocol automatically.
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-600">
          Showing: <span className="font-semibold text-gray-900">{selected.title}</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600" htmlFor="protocolSelect">Switch protocol</label>
          <select
            id="protocolSelect"
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
            value={selected.id}
            onChange={(e) => {
              window.location.hash = e.target.value;
            }}
          >
            {PROTOCOLS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-blue-900" id={selected.id}>
          {selected.title}
        </h2>
        <p className="mt-2 text-base text-gray-700">{selected.bestFor}</p>

        <h3 className="mt-6 text-lg font-bold text-gray-900">Steps</h3>
        <ol className="mt-3 list-decimal space-y-3 pl-6 text-base text-gray-800">
          {selected.steps.map((s, idx) => (
            <li key={idx} className="leading-relaxed">
              {s}
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
          Tip: Don’t overdo it. Use the protocol for 2–3 nights, then compare your metrics.
        </div>
      </div>

      <div className="mt-6 text-sm text-gray-500">
        Deep links supported: <span className="font-mono">/protected/protocols#sleep-entry-lock</span>
      </div>
    </div>
  );
}
