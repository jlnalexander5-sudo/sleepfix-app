// app/protected/layout.tsx
import Link from "next/link";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
   <div style={{ minHeight: "100vh", fontSize: "18px", lineHeight: 1.6 }}>
      {/* Top Nav */}
      <header className="sf-header">
          <div className="sf-header-inner">
            <div className="sf-brand">SleepFix</div>
            <nav className="sf-nav" aria-label="Primary">
              <Link href="/protected/dashboard">Dashboard</Link>
              <span className="sf-sep">|</span>
              <Link href="/protected/habits">Habits</Link>
              <span className="sf-sep">|</span>
              <Link href="/protected/sleep">Sleep</Link>
            </nav>
          </div>
        </header>

      {/* Page body */}
      <main style={{ maxWidth: 980, margin: "0 auto" }}>{children}</main>
    </div>
  );
}
