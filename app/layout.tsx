// app/layout.tsx
import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";

export const metadata = {
  title: "SleepFix",
  description: "SleepFix",
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
