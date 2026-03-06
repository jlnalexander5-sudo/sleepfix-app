export function runRRSMEngineV3(nights) {

  const valid = nights.filter(
    n =>
      typeof n.quality === "number" &&
      typeof n.latencyMin === "number" &&
      typeof n.wakeUps === "number"
  );

  if (valid.length < 3) {
    return {
      title: "RRSM preview",
      why: ["Log at least 3 nights to unlock baseline analysis."],
      actions: ["Keep logging nights."],
      confidence: "low",
      risk: "low"
    };
  }

  const avgQuality =
    valid.reduce((a, b) => a + b.quality, 0) / valid.length;

  const avgLatency =
    valid.reduce((a, b) => a + b.latencyMin, 0) / valid.length;

  const avgWakeups =
    valid.reduce((a, b) => a + b.wakeUps, 0) / valid.length;

  let primaryIssue = "mixed";

  if (avgLatency > 25) primaryIssue = "onset";
  else if (avgWakeups > 3) primaryIssue = "fragmentation";
  else if (avgQuality < 6) primaryIssue = "recovery";

  let risk = "low";

  if (avgQuality < 5 || avgWakeups > 4) risk = "high";
  else if (avgQuality < 6.5 || avgLatency > 20) risk = "moderate";

  const drivers = valid
    .map(n => n.primaryDriver || n.secondaryDriver)
    .filter(Boolean);

  let topDriver = null;

  if (drivers.length) {
    const counts = {};
    drivers.forEach(d => {
      counts[d] = (counts[d] || 0) + 1;
    });

    topDriver = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
  }

  let protocol = "Mental Discharge Protocol";

  if (primaryIssue === "fragmentation")
    protocol = "Sleep Entry Lock Protocol";

  if (primaryIssue === "recovery")
    protocol = "DOMS Compression Protocol";

  if (primaryIssue === "onset")
    protocol = "Cooling Discharge Protocol";

  const why = [
    `Average sleep quality ${avgQuality.toFixed(1)}/10`,
    `Average latency ${avgLatency.toFixed(0)} minutes`,
    `Average wake-ups ${avgWakeups.toFixed(1)}`
  ];

  if (topDriver)
    why.push(`Likely driver pattern: ${topDriver}`);

  const actions = [
    `Focus on ${protocol}`,
    "Continue logging at least 3–7 nights"
  ];

  return {
    title: "RRSM Pattern Insight",
    why,
    actions,
    confidence: valid.length >= 5 ? "high" : "medium",
    risk,
    primaryIssue,
    topDriver
  };
}
