// app/auth/error/page.tsx

type SearchParams = Record<string, string | string[] | undefined>;

function toText(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v.join(", ");
  return v ?? "";
}

export default function Page({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const entries = searchParams ? Object.entries(searchParams) : [];
  const error = toText(searchParams?.error);
  const desc = toText(searchParams?.error_description);
  const reason = toText(searchParams?.reason);
  const msg = toText(searchParams?.msg);
  const code = toText(searchParams?.code);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h1 style={{ fontSize: 22, margin: 0, marginBottom: 8 }}>
          Sorry, something went wrong.
        </h1>

        <p style={{ marginTop: 0, opacity: 0.85 }}>
          {error || reason || msg || desc
            ? "Here are the details returned in the URL:"
            : "No additional error details were provided."}
        </p>

        {(error || reason || msg || desc || code) && (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {error && <div><b>Error:</b> {error}</div>}
            {desc && <div><b>Description:</b> {desc}</div>}
            {reason && <div><b>Reason:</b> {reason}</div>}
            {msg && <div><b>Message:</b> {msg}</div>}
            {code && <div><b>Code:</b> {code}</div>}
          </div>
        )}

        {entries.length > 0 && (
          <>
            <h2 style={{ fontSize: 14, marginTop: 18, marginBottom: 8, opacity: 0.9 }}>
              Raw query params
            </h2>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                margin: 0,
                fontSize: 12,
                opacity: 0.9,
              }}
            >
{entries.map(([k, v]) => `${k}=${toText(v)}`).join("\n")}
            </pre>
          </>
        )}
      </div>
    </main>
  );
}
