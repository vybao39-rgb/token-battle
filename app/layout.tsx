import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token Battle — Nansen Onchain Comparison",
  description:
    "Compare two token contracts using Nansen liquidity, trading activity, holder breadth, and smart-money flow data.",
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
