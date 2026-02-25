import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type Insight = {
  created_at: string;
  dominant_domain: string;
  dominance_pct: number; // 0-100
  title: string;
  why: string[];
  actions: string[];
  confidence: "low" | "medium" | "high";
};

type AnalyzeBody = {
  window?: { days?: number };
  primaryDriver?: string;
  secondaryDriver?: string;
  notes?: string;
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function asStr(v: any): string {
  if (v == null) return "";
  return String(v);
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

function pickNum(row: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickDate(row: any, keys: string[]): Date | null {
  for (const k of keys) {
    const v = row?.[k];
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function minutesBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

function buildDriverHints(primary: string, secondary: string, notes: string) {
  const p = norm(primary);
  const s = norm(secondary);
  const n = norm(notes);

  const tags: string[] = [];

  const add = (t: string) => {
    if (!tags.includes(t)) tags.push(t);
  };

  const blob = `${p} ${s} ${n}`;

  if (blob.includes("stress") || blob.includes("anx") || blob.includes("worry")) add("stress");
  if (blob.includes("caffeine") || blob.includes("coffee") || blob.includes("tea") || blob.includes("energy")) add("caffeine");
  if (blob.includes("alcohol") || blob.includes("wine") || blob.includes("beer")) add("alcohol");
  if (blob.includes("exercise") || blob.includes("workout") || blob.includes("gym")) add("exercise");
  if (blob.includes("screen") || blob.includes("phone") || blob.includes("doom") || blob.includes("scroll")) add("screens");
  if (blob.includes("nap")) add("nap");
  if (blob.includes("noise") || blob.includes("neighbor") || blob.includes("snore")) add("environment");
  if (blob.includes("late") || blob.includes("bedtime") || blob.includes("schedule")) add("schedule");

  return tags;
}

function computeMetrics(rows: any[]) {
  // Try to infer common signals from whatever columns you actually have.
  // If a column doesn’t exist, we gracefully skip it.

  const bedTimes: Date[] = [];
  const wakeTimes: Date[] = [];

  const durations: number[] = [];
  const latencies: number[] = [];
  const waso: number[] = [];

  for (const r of rows) {
    const bed = pickDate(r, ["sleep_start", "bedtime", "in_bed_at", "start_time", "sleep_start_at"]);
    const wake = pickDate(r, ["sleep_end", "wake_time", "out_of_bed_at", "end_time", "sleep_end_at"]);
    if (bed) bedTimes.push(bed);
    if (wake) wakeTimes.push(wake);

    const dur =
      pickNum(r, ["total_sleep_minutes", "total_sleep_mins", "sleep_minutes", "sleep_mins", "tst_minutes", "tst_mins"]) ??
      null;
    if (dur != null) durations.push(dur);

    const lat =
      pickNum(r, ["sleep_latency_minutes", "sleep_latency_mins", "latency_minutes", "latency_mins", "sol_minutes", "sol_mins"]) ??
      null;
    if (lat != null) latencies.push(lat);

    const w =
      pickNum(r, ["waso_minutes", "waso_mins", "wake_after_sleep_onset_minutes", "wake_after_sleep_onset_mins"]) ?? null;
    if (w != null) waso.push(w);
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const avgDur = avg(durations);
  const avgLat = avg(latencies);
  const avgWaso = avg(waso);

  // Variability: bedtime drift (minutes) across the week
  let bedtimeDriftMins: number | null = null;
  if (bedTimes.length >= 2) {
    const mins = bedTimes.map((d) => d.getHours() * 60 + d.getMinutes());
    const min = Math.min(...mins);
    const max = Math.max(...mins);
    bedtimeDriftMins = max - min;
  }

  // If we have raw datetimes: total window span
  let windowSpanMins: number | null = null;
  if (bedTimes.length && wakeTimes.length) {
    const minBed = new Date(Math.min(...bedTimes.map((d) => d.getTime())));
    const maxWake = new Date(Math.max(...wakeTimes.map((d) => d.getTime())));
    windowSpanMins = Math.max(0, minutesBetween(minBed, maxWake));
  }

  return {
    n: rows.length,
    avgDur,
    avgLat,
    avgWaso,
    bedtimeDriftMins,
    windowSpanMins,
  };
}

function chooseInsight(metrics: ReturnType<typeof computeMetrics>, tags: string[]): Insight {
  // Score domains
  // RB2/DN2 = rhythm overload + compressed pause (schedule variability + not enough wind-down)
  // AR = arousal/stress
  // STIM = stimulants/screen
  // ENV = environment
  // HOME = basic sleep hygiene / insufficient data
  const scores: Record<string, number> = {
    "RB2 / DN2 (Rhythm overload + compressed pause)": 0,
    "AR (Arousal / stress load)": 0,
    "STIM (Stimulant / screen pressure)": 0,
    "ENV (Environment disruption)": 0,
    "HOME (Insufficient data / baseline)": 0,
  };

  const why: string[] = [];
  const actions: string[] = [];

  // Data strength
  const dataStrong = metrics.n >= 5;
  const dataMedium = metrics.n >= 3;

  // Rhythm / schedule variability
  if (metrics.bedtimeDriftMins != null) {
    if (metrics.bedtimeDriftMins >= 120) scores["RB2 / DN2 (Rhythm overload + compressed pause)"] += 4;
    else if (metrics.bedtimeDriftMins >= 60) scores["RB2 / DN2 (Rhythm overload + compressed pause)"] += 2;

    if (metrics.bedtimeDriftMins >= 60) {
      why.push(`Bedtime varied ~${Math.round(metrics.bedtimeDriftMins)} minutes over the last week.`);
      actions.push("Pick a fixed wake time for 7 days (even weekends).");
      actions.push("Set a 30–45 min wind-down alarm (same time nightly).");
    }
  }

  // Short sleep
  if (metrics.avgDur != null) {
    if (metrics.avgDur < 360) scores["RB2 / DN2 (Rhythm overload + compressed pause)"] += 2;
    if (metrics.avgDur < 360) {
      why.push(`Average sleep time looks low (~${Math.round(metrics.avgDur)} min).`);
      actions.push("Reduce time-in-bed compression: keep wake time fixed, move bedtime earlier by 15 min every 2 nights.");
    }
  }

  // Latency / arousal
  if (metrics.avgLat != null) {
    if (metrics.avgLat >= 45) scores["AR (Arousal / stress load)"] += 4;
    else if (metrics.avgLat >= 25) scores["AR (Arousal / stress load)"] += 2;

    if (metrics.avgLat >= 25) {
      why.push(`Time to fall asleep looks elevated (~${Math.round(metrics.avgLat)} min).`);
      actions.push("If awake >30–40 min: get out of bed, dim light, calm activity, return when sleepy.");
      actions.push("Do 6–8 slow exhales (long exhale) when you first lie down.");
    }
  }

  // WASO / fragmentation
  if (metrics.avgWaso != null) {
    if (metrics.avgWaso >= 60) scores["ENV (Environment disruption)"] += 2;
    if (metrics.avgWaso >= 60) {
      why.push(`Night fragmentation seems high (WASO ~${Math.round(metrics.avgWaso)} min).`);
      actions.push("Make the room cool-neutral + dark; reduce noise (fan/white noise).");
      actions.push("Avoid clock-checking; turn phone face-down, away from bed.");
    }
  }

  // Driver tags
  if (tags.includes("stress")) scores["AR (Arousal / stress load)"] += 3;
  if (tags.includes("caffeine") || tags.includes("screens")) scores["STIM (Stimulant / screen pressure)"] += 3;
  if (tags.includes("alcohol")) scores["ENV (Environment disruption)"] += 2;
  if (tags.includes("environment")) scores["ENV (Environment disruption)"] += 3;
  if (tags.includes("schedule")) scores["RB2 / DN2 (Rhythm overload + compressed pause)"] += 2;

  if (tags.includes("caffeine")) {
    why.push("Caffeine flag detected (from your driver/notes).");
    actions.push("Cut caffeine 8–10 hours before target bedtime.");
  }
  if (tags.includes("screens")) {
    why.push("Screen/visual stimulation flag detected (from your driver/notes).");
    actions.push("Last 60 min: no fast-scroll / high-arousal content; switch to low-contrast lighting.");
  }
  if (tags.includes("stress")) {
    why.push("Stress/anxiety flag detected (from your driver/notes).");
    actions.push("Do a 3-min ‘worry dump’ earlier in the evening; pick 1 next action, then stop.");
  }

  // If we barely have data, keep it honest
  if (!dataMedium) {
    scores["HOME (Insufficient data / baseline)"] += 6;
    why.unshift("Not enough logged signals in the last 7 days yet.");
    actions.unshift("Log 5–7 nights to unlock stronger RRSM patterns.");
  }

  // Pick winner
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [domain, topScore] = ranked[0];

  // Dominance pct
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const dominance_pct = clamp(Math.round((topScore / total) * 100));

  // Confidence
  let confidence: "low" | "medium" | "high" = "low";
  if (dataStrong && dominance_pct >= 55) confidence = "high";
  else if (dataMedium && dominance_pct >= 45) confidence = "medium";

  // Title templates
  let title = "Pattern detected";
  if (domain.startsWith("RB2")) title = "Wired-but-tired pattern detected";
  if (domain.startsWith("AR")) title = "Arousal-loaded sleep detected";
  if (domain.startsWith("STIM")) title = "Stimulation-driven delay detected";
  if (domain.startsWith("ENV")) title = "Fragmentation + environment pattern detected";
  if (domain.startsWith("HOME")) title = "Not enough data yet";

  // De-dupe actions + why
  const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => x.trim()))).filter(Boolean);

  return {
    created_at: new Date().toISOString(),
    dominant_domain: domain,
    dominance_pct,
    title,
    why: uniq(why).slice(0, 6),
    actions: uniq(actions).slice(0, 7),
    confidence,
  };
}

export async function POST(req: Request) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  // Auth
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as AnalyzeBody;
  const days = Math.max(3, Math.min(14, body?.window?.days ?? 7));

  // Pull last N days from your view (works even if some columns differ)
  const { data: rows, error } = await supabase
    .from("v_sleep_night_metrics")
    .select("*")
    .eq("user_id", user.id)
    .order("night_date", { ascending: false })
    .limit(days);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tags = buildDriverHints(asStr(body.primaryDriver), asStr(body.secondaryDriver), asStr(body.notes));
  const metrics = computeMetrics(rows ?? []);
  const insight = chooseInsight(metrics, tags);

  return NextResponse.json({
    window: { from: "auto", to: "auto", days },
    insights: [insight],
    debug: {
      rows: metrics.n,
      avgDur: metrics.avgDur,
      avgLat: metrics.avgLat,
      avgWaso: metrics.avgWaso,
      bedtimeDriftMins: metrics.bedtimeDriftMins,
      tags,
    },
  });
}
