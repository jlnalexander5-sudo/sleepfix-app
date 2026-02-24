import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type Insight = {
  domain: string;
  title: string;
  why: string[];
  actions: string[];
  confidence: "low" | "med" | "high";
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function POST() {
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
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // In Route Handlers, setAll can throw in some edge cases.
            // Safe to ignore for read-only auth checks.
          }
        },
      },
    }
  );
// Allow GET for quick testing (it just forwards to POST)
export async function GET(req: Request) {
  return POST(req);
}

// (Optional but recommended) avoid static caching on Vercel
export const dynamic = "force-dynamic";
  
  // 1) Auth
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // 2) Date window (last 7 days)
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const end = new Date(now);
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  const fromYMD = toYMD(start);
  const toYMDStr = toYMD(end);

  // 3) Pull habits + rrsm factors
  const [{ data: habits, error: habitsErr }, { data: rrsm, error: rrsmErr }] =
    await Promise.all([
      supabase
        .from("daily_habits")
        .select("date,caffeine_after_2pm,alcohol,exercise,screens_last_hour")
        .eq("user_id", user.id)
        .gte("date", fromYMD)
        .lte("date", toYMDStr),
      supabase
        .from("daily_rrsm_factors")
        .select(
          "local_date,ambient_heat_high,hot_drinks_late,heavy_food_late,intense_thinking_late,visualization_attempted,fought_wakefulness,cold_shower_evening,ice_water_evening,notes"
        )
        .eq("user_id", user.id)
        .gte("local_date", fromYMD)
        .lte("local_date", toYMDStr),
    ]);

  if (habitsErr) return NextResponse.json({ error: habitsErr.message }, { status: 500 });
  if (rrsmErr) return NextResponse.json({ error: rrsmErr.message }, { status: 500 });

  const countTrue = <T extends Record<string, any>>(rows: T[], key: keyof T) =>
    (rows ?? []).reduce((acc, r) => acc + (r?.[key] === true ? 1 : 0), 0);

  const h = habits ?? [];
  const r = rrsm ?? [];

  const heat = countTrue(r, "ambient_heat_high");
  const screens = countTrue(h, "screens_last_hour");
  const caffeine = countTrue(h, "caffeine_after_2pm");
  const alcohol = countTrue(h, "alcohol");
  const hotDrinks = countTrue(r, "hot_drinks_late");
  const heavyFood = countTrue(r, "heavy_food_late");
  const intenseThinking = countTrue(r, "intense_thinking_late");
  const visualization = countTrue(r, "visualization_attempted");
  const foughtWake = countTrue(r, "fought_wakefulness");
  const coldShower = countTrue(r, "cold_shower_evening");
  const iceWater = countTrue(r, "ice_water_evening");
  const exercise = countTrue(h, "exercise");

  const dn2Load = heat + screens + caffeine + alcohol + hotDrinks + heavyFood + intenseThinking;
  const dn2BadPractices = visualization + foughtWake + coldShower + iceWater;

  const confScore = clamp(Math.round(((dn2Load + dn2BadPractices) / 14) * 100), 0, 100);
  const confidence: Insight["confidence"] =
    confScore >= 55 ? "high" : confScore >= 30 ? "med" : "low";

  const why: string[] = [];
  if (heat) why.push(`Heat logged ${heat}/7`);
  if (screens) why.push(`Screens last hour ${screens}/7`);
  if (caffeine) why.push(`Caffeine after 2pm ${caffeine}/7`);
  if (alcohol) why.push(`Alcohol ${alcohol}/7`);
  if (hotDrinks) why.push(`Hot drinks late ${hotDrinks}/7`);
  if (heavyFood) why.push(`Heavy food late ${heavyFood}/7`);
  if (intenseThinking) why.push(`Intense thinking late ${intenseThinking}/7`);
  if (visualization) why.push(`Visualization attempted ${visualization}/7`);
  if (foughtWake) why.push(`Fought wakefulness ${foughtWake}/7`);
  if (coldShower) why.push(`Cold shower evening ${coldShower}/7`);
  if (iceWater) why.push(`Ice water evening ${iceWater}/7`);
  if (exercise) why.push(`Exercise ${exercise}/7`);

  const actions: string[] = [
    "Cool-neutral environment (stable, not cold)",
    "Reduce visual rhythm at night (no fast motion / screens)",
    "Outbound discharge (walk / gentle chores) before stillness",
    "Same pre-sleep timing sequence nightly",
    "Low-contrast lighting (warm, dim)",
    "If awake >30–40 min: sit up + long-exhale breathing; don’t force sleep",
  ];

  const insight: Insight = {
    domain: "RB2 / DN2 (Rhythm overload + compressed pause)",
    title: "Wired-but-tired pattern detected",
    why: why.length ? why : ["Not enough logged signals in last 7 days yet."],
    actions,
    confidence,
  };

  return NextResponse.json({
    window: { from: fromYMD, to: toYMDStr, days: 7 },
    insights: [insight],
  });
}
