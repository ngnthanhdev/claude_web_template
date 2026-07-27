import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { isSupportedLocale } from "@/i18n/routing";

const displayFont = Geist({
  subsets: ["latin", "latin-ext"],
  variable: "--font-display-face",
});
const bodyFont = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body-face",
});

type LocaleLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

// The middleware issues a per-request CSP nonce, which Next can only inject
// into a page's scripts when that page is rendered per request. Statically
// prerendered pages ship build-time HTML with no nonce, so every script is
// blocked by `script-src 'nonce-…' 'strict-dynamic'`. Force the whole locale
// subtree to render dynamically so the nonce reaches its scripts.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: Pick<LocaleLayoutProps, "params">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { description: t("description"), title: t("title") };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  // Sets the active locale for next-intl's server APIs on this request. Needed
  // even under `force-dynamic` — without it, translations fall back to the
  // default locale and an `/en` page renders Vietnamese copy.
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      className={`${displayFont.variable} ${bodyFont.variable}`}
      lang={locale}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
