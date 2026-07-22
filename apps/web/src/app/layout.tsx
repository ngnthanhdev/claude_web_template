import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";

import "./globals.css";

const displayFont = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-display-face" });
const bodyFont = Geist_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-body-face" });

export const metadata: Metadata = {
  title: "KITVERA — Web template marketplace",
  description: "A bilingual marketplace for discovering and licensing web templates.",
};

export const viewport: Viewport = {
  initialScale: 1,
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={`${displayFont.variable} ${bodyFont.variable}`} lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
