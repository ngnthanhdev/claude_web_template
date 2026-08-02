"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";

import { CartNavEntry } from "@/components/cart/cart-nav-entry";
import { LocaleCurrencyToggle } from "@/components/nav/locale-currency-toggle";
import { MegaMenu } from "@/components/nav/mega-menu";
import { MobileDrawer } from "@/components/nav/mobile-drawer";
import { buttonVariants } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { listSellerProducts } from "@/lib/seller-client";

/**
 * The nav's only signal for "does this signed-in caller have seller access"
 * — there is no role/claim on the session itself (design §5/§8: "the
 * client `seller` role is UX only"), so this issues the same read the
 * seller list page itself makes (`GET /v1/seller/products`, one row) and
 * treats a successful response as seller context, any failure (403 for a
 * non-seller, or not-yet-loaded) as not. This never fabricates a "you're a
 * seller" state from client-only data; it only ever reflects what the
 * server guard actually allowed. Customer/account navigation is entirely
 * unaffected — this only ever adds the one seller link, never removes or
 * reorders anything existing.
 */
function useIsSellerContext(): boolean {
  const session = useSession();

  const sellerContextQuery = useQuery({
    queryKey: ["seller", "nav-context"] as const,
    queryFn: () => listSellerProducts({ limit: 1 }),
    enabled: session.status === "authenticated",
    retry: false,
  });

  return sellerContextQuery.isSuccess;
}

function SellerNavEntry() {
  const locale = useLocale();
  const t = useTranslations("Seller.nav");
  const isSeller = useIsSellerContext();

  if (!isSeller) return null;

  return (
    <Link
      className={buttonVariants({ variant: "ghost" })}
      href={`/${locale}/seller`}
    >
      {t("label")}
    </Link>
  );
}

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
            <SellerNavEntry />
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
