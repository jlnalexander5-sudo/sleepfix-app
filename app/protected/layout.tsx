// app/protected/layout.tsx
import Link from "next/link";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
   <div style={{ minHeight: "100vh", fontSize: "18px", lineHeight: 1.6, fontFamily: "Verdana, sans-serif" }}>
      {/* Top Nav */}
      <header
        style={{
          borderBottom: "1px solid rgba(0,0,0,0.12)",
          padding: "14px 16px",
        }}
      >
        <nav
          style={{
            maxWidth: 980,
            margin: "0 auto",
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Link href="/protected/dashboard" style={{ textDecoration: "none", fontFamily: "Verdana, sans-serif", color: "#000080", fontSize: 35, fontWeight: 900, marginRight: 10 }}>SleepFix</Link>

          <Link href="/protected/dashboard" style={{ textDecoration: "none", fontFamily: "Verdana, sans-serif", color: "#000080", fontWeight: 700 }}>
            Dashboard
          </Link>

          <span style={{ opacity: 0.35 }}>|</span>

          <Link href="/protected/habits" style={{ textDecoration: "none", fontFamily: "Verdana, sans-serif", color: "#000080", fontWeight: 700 }}>
            Habits
          </Link>

          <span style={{ opacity: 0.35 }}>|</span>

          <Link href="/protected/sleep" style={{ textDecoration: "none", fontFamily: "Verdana, sans-serif", color: "#000080", fontWeight: 700 }}>
            Sleep
          </Link>
        </nav>
      </header>

      {/* Page body */}
      <main style={{ maxWidth: 980, margin: "0 auto" }}>{children}</main>
    </div>
  );
}
