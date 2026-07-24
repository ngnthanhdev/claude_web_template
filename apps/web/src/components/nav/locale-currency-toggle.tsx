"use client";

import { currencySchema, localeSchema } from "@shared/localization";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { routing } from "@/i18n/routing";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

/**
 * Swaps only the leading locale segment of the current pathname, so a
 * shopper on `/en/categories/wordpress` who switches to Vietnamese lands on
 * `/vi/categories/wordpress` instead of being bounced back to the home page.
 */
function buildLocaleHref(pathname: string, targetLocale: string): string {
  const segments = pathname.split("/");
  segments[1] = targetLocale;
  return segments.join("/") || `/${targetLocale}`;
}

const toggleOptionClassName =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] px-3 text-sm font-semibold uppercase tracking-wide transition-colors duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function optionStateClassName(isActive: boolean): string {
  return isActive
    ? "bg-primary text-primary-foreground"
    : "text-foreground hover:bg-muted";
}

/**
 * Independent locale and currency switches: picking a language navigates to
 * the same page in the other locale, while picking a currency only updates
 * the shared `CurrencyProvider` state. Neither action affects the other.
 */
export function LocaleCurrencyToggle() {
  const locale = localeSchema.parse(useLocale());
  const pathname = usePathname();
  const { currency, setCurrency } = useCurrency();
  const t = useTranslations("Shell");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        aria-label={t("localeToggleLabel")}
        className="flex gap-1"
        role="group"
      >
        {routing.locales.map((option) => {
          const isActive = option === locale;
          return (
            <Link
              aria-current={isActive ? "true" : undefined}
              className={cn(
                toggleOptionClassName,
                optionStateClassName(isActive),
              )}
              href={buildLocaleHref(pathname, option)}
              key={option}
            >
              {option.toUpperCase()}
            </Link>
          );
        })}
      </div>
      <div
        aria-label={t("currencyToggleLabel")}
        className="flex gap-1"
        role="group"
      >
        {currencySchema.options.map((option) => {
          const isActive = option === currency;
          return (
            <button
              aria-pressed={isActive}
              className={cn(
                toggleOptionClassName,
                optionStateClassName(isActive),
              )}
              key={option}
              onClick={() => setCurrency(option)}
              type="button"
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
