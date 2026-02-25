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

// Keep this small + explicit so TS never complains during deploy
type Confidence = "low" | "medium" | "high";

type Insight = {
  domain: string;
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

function computeInsight(params: {
  rows: NightMetricsRow[];
  context?: { primaryDriver?: string; secondaryDriver?: string; notes?: string };
}): Insight {
  const { rows, context } = params;

  // Need a little data before we pretend we're smart
  if (rows.length < 3) {
    return {
      domain: "Starter",
      title: "Not enough data yet",
      why: ["RRSM needs at least 3 logged nights to detect a stable pattern."],
      actions: [
        "Log 3–5 nights",
        "Pick the best matching driver(s) each night",
        "Add 1 short note when something unusual happens (stress, caffeine, alcohol, late meal)",
      ],
      confidence: "low",
    };
  }

  const durations = rows
    .map((r) => toNum(r.duration_min))
    .filter((n): n is number => n !== null);

  const latency = rows
    .map((r) => toNum(r.latency_min))
    .filter((n): n is number => n !== null);

  const wakeups = rows
    .map((r) => toNum(r.wakeups_count))
    .filter((n): n is number => n !== null);

  const quality = rows
    .map((r) => toNum(r.quality_num))
    .filter((n): n is number => n !== null);

  const medDur = median(durations);
  const durVar = stdev(durations);
  const medLatency = median(latency);
  const medWakeups = median(wakeups);
  const medQuality = quality.length ? median(quality) : 0;

  const primary = (context?.primaryDriver || "").toLowerCase();
  const secondary = (context?.secondaryDriver || "").toLowerCase();
  const notes = (context?.notes || "").toLowerCase();

  const mentions = (needle: string) =>
    primary.includes(needle) || secondary.includes(needle) || notes.includes(needle);

  const driverHints: string[] = [];
  if (primary || secondary) {
    driverHints.push(
      `You selected: ${[context?.primaryDriver, context?.secondaryDriver].filter(Boolean).join(" + ")}.`
    );
  }
  if (notes) driverHints.push("Your notes were included in the analysis.");

  // Signals
  const highVariability = durVar >= 75; // big swings night-to-night
  const shortSleep = medDur > 0 && medDur < 390; // < 6h30
  const longLatency = medLatency >= 35; // takes long to fall asleep
  const fragmented = medWakeups >= 3;
  const lowQuality = medQuality > 0 && medQuality <= 2;

  // Priority order (pick most “actionable” dominant pattern)
  if (highVariability) {
    const why = [
      `Your sleep duration varies a lot across recent nights (high variability).`,
      `That makes your body “guess” when sleep is supposed to happen.`,
      ...driverHints,
    ];
    if (mentions("stress") || mentions("anx")) why.push("Stress/anxiety appears in your inputs and can amplify variability.");

    return {
      domain: "RB2 / Rhythm",
      title: "Rhythm variability pattern detected",
      why,
      actions: [
        "Set a consistent wake time for 7 days (±30 min)",
        "If bedtime drifts late, still wake on schedule (use a 20–30 min nap max if needed)",
        "Lower stimulation for 60 min before bed (dim lights, no fast screens)",
      ],
      confidence: rows.length >= 5 ? "high" : "medium",
    };
  }

  if (longLatency) {
    const why = [
      `It looks like you’re taking a long time to fall asleep (median latency ~${Math.round(medLatency)} min).`,
      ...driverHints,
    ];
    if (mentions("screen")) why.push("Screen time shows up in your inputs—this commonly delays sleep onset.");
    if (mentions("caffeine") || mentions("coffee") || mentions("energy")) why.push("Caffeine shows up in your inputs—late caffeine can delay sleep onset.");
    if (mentions("exercise")) why.push("Exercise timing shows up—late intense training can delay sleep onset for some people.");

    return {
      domain: "SO1 / Sleep onset",
      title: "Sleep-onset delay pattern detected",
      why,
      actions: [
        "Move the last 30–60 min of the night into a low-stimulation wind-down (no fast scrolling)",
        "Keep lights dim in the last hour; avoid bright overhead light",
        "If caffeine is a factor: stop ~8 hours before bedtime for 7 nights and compare",
      ],
      confidence: rows.length >= 5 ? "high" : "medium",
    };
  }

  if (fragmented || lowQuality) {
    const why = [
      `Your sleep appears more broken up (wake-ups/quality trend suggests fragmentation).`,
      ...driverHints,
    ];
    if (mentions("alcohol") || mentions("wine") || mentions("beer")) why.push("Alcohol appears in your inputs—this commonly increases mid-night awakenings.");
    if (mentions("late meal")) why.push("Late meals can worsen awakenings/reflux/temperature regulation for some people.");

    return {
      domain: "SM2 / Maintenance",
      title: "Fragmentation pattern detected",
      why,
      actions: [
        "If awake >20–30 min: get out of bed, low light, calm activity; return when sleepy",
        "Reduce fluids 1–2 hours before bed (if bathroom wake-ups are a factor)",
        "Test 3 nights alcohol-free (if relevant) and compare wake-ups",
      ],
      confidence: rows.length >= 5 ? "high" : "medium",
    };
  }

  if (shortSleep) {
    const why = [
      `Your median sleep duration is ~${Math.round(medDur)} minutes, suggesting limited sleep opportunity or sleep debt.`,
      ...driverHints,
    ];

    return {
      domain: "SD1 / Sleep debt",
      title: "Likely insufficient sleep opportunity",
      why,
      actions: [
        "For 7 nights: shift bedtime earlier by 15–30 minutes",
        "Keep wake time consistent even if one night runs late",
        "Avoid heavy meals late; keep the bedroom cool and dark",
      ],
      confidence: rows.length >= 5 ? "high" : "medium",
    };
  }

  return {
    domain: "ST0 / Baseline",
    title: "No strong dysfunction signal detected",
    why: [
      "Your recent nights don’t show a clear rhythm / onset / fragmentation / debt signature yet.",
      ...driverHints,
    ],
    actions: [
      "Keep logging for 7–14 days so RRSM can detect subtler patterns",
      "Use Primary + Secondary driver when you’re unsure (it’s valuable context)",
      "Add a short note when something changes (stress, caffeine, alcohol, late meal, naps)",
    ],
    confidence: "medium",
  };
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();

  // auth
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // request body
  const body = await req.json().catch(() => ({} as any));
  const days = Math.max(3, Math.min(30, Number(body?.days ?? 7)));

  // Pull last N rows from the view you already have
  const { data: rows, error: rowsErr } = await supabase
    .from("v_sleep_night_metrics")
    .select("night_id,user_id,created_at,duration_min,latency_min,wakeups_count,quality_num")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(days);

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  const insight = computeInsight({
    rows: (rows ?? []) as NightMetricsRow[],
    context: {
      primaryDriver: body?.primaryDriver,
      secondaryDriver: body?.secondaryDriver,
      notes: body?.notes,
    },
  });

  return NextResponse.json({
    window: { days, count: (rows ?? []).length },
    insights: insight ? [insight] : [],
  });
}
