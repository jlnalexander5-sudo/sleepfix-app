import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type Insight = {
  code?: string;
  title: string;
  why: string[];
  actions: string[];
  confidence?: "low" | "medium" | "high";
};

function latencyMinutes(choice: string | null | undefined): number | null {
  if (!choice) return null;
  if (choice === "60+") return 60;
  const n = Number.parseInt(choice, 10);
  return Number.isFinite(n) ? n : null;
}

function wakeUpsCount(choice: string | null | undefined): number | null {
  if (!choice) return null;
  if (choice === "5+") return 5;
  const n = Number.parseInt(choice, 10);
  return Number.isFinite(n) ? n : null;
}

function latencyBand(choice: string | null | undefined): "Fast" | "Medium" | "Long" | "Unknown" {
  const m = latencyMinutes(choice);
  if (m === null) return "Unknown";
  if (m <= 10) return "Fast";
  if (m <= 30) return "Medium";
  return "Long";
}

function wakeBand(choice: string | null | undefined): "None" | "Some" | "Many" | "Unknown" {
  const w = wakeUpsCount(choice);
  if (w === null) return "Unknown";
  if (w === 0) return "None";
  if (w <= 2) return "Some";
  return "Many";
}

function sleepGrade(q: number | null | undefined): "Good" | "Okay" | "Bad" | "Unknown" {
  if (q === null || q === undefined || !Number.isFinite(q)) return "Unknown";
  if (q >= 7) return "Good";
  if (q >= 5) return "Okay";
  return "Bad";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function round0(n: number) {
  return Math.round(n);
}

function riskScore(q: number, latMin: number, wake: number) {
  // Airtable: ROUND(100*(0.45*(1-(q/10))+0.35*(min(lat,60)/60)+0.20*(min(wake,5)/5)),0)
  const v =
    100 *
    (0.45 * (1 - q / 10) + 0.35 * (clamp(latMin, 0, 60) / 60) + 0.2 * (clamp(wake, 0, 5) / 5));
  return round0(v);
}

function riskLevel(score: number | null): string {
  if (score === null) return "—";
  if (score >= 75) return "🔴 High";
  if (score >= 50) return "🟠 Moderate";
  if (score >= 25) return "🟡 Low";
  return "🟢 Minimal";
}

function riskInterpretation(score: number | null): string {
  if (score === null) return "—";
  if (score >= 70) return "⚠️ Intervention recommended";
  if (score >= 40) return "⚠️ Monitor closely";
  return "✅ Stable";
}

function primaryRiskDrivers(score: number | null): string {
  if (score === null) return "—";
  if (score >= 70) return "Severe Sleep Disruption";
  if (score >= 50) return "Moderate Sleep Instability";
  if (score >= 30) return "Mild Sleep Fragmentation";
  return "Stable Sleep";
}

function riskExplanation(score: number | null): string {
  if (score === null) return "—";
  if (score >= 70)
    return "High risk due to severe sleep disruption. Multiple awakenings, poor latency or protocol failure detected.";
  if (score >= 50) return "Moderate risk. Sleep stability is compromised and requires intervention.";
  if (score >= 30) return "Mild risk. Some fragmentation or inefficiency detected but overall stable.";
  return "Low risk. Sleep appears stable and well regulated.";
}

function suggestedProtocol(tags: { body: string[]; env: string[]; mind: string[] }): string {
  const body = (tags.body ?? []).join(", ");
  const env = (tags.env ?? []).join(", ");
  const mind = (tags.mind ?? []).join(", ");

  if (body.includes("Pain")) return "DOMS compression Protocol";
  // Airtable uses "Heat", tags use "Hot" — accept either
  if (env.includes("Hot") || env.includes("Heat")) return "Cooling Discharge Protocol";
  // Airtable uses "Stimulation", tags use "Overstimulated" — accept either
  if (mind.includes("Overstimulated") || mind.includes("Stimulation")) return "Mental Discharge Protocol";
  return "No suggestion";
}

function mismatch(suggested: string, used: string | null | undefined): number {
  // Airtable:
  // IF(suggested="No suggestion",0, IF(used blank,1, IF(suggested = used,0,1)))
  if (suggested === "No suggestion") return 0;
  if (!used) return 1;
  return suggested === used ? 0 : 1;
}

function sleepSuccessScore(q: number, latMin: number, wake: number) {
  // Airtable: ((q/5)*50 + (1 - min(wake,5)/5)*25 + (1 - min(lat,60)/60)*25)
  const v =
    (q / 5) * 50 +
    (1 - clamp(wake, 0, 5) / 5) * 25 +
    (1 - clamp(latMin, 0, 60) / 60) * 25;
  return v;
}

function tonightActionPlan(q: number, latB: string, wakeB: string): string {
  if (!Number.isFinite(q)) return "Log a night to get a plan.";
  if (q <= 5 && latB === "Long")
    return "Tonight: reduce stimulation 60–90 minutes before bed, keep lights low, and do a short downshift routine (slow breathing + no screens).";
  if (q <= 5 && wakeB === "Many")
    return "Tonight: focus on sleep continuity—cool/dark room, avoid late fluids, and keep wake-ups boring (no phone, low light).";
  if (q >= 8) return "Tonight: keep things simple—repeat what worked and aim for consistency.";
  return "Tonight: choose one lever only—either earlier wind-down OR a calmer environment. Don’t overhaul everything.";
}

function trendMessage(q: number, latB: string, wakeB: string): string {
  if (!Number.isFinite(q)) return "Add your sleep check-in and we’ll explain what it means.";
  if (q <= 5 && latB === "Long")
    return "A long time to fall asleep often points to an overactive nervous system or too much stimulation too close to bed.";
  if (q <= 5 && wakeB === "Many")
    return "Frequent wake-ups can fragment sleep and reduce deep recovery, even if total time in bed looks okay.";
  if (q >= 8) return "Good sleep usually means your body and nervous system had enough safety and calm to recover.";
  return "Small improvements here matter more than chasing one perfect night.";
}

function avoidTonight(q: number, latB: string, wakeB: string): string {
  if (!Number.isFinite(q)) return "—";
  if (latB === "Long") return "Avoid: late screens, late caffeine, intense thinking tasks close to bed.";
  if (wakeB === "Many")
    return "Avoid: heavy meals late, alcohol, overheating the room, checking the time during wake-ups.";
  return "Avoid: over-correcting. Keep changes minimal and repeatable.";
}

function encouragement(q: number): string {
  if (!Number.isFinite(q)) return "Log one night—progress starts with data, not perfection.";
  if (q >= 8) return "Great work. Keep doing what you’re doing—consistency is the win.";
  if (q >= 6) return "You’re close. One small tweak tonight is enough.";
  return "Rough night — but this is workable. We’ll focus on one simple change and rebuild from there.";
}

function dominantFactor(latB: string, wakeB: string, primaryDriver: string | null | undefined): string {
  if (wakeB === "Many") return "Frequent Awakenings";
  if (latB === "Long") return "Delayed Sleep Onset";
  if ((primaryDriver ?? "").toLowerCase().includes("stress")) return "Stress";
  return "Stable";
}

function recommendedProtocolFromDominantFactor(df: string): string {
  // Airtable mapping
  if (df === "Frequent Awakenings") return "Stabilization Protocol";
  if (df === "Delayed Sleep Onset") return "Sleep Induction Protocol";
  if (df === "Stress") return "Nervous System Downregulation Protocol";
  return "Maintenance Protocol";
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { days?: number; includeDrivers?: boolean };
  const days = typeof body.days === "number" ? body.days : 7;

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
          // no-op in route handler (Next handles set-cookie via response headers)
          // leaving intentionally blank; auth still works for reads
        },
      },
    }
  );

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ insights: [] }, { status: 200 });
  }
  const userId = auth.user.id;

  // Pull nights within last `days` days (window). After unlock we always analyze the last 7 days by default.
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const { data: nights, error } = await supabase
  .from("sleep_nights")
  .select(
    "id,created_at,sleep_start,sleep_quality,sleep_latency_choice,wake_ups_choice,mind_tags,environment_tags,body_tags,protocol_used_name,primary_driver,secondary_driver,notes"
  )
  .eq("user_id", userId)
  .gte("sleep_start", since)
  .order("sleep_start", { ascending: false })
  .limit(50);

