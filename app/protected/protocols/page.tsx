export default function ProtocolsPage() {
  const H1 = { fontSize: 32, fontWeight: 900, marginBottom: 10, fontFamily: "Verdana, sans-serif", color: "#000080" } as const;
  const H2 = { fontSize: 18, fontWeight: 900, marginBottom: 6, fontFamily: "Verdana, sans-serif", color: "#000080" } as const;

  const sectionStyle = { marginBottom: 18 } as const;
  const ulStyle = { marginLeft: 18, lineHeight: 1.5 } as const;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 18px" }}>
      <h1 style={H1}>RRSM Protocols</h1>
      <p style={{ opacity: 0.85, marginBottom: 16 }}>
        These protocols are short, practical steps that may appear in your RRSM recommendations. Use them as simple “next‑night experiments”.
      </p>

      <div style={{ marginBottom: 18, padding: 14, border: "1px solid #eee", borderRadius: 12, background: "#fafafa" }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Quick index</div>
        <ul style={{ marginLeft: 18, lineHeight: 1.6 }}>
          <li><a href="#pre-sleep-discharge">Pre‑Sleep Discharge Protocol</a></li>
          <li><a href="#rb2-deceleration">RB2 Deceleration Protocol</a></li>
          <li><a href="#internal-cooling">Internal Cooling Protocol</a></li>
          <li><a href="#sleep-entry-lock">Sleep Entry Lock Protocol</a></li>
          <li><a href="#mental-discharge">Mental Discharge Protocol</a></li>
          <li><a href="#cooling-discharge">Cooling Discharge Protocol</a></li>
          <li><a href="#doms-compression">DOMS Compression Protocol</a></li>
        </ul>
      </div>

      <section id="pre-sleep-discharge" style={sectionStyle}>
        <h2 style={H2}>Pre‑Sleep Discharge Protocol</h2>
        <p style={{ marginBottom: 8 }}>
          Best for: wired‑but‑tired, overstimulated, difficulty switching off (sleep onset issues).
        </p>
        <ul style={ulStyle}>
          <li><b>Step 1 — Outbound rhythmic discharge (15–30 min):</b> choose one: walking (best), gentle cycling, slow body movement, or stretching <i>with motion</i> (not static). Rule: continuous motion, not exertion.</li>
          <li><b>Step 2 — Sensory smoothing (10 min):</b> dim lighting, no screens, neutral temperature, no high‑contrast sound.</li>
          <li><b>Step 3 — Breath normalisation (5 min):</b> natural breathing, slightly longer exhale, no breath holds, no visualisation.</li>
          <li><b>Step 4 — Sleep entry:</b> lie down only after the body quiets itself. If restlessness returns, repeat Step 1 briefly.</li>
        </ul>
      </section>

      <section id="rb2-deceleration" style={sectionStyle}>
        <h2 style={H2}>RB2 Deceleration Protocol</h2>
        <p style={{ marginBottom: 8 }}>
          Best for: racing mind / engagement stuck‑on / emotional overstimulation (“RB2 overheating”). Do this before bed (15–20 minutes).
        </p>
        <ul style={ulStyle}>
          <li><b>Step 1 — Remove rhythmic stimulation:</b> no music, no scrolling, no complex thought, no narrative replay.</li>
          <li><b>Step 2 — Breath as the rhythm governor:</b> inhale 4s → pause 2s → exhale 6s → pause 2s. Keep it gentle (no breath holds).</li>
          <li><b>Step 3 — Keep it simple:</b> if your mind re‑engages, return to the breathing pattern without “trying to solve” anything.</li>
        </ul>
      </section>

      <section id="internal-cooling" style={sectionStyle}>
        <h2 style={H2}>Internal Cooling Protocol</h2>
        <p style={{ marginBottom: 8 }}>
          Best for: “hot core / active mind” feeling without needing cold temperature changes.
        </p>
        <ul style={ulStyle}>
          <li>Let awareness soften out to the <b>soles of feet</b>, <b>back of knees</b>, <b>elbows</b>, and <b>palms</b>.</li>
          <li>Do not “focus hard” — just allow attention to spread.</li>
          <li>This reduces rhythmic concentration and helps the system downshift.</li>
        </ul>
      </section>

      <section id="sleep-entry-lock" style={sectionStyle}>
        <h2 style={H2}>Sleep Entry Lock Protocol</h2>
        <p style={{ marginBottom: 8 }}>
          Best for: sleep fragmentation, frequent awakenings, “clarity spikes” when drifting off.
        </p>
        <ul style={ulStyle}>
          <li>Once sleepy, <b>don’t re‑engage thought</b> (no checking, no planning).</li>
          <li>Let micro‑images dissolve; don’t “track” them.</li>
          <li>If clarity spikes, return to gentle breath and let sleep happen without effort.</li>
        </ul>
      </section>

      <section id="mental-discharge" style={sectionStyle}>
        <h2 style={H2}>Mental Discharge Protocol</h2>
        <p style={{ marginBottom: 8 }}>Best for: racing thoughts, anxiety, overstimulation.</p>
        <ul style={ulStyle}>
          <li>2‑minute brain dump (write thoughts/tasks)</li>
          <li>10 slow breaths with longer exhale</li>
          <li>Short, calming audio or silence</li>
        </ul>
      </section>

      <section id="cooling-discharge" style={sectionStyle}>
        <h2 style={H2}>Cooling Discharge Protocol</h2>
        <p style={{ marginBottom: 8 }}>Best for: heat, sweating, hot room, inflammation.</p>
        <ul style={ulStyle}>
          <li>Cool shower or cool pack (not ice) for 2–5 minutes</li>
          <li>Lower room temperature / lighter bedding</li>
          <li>Hydrate lightly (small sips)</li>
        </ul>
      </section>

      <section id="doms-compression" style={sectionStyle}>
        <h2 style={H2}>DOMS Compression Protocol</h2>
        <p style={{ marginBottom: 8 }}>Best for: body heaviness, soreness, “wired but tired”, muscular tension.</p>
        <ul style={ulStyle}>
          <li>Light compression (socks/leggings) or gentle body pressure</li>
          <li>Slow nasal breathing for 3–5 minutes</li>
          <li>Low light + minimal stimulation</li>
        </ul>
      </section>
    </div>
  );
}
