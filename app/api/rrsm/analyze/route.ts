// app/api/rrsm/analyze/route.ts
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

export async function GET() {
  return NextResponse.json({ error: "Use POST." }, { status: 405 });
}

export async function POST(req: Request) {
  // 0) Supabase server client (cookie-based)
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  // 1) Auth
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // 2) Date window (last 7 days)
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const toYMDStr = toYMD(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 6);
  const fromYMD = toYMD(from);

  // 3) Fetch last 7 days (adjust table/column names if needed)
  const { data: nights, error: nightsErr } = await supabase
    .from("v_sleep_night_metrics")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", fromYMD)
    .lte("date", toYMDStr)
    .order("date", { ascending: true });

  if (nightsErr) {
    return NextResponse.json({ error: nightsErr.message }, { status: 500 });
  }

  // 4) Simple placeholder insight (keep your existing logic)
  const loggedCount = Array.isArray(nights) ? nights.length : 0;

  const why: string[] = [];
  let confidence: "low" | "med" | "high" = "low";

  if (loggedCount >= 5) {
    why.push(`Enough data logged: ${loggedCount}/7 nights`);
    confidence = "med";
  } else {
    why.push(`Not enough logged signals in last 7 days yet (${loggedCount}/7).`);
    confidence = "low";
  }

  const actions = [
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
    why,
    actions,
    confidence,
  };

  return NextResponse.json({
    window: { from: fromYMD, to: toYMDStr, days: 7 },
    insights: [insight],
  });
}
