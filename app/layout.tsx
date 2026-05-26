import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import IPhoneInstallPrompt from "@/components/IPhoneInstallPrompt";

const siteUrl = "https://sleepfixme.com";
const siteName = "SleepFixMe";
const siteDescription =
  "SleepFixMe helps you log sleep, detect patterns, and receive RRSM-based sleep insights and protocols.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  manifest: "/manifest.json",
  icons: {
    icon: "/icon192.png",
    apple: "/icon192.png",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName,
    title: siteName,
    description: siteDescription,
    images: [
      {
        url: "/icon512.png",
        width: 512,
        height: 512,
        alt: "SleepFixMe",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: siteName,
    description: siteDescription,
    images: ["/icon512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#1d2dbf",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon192.png" />
        <link rel="apple-touch-icon" href="/icon192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SleepFixMe" />
      </head>
      <body>
        <IPhoneInstallPrompt />
        {children}
      </body>
    </html>
  );
}
