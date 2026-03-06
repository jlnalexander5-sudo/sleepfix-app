import { runRRSMEngineV2 } from "./engine-v2";
import type { RRSMMetricsNight, RRSMV2Insight } from "./engine-v2";

export type RRSMV3Insight = RRSMV2Insight & {
  trend?: "improving" | "worsening" | "stable" | "mixed";
  protocol?: string;
  driverConfidence?: "low" | "moderate" | "high";
};

function detectTrend(nights: RRSMMetricsNight[]): RRSMV3Insight["trend"] {
  if (nights.length < 4) return "mixed";

  const last = nights.slice(-3);

  const q = last.map(n => n.quality ?? 0);
  const w = last.map(n => n.wakeUps ?? 0);

  if (q[2] > q[1] && q[1] > q[0]) return "improving";
  if (q[2] < q[1] && q[1] < q[0]) return "worsening";

  if (w[2] < w[1] && w[1] < w[0]) return "improving";
  if (w[2] > w[1] && w[1] > w[0]) return "worsening";

  return "stable";
}

function protocolForIssue(issue: RRSMV2Insight["primaryIssue"]) {
  switch (issue) {
    case "onset":
      return "Cooling Discharge Protocol";
    case "fragmentation":
      return "Sleep Entry Lock Protocol";
    case "recovery":
      return "DOMS Compression Protocol";
    default:
      return "Mental Discharge Protocol";
  }
}

function driverConfidence(nights: RRSMMetricsNight[], driver: string) {
  if (!driver || driver === "(no driver logged)") return "low";

  const matches = nights.filter(
    n => n.primaryDriver === driver || n.secondaryDriver === driver
  ).length;

  if (matches >= 4) return "high";
  if (matches >= 2) return "moderate";
  return "low";
}

export function runRRSMEngineV3(nights: RRSMMetricsNight[]): RRSMV3Insight {

  const base = runRRSMEngineV2(nights);

  const trend = detectTrend(nights);

  const protocol = protocolForIssue(base.primaryIssue);

  const driverConf = driverConfidence(nights, base.topDriver);

  const why = [...base.why];

  if (trend) {
    why.push(`Trend detected: ${trend}.`);
  }

  const actions = [...base.actions];

  actions.unshift(`Recommended protocol: ${protocol}`);

  return {
    ...base,
    trend,
    protocol,
    driverConfidence: driverConf,
    why,
    actions
  };
}
