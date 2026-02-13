import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/providers/AuthProvider";

type SleepLog = {
  id: string;
  user_id: string;
  sleep_date: string; // YYYY-MM-DD
  bedtime: string | null; // "HH:MM"
  wake_time: string | null; // "HH:MM"
  notes: string | null;
  created_at: string;
};

type LatestNightRRSM = {
  user_id: string;
  night_id: string;
  computed_at: string;
  model_version: string | null;

  // risk snapshot
  risk_score: number | null;
  risk_band: string | null;

  // explanations / guidance
  primary_risk: string | null;
  dominant_factor: string | null;
  what_factors: string | null;
  what_protocol: string | null;

  tonight_action: string | null;
  why_this_matters: string | null;
  avoid_tonight: string | null;
  encouragement: string | null;

  // (optional) extra sleep stats that might exist in the view
  sleep_start?: string | null;
  sleep_end?: string | null;
  latency_mins?: number | null;
  wakeups_count?: number | null;
  quality_score?: number | null;
};

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function niceBand(band?: string | null) {
  if (!band) return "—";
  return band.toUpperCase();
}

export default function SleepPage() {
  const { user } = useUser();

  // Manual sleep logs (your existing feature)
  const [logs, setLogs] = useState<SleepLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [sleepDate, setSleepDate] = useState<string>(todayYMD());
  const [bedtime, setBedtime] = useState<string>("");
  const [wakeTime, setWakeTime] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Latest RRSM (new wiring)
  const [latest, setLatest] = useState<LatestNightRRSM | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const canQuery = useMemo(() => !!user?.id, [user?.id]);

  useEffect(() => {
    if (!canQuery) return;
    void Promise.all([fetchLatestRRSM(), fetchLogs()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuery]);

  async function fetchLatestRRSM() {
    if (!user?.id) return;

    setLoadingLatest(true);
    try {
      const { data, error } = await supabase
        .from("v_latest_night_rrsm")
        .select(
          [
            "user_id",
            "night_id",
            "computed_at",
            "model_version",
            "risk_score",
            "risk_band",
            "primary_risk",
            "dominant_factor",
            "what_factors",
            "what_protocol",
            "tonight_action",
            "why_this_matters",
            "avoid_tonight",
            "encouragement",
            "sleep_start",
            "sleep_end",
            "latency_mins",
            "wakeups_count",
            "quality_score",
          ].join(",")
        )
        .eq("user_id", user.id)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setLatest((data as LatestNightRRSM) ?? null);
    } catch (e: any) {
      // Keep it simple: don’t crash the page, just show no insights
      console.warn("fetchLatestRRSM error:", e?.message ?? e);
      setLatest(null);
    } finally {
      setLoadingLatest(false);
    }
  }

  async function fetchLogs() {
    if (!user?.id) return;

    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("sleep_date", { ascending: false })
        .limit(30);

      if (error) throw error;
      setLogs((data ?? []) as SleepLog[]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load sleep logs");
    } finally {
      setLoadingLogs(false);
    }
  }

  async function saveLog() {
    if (!user?.id) return;

    if (!sleepDate) {
      Alert.alert("Missing", "Please enter a sleep date (YYYY-MM-DD).");
      return;
    }

    try {
      const payload = {
        user_id: user.id,
        sleep_date: sleepDate,
        bedtime: bedtime.trim() ? bedtime.trim() : null,
        wake_time: wakeTime.trim() ? wakeTime.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
      };

      const { error } = await supabase.from("sleep_logs").insert(payload);
      if (error) throw error;

      setBedtime("");
      setWakeTime("");
      setNotes("");

      await fetchLogs();
      Alert.alert("Saved", "Sleep log saved.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save sleep log");
    }
  }

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 12 }}>Sleep</Text>

      {/* NEW: Latest RRSM Insights */}
      <View style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#222", marginBottom: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 18, fontWeight: "700" }}>Latest Insights</Text>

          <TouchableOpacity onPress={fetchLatestRRSM} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: "#222" }}>
            <Text style={{ fontWeight: "600" }}>{loadingLatest ? "…" : "Refresh"}</Text>
          </TouchableOpacity>
        </View>

        {loadingLatest ? (
          <View style={{ paddingTop: 10 }}>
            <ActivityIndicator />
          </View>
        ) : !latest ? (
          <Text style={{ marginTop: 10, opacity: 0.8 }}>
            No insights yet. Once a night is processed, they’ll show up here.
          </Text>
        ) : (
          <View style={{ marginTop: 10, gap: 10 }}>
            <Text style={{ fontSize: 16 }}>
              <Text style={{ fontWeight: "700" }}>Risk: </Text>
              {latest.risk_score ?? "—"} ({niceBand(latest.risk_band)})
            </Text>

            {latest.primary_risk ? (
              <Text>
                <Text style={{ fontWeight: "700" }}>Primary risk: </Text>
                {latest.primary_risk}
              </Text>
            ) : null}

            {latest.dominant_factor ? (
              <Text>
                <Text style={{ fontWeight: "700" }}>Dominant factor: </Text>
                {latest.dominant_factor}
              </Text>
            ) : null}

            {latest.what_protocol ? (
              <Text>
                <Text style={{ fontWeight: "700" }}>Protocol: </Text>
                {latest.what_protocol}
              </Text>
            ) : null}

            {latest.tonight_action ? (
              <Text>
                <Text style={{ fontWeight: "700" }}>Tonight: </Text>
                {latest.tonight_action}
              </Text>
            ) : null}

            {latest.avoid_tonight ? (
              <Text>
                <Text style={{ fontWeight: "700" }}>Avoid tonight: </Text>
                {latest.avoid_tonight}
              </Text>
            ) : null}

            {latest.why_this_matters ? (
              <Text>
                <Text style={{ fontWeight: "700" }}>Why this matters: </Text>
                {latest.why_this_matters}
              </Text>
            ) : null}

            {latest.encouragement ? (
              <Text>
                <Text style={{ fontWeight: "700" }}>Encouragement: </Text>
                {latest.encouragement}
              </Text>
            ) : null}

            <Text style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
              Updated: {new Date(latest.computed_at).toLocaleString()}
            </Text>
          </View>
        )}
      </View>

      {/* Manual sleep log form (unchanged behavior) */}
      <View style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#222", marginBottom: 18 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>Add Sleep Log</Text>

        <Text style={{ fontWeight: "600" }}>Sleep date (YYYY-MM-DD)</Text>
        <TextInput
          value={sleepDate}
          onChangeText={setSleepDate}
          placeholder="2026-02-14"
          style={{ borderWidth: 1, borderColor: "#333", padding: 10, borderRadius: 10, marginTop: 6, marginBottom: 10 }}
        />

        <Text style={{ fontWeight: "600" }}>Bedtime (HH:MM)</Text>
        <TextInput
          value={bedtime}
          onChangeText={setBedtime}
          placeholder="23:00"
          style={{ borderWidth: 1, borderColor: "#333", padding: 10, borderRadius: 10, marginTop: 6, marginBottom: 10 }}
        />

        <Text style={{ fontWeight: "600" }}>Wake time (HH:MM)</Text>
        <TextInput
          value={wakeTime}
          onChangeText={setWakeTime}
          placeholder="07:00"
          style={{ borderWidth: 1, borderColor: "#333", padding: 10, borderRadius: 10, marginTop: 6, marginBottom: 10 }}
        />

        <Text style={{ fontWeight: "600" }}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Any notes…"
          multiline
          style={{ borderWidth: 1, borderColor: "#333", padding: 10, borderRadius: 10, marginTop: 6, marginBottom: 12, minHeight: 70 }}
        />

        <TouchableOpacity onPress={saveLog} style={{ backgroundColor: "#111", padding: 12, borderRadius: 12, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* Logs list */}
      <View style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#222" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: "700" }}>Recent Logs</Text>
          <TouchableOpacity onPress={fetchLogs} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: "#222" }}>
            <Text style={{ fontWeight: "600" }}>{loadingLogs ? "…" : "Refresh"}</Text>
          </TouchableOpacity>
        </View>

        {loadingLogs ? (
          <ActivityIndicator />
        ) : logs.length === 0 ? (
          <Text style={{ opacity: 0.8 }}>No logs yet.</Text>
        ) : (
          logs.map((l) => (
            <View key={l.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#222" }}>
              <Text style={{ fontWeight: "700" }}>{l.sleep_date}</Text>
              <Text style={{ opacity: 0.85 }}>
                Bed: {l.bedtime ?? "—"} • Wake: {l.wake_time ?? "—"}
              </Text>
              {l.notes ? <Text style={{ marginTop: 4 }}>{l.notes}</Text> : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
