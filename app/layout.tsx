import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";

export const metadata = {
  title: "SleepFixMe",
  description: "SleepFixMe",
  manifest: "/manifest.json",
  themeColor: "#1d2dbf",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