if (error) {
  return NextResponse.json({ insights: [] }, { status: 200 });
}

const rows = (nights ?? []) as any[];

  // Keep only rows with the three core scales filled
  const usable = rows.filter((r) => {
  const hasCore =
    r.sleep_quality !== null &&
    r.sleep_quality !== undefined &&
    Number.isFinite(Number(r.sleep_quality)) &&
    r.sleep_latency_choice &&
    r.wake_ups_choice !== null &&
    r.wake_ups_choice !== undefined;

  const hasTags =
    Array.isArray(r.mind_tags) && r.mind_tags.length > 0 &&
    Array.isArray(r.environment_tags) && r.environment_tags.length > 0 &&
    Array.isArray(r.body_tags) && r.body_tags.length > 0;

  return hasCore && hasTags;
});

// Soft lock: unlock at 3 *valid* nights (within the last `days` days)
  if (usable.length < 3) {
  const remaining = Math.max(0, 3 - usable.length);
  const insight: Insight = {
    code: "Setup",
    title: "Building your baseline (unlock at 3 nights)",
    confidence: "low",
    why: [
      `Logged: ${usable.length}/3 valid nights in the last ${days} days.`,
      "We wait for a minimum pattern window to avoid early / inaccurate conclusions.",
      "A valid night requires: Sleep Quality (1–10), Latency, Wake Ups, and at least 1 tag in Mind + Environment + Body.",
      remaining ? `Add ${remaining} more valid night(s) to unlock your first 7‑day insight.` : "Almost there.",
    ],
    actions: [
      "Log tonight’s sleep (start/end)",
      "Fill Sleep Quality, Latency, Wake Ups",
      "Add at least 1 tag in Mind + Environment + Body",
    ],
  };
  return NextResponse.json(
    { locked: true, nightsLogged: usable.length, unlockAt: 3, days, insights: [insight] },
    { status: 200 }
  );
}

  // Latest night = first row (sorted desc)
  const latest = usable[0];
  const q = Number(latest.sleep_quality);
  const latMin = latencyMinutes(latest.sleep_latency_choice) ?? 60;
  const w = wakeUpsCount(latest.wake_ups_choice) ?? 0;

  const latB = latencyBand(latest.sleep_latency_choice);
  const wakeB = wakeBand(latest.wake_ups_choice);

  const tags = {
    mind: Array.isArray(latest.mind_tags) ? latest.mind_tags : [],
    env: Array.isArray(latest.environment_tags) ? latest.environment_tags : [],
    body: Array.isArray(latest.body_tags) ? latest.body_tags : [],
  };

  const suggested = suggestedProtocol(tags);
  const mm = mismatch(suggested, latest.protocol_used_name);

  const latestRisk = riskScore(q, latMin, w);

  const risks = usable
    .map((r) => {
      const qq = Number(r.sleep_quality);
      const lm = latencyMinutes(r.sleep_latency_choice);
      const ww = wakeUpsCount(r.wake_ups_choice);
      if (!Number.isFinite(qq) || lm === null || ww === null) return null;
      return riskScore(qq, lm, ww);
    })
    .filter((x): x is number => typeof x === "number");

  const avg7 = risks.length ? risks.reduce((a, b) => a + b, 0) / risks.length : null;
  const riskTrend =
    avg7 === null
      ? null
      : latestRisk > avg7
      ? "Worse than 7-day average"
      : latestRisk < avg7
      ? "Better than 7-day average"
      : "Same as 7-day average";

  const df = dominantFactor(latB, wakeB, latest.primary_driver);
  const recProt = recommendedProtocolFromDominantFactor(df);

  // Confidence: 3-4 nights = low, 5-6 = medium, 7+ = high
  const conf: Insight["confidence"] = usable.length >= 7 ? "high" : usable.length >= 5 ? "medium" : "low";

  const insight: Insight = {
    code: "RRSM",
    confidence: conf,
    title: `Tonight plan: ${sleepGrade(q)} sleep (${latB} latency, ${wakeB} wake-ups)`,
    why: [
      `Sleep grade: ${sleepGrade(q)} (quality ${q}/10).`,
      `Latency band: ${latB}. Wake band: ${wakeB}.`,
      `Risk score: ${latestRisk} (${riskLevel(latestRisk)}). ${riskInterpretation(latestRisk)}`,
      `Primary driver: ${primaryRiskDrivers(latestRisk)}.`,
      `Suggested protocol: ${suggested}. Mismatch: ${mm}.`,
      df !== "Stable" ? `Dominant factor: ${df}. Recommended protocol family: ${recProt}.` : `Recommended protocol family: ${recProt}.`,
      riskTrend ? `Risk trend: ${riskTrend}.` : "Risk trend: —",
    ],
    actions: [
      tonightActionPlan(q, latB, wakeB),
      `Avoid: ${avoidTonight(q, latB, wakeB)}`,
      `Encouragement: ${encouragement(q)}`,
      `Trend note: ${trendMessage(q, latB, wakeB)}`,
    ],
  };

  return NextResponse.json({ insights: [insight] }, { status: 200 });
}
