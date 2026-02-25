import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type NightMetricsRow = {
  night_id: string;
  user_id: string;
  created_at?: string | null;
  duration_min?: number | null;
  latency_min?: number | null;
  wakeups_count?: number | null;
  quality_num?: number | null; // if you use 1–5
};

type RRSMInsight = {
  code: string;
  title: string;
  why: string[];
  actions: string[];
  confidence: Confidence;
};

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function median(nums: number[]) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function stdev(nums: number[]) {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((s, x) => s + x, 0) / nums.length;
  const v =
    nums.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (nums.length - 1);
  return Math.sqrt(v);
}


function minutesToHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalizeDriver(s?: string | null) {
  return (s ?? "").trim();
}

function driverAdvice(driver: string): { why: string; actions: string[]; code: string; confidence: Confidence } | null {
  const d = driver.toLowerCase();

  if (!d) return null;

  // Keep these very practical + non-medical.
  if (d.includes("stress") || d.includes("worry") || d.includes("anxiety")) {
    return {
      code: "RB3 / DN1 (arousal load)",
      confidence: "medium",
      why: "You flagged stress/worry. Elevated arousal makes it harder to fall asleep and stay asleep.",
      actions: [
        "10–15 min wind-down: slow breathing (e.g., 4s in / 6s out) or a short body scan",
        "Write a 3-line “worry dump” + 1 concrete next action for tomorrow",
        "Keep lights low and avoid fast content for the last 60 min before bed",
      ],
    };
  }

  if (d.includes("late meal") || d.includes("meal")) {
    return {
      code: "MT1 / DN2 (digestion timing)",
      confidence: "medium",
      why: "You flagged a late meal. Digestion and reflux risk can disrupt sleep and raise body temperature.",
      actions: [
        "Aim to finish your last substantial meal 2–3 hours before bed",
        "If hungry late: small snack (protein + fiber) rather than a heavy meal",
        "Keep the bedroom cooler and avoid alcohol close to bedtime",
      ],
    };
  }

  if (d.includes("screen") || d.includes("phone") || d.includes("blue")) {
    return {
      code: "ST1 / DN2 (stimulation)",
      confidence: "medium",
      why: "You flagged screen time. Bright light + stimulation can delay sleep onset.",
      actions: [
        "Set a 60 min “low-stimulation” window before bed",
        "Use warm/night mode + keep brightness low",
        "If you must use a screen: reading only, no scrolling/fast videos",
      ],
    };
  }

  if (d.includes("exercise")) {
    return {
      code: "PH1 / DN2 (training timing)",
      confidence: "medium",
      why: "You flagged exercise timing. Late intense exercise can keep arousal and core temperature high.",
      actions: [
        "If possible, keep intense exercise earlier in the day",
        "If evening training is required: end 2–3 hours before bed + longer cool-down",
        "Prefer lighter movement at night (walk, mobility work)",
      ],
    };
  }

  if (d.includes("temperature") || d.includes("heat") || d.includes("cold") || d.includes("environment")) {
    return {
      code: "EN1 / DN2 (sleep environment)",
      confidence: "medium",
      why: "You flagged temperature/environment. Sleep is sensitive to heat, noise, and light.",
      actions: [
        "Target a cooler room (fan / AC / lighter bedding)",
        "Reduce light + noise (blackout / white noise)",
        "If you wake hot: adjust bedding layers so you can vent quickly",
      ],
    };
  }

  return null;
}

