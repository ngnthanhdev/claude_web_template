"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";

import { CartNavEntry } from "@/components/cart/cart-nav-entry";
import { LocaleCurrencyToggle } from "@/components/nav/locale-currency-toggle";
import { MegaMenu } from "@/components/nav/mega-menu";
import { MobileDrawer } from "@/components/nav/mobile-drawer";
import { buttonVariants } from "@/components/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const t = useTranslations("Shell");

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        {t("skipToContent")}
      </a>
      <header className="site-header">
        <div className="shell-container header-row">
          <Link
            aria-label={t("homeLabel")}
            className="wordmark"
            href={`/${locale}`}
          >
            KITVERA
          </Link>
          <nav
            aria-label={t("primaryNavigation")}
            className="flex items-center gap-2"
          >
            <MegaMenu />
            <Link
              aria-label={t("search")}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              href={`/${locale}/search`}
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="20"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="20"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" x2="16.65" y1="21" y2="16.65" />
              </svg>
            </Link>
            <CartNavEntry />
            <div className="hidden sm:block">
              <LocaleCurrencyToggle />
            </div>
            <MobileDrawer />
          </nav>
        </div>
      </header>
      <main className="shell-container site-main" id="main-content">
        {children}
      </main>
      <footer className="site-footer">
        <div className="shell-container footer-row">
          <span>KITVERA</span>
          <span>{t("footerFoundation")}</span>
        </div>
      </footer>
    </div>
  );
}
