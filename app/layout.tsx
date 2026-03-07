import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";

export const metadata = {
  title: "SleepFixMe",
  description: "SleepFixMe",
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

      <body>{children}</body>
    </html>
  );
}
