"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useCart } from "@/lib/cart-store";
import { cn } from "@/lib/utils";

const MAX_DISPLAYED_COUNT = 99;

/**
 * The header's entry point into `/[locale]/cart` (design §1/§6): a plain
 * link — no server call, since the count it shows comes straight from the
 * client-only cart store — with a badge reflecting the current line count.
 */
export function CartNavEntry() {
  const locale = useLocale();
  const t = useTranslations("Cart.navEntry");
  const { count } = useCart();

  return (
    <Link
      aria-label={t("label", { count })}
      className={cn(
        buttonVariants({ size: "icon", variant: "ghost" }),
        "relative",
      )}
      href={`/${locale}/cart`}
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
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex size-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold text-primary-foreground"
        >
          {count > MAX_DISPLAYED_COUNT ? `${MAX_DISPLAYED_COUNT}+` : count}
        </span>
      ) : null}
    </Link>
  );
}
