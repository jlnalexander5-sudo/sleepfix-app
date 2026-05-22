import Link from "next/link";
import Head from "next/head";
import Script from "next/script";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1d2dbf" />
      </Head>

      <Script id="sleepfixme-sw" strategy="afterInteractive">
        {`
          if ("serviceWorker" in navigator) {
            window.addEventListener("load", function () {
              navigator.serviceWorker.register("/sw.js").catch(function (err) {
                console.error("SW registration failed:", err);
              });
            });
          }
        `}
      </Script>

      <div style={{ minHeight: "100vh", fontSize: "18px", lineHeight: 1.6 }}>
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
               Diary
              </Link>

              <span className="sf-sep">|</span>

              <Link href="/protected/sleep" style={{ textDecoration: "none" }}>
                Sleep
              </Link>
<span className="sf-sep">|</span>

<Link href="/protected/protocols" style={{ textDecoration: "none" }}>
  Protocols
</Link>

              <span className="sf-sep">|</span>

              <Link href="/protected/profile" style={{ textDecoration: "none" }}>
                Profile
              </Link>

              <span className="sf-sep">|</span>

              <Link href="/protected/faq" style={{ textDecoration: "none" }}>
                FAQ
              </Link>
            </div>
          </nav>
        </header>

        <main style={{ maxWidth: 980, margin: "0 auto" }}>{children}</main>

       <footer
  style={{
    maxWidth: 980,
    margin: "0 auto",
    padding: "22px 0 30px",
    borderTop: "1px solid #d7d7d7",
    fontSize: 14,
    color: "#444",
    fontWeight: 500,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  }}
>
          <div>
            All rights reserved, copyrighted, 2026, proprietary of J. Alexander.
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/terms" style={{ textDecoration: "none" }}>
              Terms
            </Link>

            <span>|</span>

            <Link href="/privacy" style={{ textDecoration: "none" }}>
              Privacy
            </Link>

            <span>|</span>

            <Link href="/medical-disclaimer" style={{ textDecoration: "none" }}>
              Medical Disclaimer
            </Link>
          </div>
        </footer>
      </div>
    </>
  );
}
