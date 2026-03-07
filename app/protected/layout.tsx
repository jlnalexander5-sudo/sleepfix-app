// app/protected/layout.tsx
import Link from "next/link";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>

      <div style={{ minHeight: "100vh", fontSize: "18px", lineHeight: 1.6 }}>
        {/* Top Nav */}
        <header
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            padding: "14px 16px",
          }}
        >
          <nav className="sf-topnav">
            <a
              href="/protected/dashboard"
              className="sf-brand"
              aria-label="SleepFixMe home"
            >
              SleepFixMe
            </a>

            <div className="sf-links">
              <Link href="/protected/dashboard" style={{ textDecoration: "none" }}>
                Dashboard
              </Link>

              <span className="sf-sep">|</span>

              <Link href="/protected/habits" style={{ textDecoration: "none" }}>
                Habits
              </Link>

              <span className="sf-sep">|</span>

              <Link href="/protected/sleep" style={{ textDecoration: "none" }}>
                Sleep
              </Link>

              <span className="sf-sep">|</span>

              <Link href="/protected/faq" style={{ textDecoration: "none" }}>
                FAQ
              </Link>
            </div>
          </nav>
        </header>

        {/* Page body */}
        <main style={{ maxWidth: 980, margin: "0 auto" }}>{children}</main>
      </div>
    </>
  );
}
