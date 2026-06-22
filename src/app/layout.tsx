import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GMZero — Verifiable AI Game Master on 0G",
  description:
    "An on-chain dungeon RPG where the Game Master is verifiable AI on 0G Compute, your save lives on 0G Storage, and your loot is a real on-chain asset.",
  openGraph: {
    title: "GMZero — Verifiable AI Game Master on 0G",
    description:
      "Verify the dice. Own the loot. No house edge. An AI-native dungeon RPG built on 0G.",
    images: ["/cover.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GMZero — Verifiable AI Game Master on 0G",
    description: "Verify the dice. Own the loot. No house edge.",
    images: ["/cover.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
