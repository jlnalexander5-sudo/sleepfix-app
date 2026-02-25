import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type NightMetricsRow = {
  night_id: string;
  user_id: string;
  sleep_start?: string | null;
  sleep_end?: string | null;
  duration_min?: number | null;
  bedtime_local?: string | null;
  waketime_local?: string | null;
  awakenings?: number | null;
  sleep_efficiency?: number | null; // 0..1
};

type Insight = {
  domain: string;
  title: string;
  why: string[];
  actions: string[];
  confidence: "low" | "medium" | "high";
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function minutes(n: unknown, fallback = 0) {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function median(arr: number[]) {
  const a = [...arr].sort((x, y) => x - y);
  if (a.length === 0) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function stdev(arr: number[]) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  const v =
    arr.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function computeInsight(params: {
  days: number;
  rows: NightMetricsRow[];
  context?: {
    primaryDriver?: string;
    secondaryDriver?: string;
    notes?: string;
  };
}): Insight | null {
  const { rows, context } = params;

  // If not enough data, return a gentle starter insight
  if (rows.length < 3) {
    return {
      domain: "RB2 / DN2 (Rhythm overload + compressed pause)",
      title: "Not enough logged nights yet",
      why: ["RRSM needs at least 3 nights to detect stable patterns."],
      actions: [
        "Log sleep for 3–5 nights",
        "Keep wake time roughly consistent",
        "Add a short note if something unusual happened (stress, caffeine, alcohol)",
      ],
      confidence: "low",
    };
  }

  const durations = rows
    .map((r) => minutes(r.duration_min, NaN))
    .filter((x) => Number.isFinite(x));
  const awakes = rows
    .map((r) => minutes(r.awakenings, NaN))
    .filter((x) => Number.isFinite(x));
  const eff = rows
    .map((r) =>
      typeof r.sleep_efficiency === "number" ? r.sleep_efficiency : NaN
    )
    .filter((x) => Number.isFinite(x));

  const medDur = median(durations);
  const durVar = stdev(durations);

  const medAwakes = median(awakes);
  const medEff = eff.length ? median(eff) : 0;

  // Heuristics (simple, but actually useful)
  const shortSleep = medDur > 0 && medDur < 390; // < 6h30
  const highVariability = durVar >= 75; // big swings night to night
  const fragmented = medAwakes >= 3 || (medEff > 0 && medEff < 0.82);

  const primary = (context?.primaryDriver || "").toLowerCase();
  const secondary = (context?.secondaryDriver || "").toLowerCase();
  const notes = (context?.notes || "").toLowerCase();
  const mentionsStress =
    primary.includes("stress") ||
    secondary.includes("stress") ||
    notes.includes("stress") ||
    notes.includes("anx");
  const mentionsCaffeine =
    primary.includes("caffeine") ||
    secondary.includes("caffeine") ||
    notes.includes("caffeine") ||
    notes.includes("coffee") ||
    notes.includes("energy");
  const mentionsAlcohol =
    primary.includes("alcohol") ||
    secondary.includes("alcohol") ||
    notes.includes("alcohol") ||
    notes.includes("wine") ||
    notes.includes("beer");

  // Pick ONE dominant pattern
  // 1) Rhythm/variability
  if (highVariability) {
    const why: string[] = [
      `Your sleep duration varies a lot over the last ${rows.length} nights.`,
      `That variability makes your body “guess” when sleep is supposed to happen.`,
    ];
    if (mentionsStress) why.push("Your notes/drivers mention stress, which can amplify variability.");

    return {
      domain: "RB2 / DN2 (Rhythm overload + compressed pause)",
      title: "Rhythm variability pattern detected",
      why,
      actions: [
        "Pick a consistent wake time for the next 7 days (±30 min)",
        "If bedtime drifts late, still wake on schedule and use a 20–30 min nap max if needed",
        "Lower stimulation for 60 min before bed (dim lights, no fast screens)",
      ],
      confidence: rows.length >= 5 ? "high" : "medium",
    };
  }

  // 2) Short sleep / sleep debt
  if (shortSleep) {
    const why: string[] = [
      `Median sleep duration is about ${Math.round(medDur)} minutes.`,
      "That’s commonly associated with accumulating sleep pressure and daytime fatigue.",
    ];
    if (mentionsCaffeine) why.push("Caffeine mentioned—late caffeine can shorten total sleep.");

    return {
      domain: "SD1 (Sleep debt / insufficient opportunity)",
      title: "Likely insufficient sleep opportunity",
      why,
      actions: [
        "For 7 nights: shift bedtime earlier by 15–30 min",
        "Avoid caffeine after ~8 hours before bedtime",
        "Keep the bedroom cool/dim and reduce scrolling the last hour",
      ],
      confidence: rows.length >= 5 ? "high" : "medium",
    };
  }

  // 3) Fragmentation / maintenance
  if (fragmented) {
    const why: string[] = [
      "Your sleep looks more fragmented (more awakenings and/or lower efficiency).",
      "That often produces unrefreshing sleep even if total time looks OK.",
    ];
    if (mentionsAlcohol) why.push("Alcohol mentioned—this commonly increases mid-night awakenings.");

    return {
      domain: "SM2 (Sleep maintenance / fragmentation)",
      title: "Fragmentation pattern detected",
      why,
      actions: [
        "If awake >20–30 min: get out of bed, low light, calm activity; return when sleepy",
        "Keep the room cooler and reduce fluids 1–2 hours before bed",
        "If alcohol is present, test 3 alcohol-free nights and compare awakenings",
      ],
      confidence: rows.length >= 5 ? "high" : "medium",
    };
  }

  // Default: decent sleep, suggest next step
  return {
    domain: "ST0 (Stable baseline)",
    title: "No strong dysfunction signal detected",
    why: ["Your recent nights don’t show a strong rhythm / debt / fragmentation signature."],
    actions: [
      "Keep logging for 7–14 days so RRSM can detect subtler patterns",
      "Add a driver/notes when something changes (stress, late meals, training, naps)",
    ],
    confidence: "medium",
  };
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const days = Math.max(3, Math.min(30, Number(body?.days ?? 7)));

   //  Pull last N days of metrics
const { data: rows, error: rowsErr } = await supabase
  .from("v_sleep_night_metrics")
  .select("night_id,user_id,created_at,duration_min,latency_min,wakeups_count,quality_num")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(days);

if (error) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const insight = computeInsight({
    days,
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
