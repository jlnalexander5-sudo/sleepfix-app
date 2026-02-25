import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Keep types LOCAL to this module to avoid "Duplicate identifier" issues.
type Confidence = "low" | "medium" | "high";

export type RRSMInsight = {
  code: string;
  title: string;
  why: string[];
  actions: string[];
  confidence: Confidence;
};

type NightMetricsRow = {
  night_id: string;
  user_id: string;
  created_at: string;
  duration_min: number | null;
  latency_min: number | null;
  wakeups_count: number | null;
  quality_num: number | null;
};

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeInsight(args: {
  days: number;
  rows: NightMetricsRow[];
  context?: {
    primaryDriver?: string;
    secondaryDriver?: string;
    notes?: string;
    sleepStart?: string;
    sleepEnd?: string;
  };
}): RRSMInsight {
  const { rows } = args;

  // Basic heuristic (placeholder): detect variability in duration
  const durations = rows
    .map((r) => toNum(r.duration_min))
    .filter((n): n is number => typeof n === "number");

  if (durations.length >= 3) {
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance =
      durations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
      durations.length;
    const std = Math.sqrt(variance);

    // If std dev > ~60 minutes, call it high variability
    if (std >= 60) {
      return {
        code: "RB2/DN2",
        title: "Rhythm variability pattern detected",
        why: [
          "Your sleep duration varies a lot across recent nights (high variability).",
          "That makes your body \"guess\" when sleep is supposed to happen.",
        ],
        actions: [
          "Set a consistent wake time for 7 days (±30 min)",
          "If bedtime drifts late, still wake on schedule (use a 20–30 min nap max if needed)",
          "Lower stimulation for 60 min before bed (dim lights, no fast screens)",
        ],
        confidence: "high",
      };
    }
  }

  // Default insight
  return {
    code: "GEN/BASE",
    title: "No dominant pattern detected yet",
    why: [
      "Not enough stable data yet, or signals are mixed.",
      "Keep logging for a few nights to improve detection.",
    ],
    actions: [
      "Log 5–7 nights to let patterns emerge",
      "Try one small change at a time so effects are clearer",
    ],
    confidence: "medium",
  };
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({} as any))) as any;
  const days = Math.max(3, Math.min(30, Number(body?.days ?? 7)));

  // Pull last N days of metrics (adjust table/view name to yours if needed)
  const { data: rows, error: rowsErr } = await supabase
    .from("v_sleep_night_metrics")
    .select(
      "night_id,user_id,created_at,duration_min,latency_min,wakeups_count,quality_num"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(days);

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  const insight = computeInsight({
    days,
    rows: (rows ?? []) as NightMetricsRow[],
    context: {
      primaryDriver: body?.primaryDriver,
      secondaryDriver: body?.secondaryDriver,
      notes: body?.notes,
      sleepStart: body?.sleepStart,
      sleepEnd: body?.sleepEnd,
    },
  });

  return NextResponse.json({
    window: { days, count: (rows ?? []).length },
    insights: insight ? [insight] : [],
  });
}
