import type { Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const viewport: Viewport = {
  initialScale: 1,
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
