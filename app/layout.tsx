import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";
import IPhoneInstallPrompt from "@/components/IPhoneInstallPrompt";

export const metadata = {
  title: "SleepFix",
  description: "SleepFix",
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
      </head>

      <body>
<IPhoneInstallPrompt />
{children}
</body>
    </html>
  );
}
