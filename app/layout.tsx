import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dump Risk Alarm — Nansen Onchain Intelligence",
  description:
    "Analyze token distribution risk with Nansen Smart Money, exchange flows, holders, transfers, market pressure, and BTC-relative strength.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
