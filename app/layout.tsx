import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";
import IPhoneInstallPrompt from "@/components/IPhoneInstallPrompt";

export const metadata = {
  title: "SleepFixMe",
  description: "SleepFixMe",
  manifest: "/manifest.json"
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
