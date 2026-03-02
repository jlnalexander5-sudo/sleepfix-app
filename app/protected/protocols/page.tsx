export default function ProtocolsPage() {
  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 18px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 10, fontFamily: "Verdana, sans-serif", color: "#000080" }}>
        RRSM Protocol Explanations
      </h1>
      <p style={{ opacity: 0.85, marginBottom: 18 }}>
        These are short explanations of protocols that may appear in your RRSM recommendations.
      </p>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 6, fontFamily: "Verdana, sans-serif", color: "#000080" }}>
          DOMS Compression Protocol
        </h2>
        <p style={{ marginBottom: 8 }}>Best for: body heaviness, soreness, “wired but tired”, muscular tension.</p>
        <ul style={{ marginLeft: 18 }}>
          <li>Light compression (socks/leggings) or gentle body pressure</li>
          <li>Slow nasal breathing for 3–5 minutes</li>
          <li>Low light + minimal stimulation</li>
        </ul>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 6, fontFamily: "Verdana, sans-serif", color: "#000080" }}>
          Cooling Discharge Protocol
        </h2>
        <p style={{ marginBottom: 8 }}>Best for: heat, sweating, hot room, inflammation.</p>
        <ul style={{ marginLeft: 18 }}>
          <li>Cool shower or cool pack (not ice) for 2–5 minutes</li>
          <li>Lower room temperature / lighter bedding</li>
          <li>Hydrate lightly (small sips)</li>
        </ul>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 6, fontFamily: "Verdana, sans-serif", color: "#000080" }}>
          Mental Discharge Protocol
        </h2>
        <p style={{ marginBottom: 8 }}>Best for: racing thoughts, anxiety, overstimulation.</p>
        <ul style={{ marginLeft: 18 }}>
          <li>2-minute brain dump (write thoughts/tasks)</li>
          <li>10 slow breaths with longer exhale</li>
          <li>Short, calming audio or silence</li>
        </ul>
      </section>
    </div>
  );
}
