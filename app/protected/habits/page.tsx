"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type DailyHabitRow = {
  id?: string;
  user_id: string;
  created_at?: string;
  date: string; // YYYY-MM-DD
  caffeine_after_2pm: boolean | null;
  alcohol: boolean | null;
  exercise: boolean | null;
  screens_last_hour: boolean | null;
};

type DailyRRSMFactorRow = {
  id?: string;
  user_id: string;
  created_at?: string;
  local_date: string; // YYYY-MM-DD
  ambient_heat_high: boolean | null;
  hot_drinks_late: boolean | null;
  heavy_food_late: boolean | null;
  intense_thinking_late: boolean | null;
  visualization_attempted: boolean | null;
  fought_wakefulness: boolean | null;
  cold_shower_evening: boolean | null;
  ice_water_evening: boolean | null;
  notes?: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function HabitsPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [status, setStatus] = useState<string>("Loading…");
  const [todayStr, setTodayStr] = useState<string>("");
  const [dayList, setDayList] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [rows, setRows] = useState<Record<string, DailyHabitRow | undefined>>(
    {}
  );

  const [rrsmRows, setRrsmRows] = useState<
    Record<string, DailyRRSMFactorRow | undefined>
  >({});

  // Build today + last 7 days on client only (avoid new Date() during prerender)
  useEffect(() => {
    const today = new Date();
    const todayYMD = toYMD(today);
    setTodayStr(todayYMD);

    const start = startOfLocalDay(today);
    const out: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(start);
      d.setDate(d.getDate() - i);
      out.push(toYMD(d));
    }
    setDayList(out);
  }, []);

  // Load data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus("Loading…");

        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          if (!cancelled) setStatus("Not signed in.");
          return;
        }
        if (!cancelled) setUserId(user.id);

        // Need dayList ready
        if (dayList.length !== 7) {
          if (!cancelled) setStatus("Loading…");
          return;
        }

        const fromYMD = dayList[0];
        const toYMDStr = dayList[dayList.length - 1];

        const { data, error } = await supabase
          .from("daily_habits")
          .select(
            "id,user_id,created_at,date,caffeine_after_2pm,alcohol,exercise,screens_last_hour"
          )
          .eq("user_id", user.id)
          .gte("date", fromYMD)
          .lte("date", toYMDStr)
          .order("date", { ascending: true });

        if (error) throw error;

        const map: Record<string, DailyHabitRow | undefined> = {};
        for (const r of (data ?? []) as DailyHabitRow[]) {
          map[r.date] = r;
        }


        // RRSM-specific factors (Part 2 notes)
        const { data: rrsmData, error: rrsmErr } = await supabase
          .from("daily_rrsm_factors")
          .select(
            "id,user_id,created_at,local_date,ambient_heat_high,hot_drinks_late,heavy_food_late,intense_thinking_late,visualization_attempted,fought_wakefulness,cold_shower_evening,ice_water_evening,notes"
          )
          .eq("user_id", user.id)
          .gte("local_date", fromYMD)
          .lte("local_date", toYMDStr)
          .order("local_date", { ascending: true });

        if (rrsmErr) throw rrsmErr;

        const rrsmMap: Record<string, DailyRRSMFactorRow | undefined> = {};
        for (const r of (rrsmData ?? []) as DailyRRSMFactorRow[]) {
          rrsmMap[r.local_date] = r;
        }
        if (!cancelled) {
          setRows(map);
          setRrsmRows(rrsmMap);
          setStatus("Ready.");
        }
      } catch (e: any) {
        if (!cancelled) setStatus(e?.message ?? "Failed to load.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, dayList]);

  async function upsertField(date: string, patch: Partial<DailyHabitRow>) {
    if (!userId) return;

    // optimistic update
    setRows((prev) => {
      const current = prev[date];
      const next: DailyHabitRow = {
        id: current?.id,
        user_id: userId,
        created_at: current?.created_at,
        date,
        caffeine_after_2pm: current?.caffeine_after_2pm ?? null,
        alcohol: current?.alcohol ?? null,
        exercise: current?.exercise ?? null,
        screens_last_hour: current?.screens_last_hour ?? null,
        ...patch,
      };
      return { ...prev, [date]: next };
    });

    try {
      setStatus("Saving…");

      const payload: DailyHabitRow = {
        user_id: userId,
        date,
        caffeine_after_2pm: patch.caffeine_after_2pm ?? rows[date]?.caffeine_after_2pm ?? null,
        alcohol: patch.alcohol ?? rows[date]?.alcohol ?? null,
        exercise: patch.exercise ?? rows[date]?.exercise ?? null,
        screens_last_hour: patch.screens_last_hour ?? rows[date]?.screens_last_hour ?? null,
      };

      // Note: assumes you have a unique constraint on (user_id, date)
      const { error } = await supabase
        .from("daily_habits")
        .upsert(payload as any, { onConflict: "user_id,date" });

      if (error) throw error;
      setStatus("Ready.");
    } catch (e: any) {
      setStatus(e?.message ?? "Save failed.");
    }
  }

  async function upsertRRSMField(
    local_date: string,
    patch: Partial<DailyRRSMFactorRow>
  ) {
    if (!userId) return;

    // optimistic update
    setRrsmRows((prev) => {
      const current = prev[local_date];
      const next: DailyRRSMFactorRow = {
        id: current?.id,
        user_id: userId,
        created_at: current?.created_at,
        local_date,
        ambient_heat_high: current?.ambient_heat_high ?? null,
        hot_drinks_late: current?.hot_drinks_late ?? null,
        heavy_food_late: current?.heavy_food_late ?? null,
        intense_thinking_late: current?.intense_thinking_late ?? null,
        visualization_attempted: current?.visualization_attempted ?? null,
        fought_wakefulness: current?.fought_wakefulness ?? null,
        cold_shower_evening: current?.cold_shower_evening ?? null,
        ice_water_evening: current?.ice_water_evening ?? null,
        notes: current?.notes ?? null,
        ...patch,
      };
      return { ...prev, [local_date]: next };
    });

    try {
      setStatus("Saving…");

      const payload: DailyRRSMFactorRow = {
        user_id: userId,
        local_date,
        ambient_heat_high:
          patch.ambient_heat_high ?? rrsmRows[local_date]?.ambient_heat_high ?? null,
        hot_drinks_late: patch.hot_drinks_late ?? rrsmRows[local_date]?.hot_drinks_late ?? null,
        heavy_food_late: patch.heavy_food_late ?? rrsmRows[local_date]?.heavy_food_late ?? null,
        intense_thinking_late:
          patch.intense_thinking_late ?? rrsmRows[local_date]?.intense_thinking_late ?? null,
        visualization_attempted:
          patch.visualization_attempted ?? rrsmRows[local_date]?.visualization_attempted ?? null,
        fought_wakefulness:
          patch.fought_wakefulness ?? rrsmRows[local_date]?.fought_wakefulness ?? null,
        cold_shower_evening:
          patch.cold_shower_evening ?? rrsmRows[local_date]?.cold_shower_evening ?? null,
        ice_water_evening:
          patch.ice_water_evening ?? rrsmRows[local_date]?.ice_water_evening ?? null,
        notes: patch.notes ?? rrsmRows[local_date]?.notes ?? null,
      };

      const { error } = await supabase
        .from("daily_rrsm_factors")
        .upsert(payload as any, { onConflict: "user_id,local_date" });

      if (error) throw error;
      setStatus("Ready.");
    } catch (e: any) {
      setStatus(e?.message ?? "Save failed.");
    }
  }

  function checkbox(
    date: string,
    key: keyof Pick<
      DailyHabitRow,
      "caffeine_after_2pm" | "alcohol" | "exercise" | "screens_last_hour"
    >,
    label: string
  ) {
    const r = rows[date];
    const checked = r?.[key] === true;


    return (
      <label
        key={String(key)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 0",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => upsertField(date, { [key]: e.target.checked } as any)}
        />
        <span>{label}</span>
      </label>
    );
  }

  function rrsmCheckbox(
    date: string,
    key: keyof Pick<
      DailyRRSMFactorRow,
      | "ambient_heat_high"
      | "hot_drinks_late"
      | "heavy_food_late"
      | "intense_thinking_late"
      | "visualization_attempted"
      | "fought_wakefulness"
      | "cold_shower_evening"
      | "ice_water_evening"
    >,
    label: string
  ) {
    const r = rrsmRows[date];
    const checked = r?.[key] === true;

    return (
      <label
        key={String(key)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 0",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) =>
            upsertRRSMField(date, { [key]: e.target.checked } as any)
          }
        />
        <span>{label}</span>
      </label>
    );
  }
    return (
      <label
        key={String(key)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 0",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => upsertField(date, { [key]: e.target.checked } as any)}
        />
        <span>{label}</span>
      </label>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Habits</h1>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Today: {todayStr || "—"}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.03)",
              minWidth: 180,
            }}
          >
            <div style={{ fontWeight: 700 }}>Status</div>
            <div style={{ opacity: 0.9 }}>{status}</div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <a href="/protected/dashboard" style={{ textDecoration: "underline" }}>
              Dashboard →
            </a>
            <a href="/protected/sleep" style={{ textDecoration: "underline" }}>
              Sleep →
            </a>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ opacity: 0.75, marginBottom: 10 }}>
          Last 7 days (oldest → newest)
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {dayList.map((d) => (
            <div
              key={d}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{d}</div>

              {checkbox(d, "caffeine_after_2pm", "Caffeine after 2pm")}
              {checkbox(d, "alcohol", "Alcohol")}
              {checkbox(d, "exercise", "Exercise")}
              {checkbox(d, "screens_last_hour", "Screens last hour")}

              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontWeight: 800, opacity: 0.9 }}>
                  RRSM Factors (Part 2)
                </summary>

                <div style={{ marginTop: 10 }}>
                  {rrsmCheckbox(d, "ambient_heat_high", "Hot day / ambient heat high")}
                  {rrsmCheckbox(d, "hot_drinks_late", "Hot drinks late")}
                  {rrsmCheckbox(d, "heavy_food_late", "Heavy food late")}
                  {rrsmCheckbox(d, "intense_thinking_late", "Intense thinking late")}
                  {rrsmCheckbox(d, "visualization_attempted", "Tried visualization at night")}
                  {rrsmCheckbox(d, "fought_wakefulness", "Fought wakefulness (forced sleep)")}
                  {rrsmCheckbox(d, "cold_shower_evening", "Cold shower evening")}
                  {rrsmCheckbox(d, "ice_water_evening", "Ice water evening")}
                </div>
              </details>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