function computeRRSMInsights(args: {
  days: number;
  rows: NightMetricsRow[];
  context?: {
    primaryDriver?: string;
    secondaryDriver?: string;
    notes?: string;
    sleepStart?: string;
    sleepEnd?: string;
  };
}): RRSMRRSMInsight[] {
  const { days, rows } = args;
  const ctx = args.context ?? {};

  if (!rows || rows.length === 0) return [];

  const durations = rows.map((r) => r.duration_min ?? null).filter((v): v is number => typeof v === "number");
  const latencies = rows.map((r) => r.latency_min ?? null).filter((v): v is number => typeof v === "number");
  const wakeups = rows.map((r) => r.wakeups_count ?? null).filter((v): v is number => typeof v === "number");
  const qualities = rows.map((r) => r.quality_num ?? null).filter((v): v is number => typeof v === "number");

  const insights: RRSMRRSMInsight[] = [];

  // Pattern 1: rhythm variability (duration variability)
  if (durations.length >= 4) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
    const stdev = Math.sqrt(variance);

    // variability threshold ~ 70 min
    if (stdev >= 70) {
      insights.push({
        code: "RB2 / DN2 (rhythm overload + compressed pause)",
        title: "Rhythm variability pattern detected",
        why: [
          `Your sleep duration varies a lot across recent nights (±${Math.round(stdev)} min).`,
          `That variability makes your body “guess” when sleep is supposed to happen.`,
        ],
        actions: [
          "Set a consistent wake time for 7 days (±30 min)",
          "If bedtime drifts late, still wake on schedule (use a 20–30 min nap max if needed)",
          "Lower stimulation for 60 min before bed (dim lights, no fast screens)",
        ],
        confidence: "high",
      });
    }
  }

  // Pattern 2: prolonged sleep onset
  if (latencies.length >= 3) {
    const avgLat = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    if (avgLat >= 30) {
      insights.push({
        code: "SO1 / DN2 (sleep onset delay)",
        title: "Long sleep-onset pattern",
        why: [`Your average time to fall asleep is ~${Math.round(avgLat)} minutes (goal: <20).`],
        actions: [
          "Keep a fixed wake time; use bedtime as a ‘range’ not a target",
          "If not sleepy, get out of bed and do a calm activity (low light) for 10–15 min",
          "Cut caffeine after midday (or 8 hours before bedtime)",
        ],
        confidence: "medium",
      });
    }
  }

  // Pattern 3: fragmentation
  if (wakeups.length >= 3) {
    const avgW = wakeups.reduce((a, b) => a + b, 0) / wakeups.length;
    if (avgW >= 2) {
      insights.push({
        code: "FR1 / DN2 (sleep fragmentation)",
        title: "Frequent awakenings pattern",
        why: [`You’re waking up ~${avgW.toFixed(1)} times per night on average.`],
        actions: [
          "Check environment triggers (noise/light/temperature)",
          "Avoid large fluid intake 1–2 hours before bed",
          "If awake >15 min, reset with a calm activity in low light",
        ],
        confidence: "medium",
      });
    }
  }

  // Pattern 4: sleep debt
  if (durations.length >= 3) {
    const avgDur = durations.reduce((a, b) => a + b, 0) / durations.length;
    if (avgDur <= 420) {
      insights.push({
        code: "SD1 / DN3 (sleep debt pressure)",
        title: "Sleep debt signal",
        why: [`Your average sleep duration is ~${minutesToHHMM(Math.round(avgDur))} (goal for most adults: 7–9h).`],
        actions: [
          "Protect a consistent wake time first; then expand time-in-bed by 15–30 min",
          "Avoid long catch-up naps (keep naps ≤30 min, earlier in the day)",
          "Prioritize the same wind-down routine nightly",
        ],
        confidence: "medium",
      });
    }
  }

  // Pattern 5: low perceived quality (if available)
  if (qualities.length >= 3) {
    const avgQ = qualities.reduce((a, b) => a + b, 0) / qualities.length;
    if (avgQ <= 2.5) {
      insights.push({
        code: "QL1 / DN2 (low perceived quality)",
        title: "Low perceived sleep quality",
        why: [`Your recent sleep quality ratings average ~${avgQ.toFixed(1)}.`],
        actions: [
          "Track 1–2 controllable levers for 7 days (wake time + wind-down)",
          "Keep the bedroom dark + cool",
          "If quality is low despite enough time in bed, focus on consistency over ‘trying harder’",
        ],
        confidence: "low",
      });
    }
  }

  // A: incorporate user input as an additional insight (and optionally boost the first insight)
  const p = normalizeDriver(ctx.primaryDriver);
  const s = normalizeDriver(ctx.secondaryDriver);

  const pAdvice = driverAdvice(p);
  const sAdvice = driverAdvice(s);

  if (pAdvice) {
    insights.push({
      code: pAdvice.code,
      title: `Your input: ${p || "Primary driver"}`,
      why: [pAdvice.why, ctx.notes?.trim() ? `Note: “${ctx.notes.trim()}”` : ""].filter(Boolean),
      actions: pAdvice.actions,
      confidence: pAdvice.confidence,
    });
  }
  if (sAdvice && s && s !== p) {
    insights.push({
      code: sAdvice.code,
      title: `Your input: ${s || "Secondary driver"}`,
      why: [sAdvice.why].filter(Boolean),
      actions: sAdvice.actions,
      confidence: sAdvice.confidence,
    });
  }

  // If we have at least one “pattern” insight and one driver insight, lightly merge: append one driver action set.
  if (insights.length >= 2) {
    const first = insights[0];
    const driverIns = insights.find((i) => i.title.startsWith("Your input:"));
    if (driverIns && first && first.actions && driverIns.actions) {
      const mergedActions = Array.from(new Set([...first.actions, ...driverIns.actions]));
      first.actions = mergedActions.slice(0, 7);
      if (first.why && driverIns.why?.length) {
        first.why = Array.from(new Set([...first.why, `You also flagged: ${p || s}.`]));
      }
    }
  }

  // Return in a useful order: main patterns first, then input-based.
  return insights;
}


export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const days = Math.max(3, Math.min(30, Number(body?.days ?? 7)));

  // Pull last N days of metrics.
  const { data: rows, error: rowsErr } = await supabase
    .from("v_sleep_night_metrics")
    .select("night_id,user_id,created_at,duration_min,latency_min,wakeups_count,quality_num")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(days);

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  const insights = computeRRSMInsights({
    days,
    rows: (rows ?? []) as NightMetricsRow[],
    context: {
      sleepStart: body?.sleepStart,
      sleepEnd: body?.sleepEnd,
      primaryDriver: body?.primaryDriver,
      secondaryDriver: body?.secondaryDriver,
      notes: body?.notes,
    },
  });

  return NextResponse.json({
    window: { days, count: (rows ?? []).length },
    insights,
  });
}
