"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { localeSchema } from "@shared/localization";

/**
 * Renders for an unknown, draft, or delisted product slug. The API's
 * `GET /v1/products/:slug` already 404s for all three cases (draft/delisted
 * rows never resolve for public callers), so this is the single, honest
 * "not found" surface — it never distinguishes why the slug didn't resolve
 * and never leaks any seller-private or persistence-only detail.
 */
export default function ProductNotFound() {
  const locale = localeSchema.parse(useLocale());
  const t = useTranslations("Product.notFound");

  return (
    <div
      className="flex w-full flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)] text-center"
      role="status"
    >
      <h1 className="text-lg font-semibold text-foreground">{t("heading")}</h1>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <Link
        className={buttonVariants({ variant: "outline" })}
        href={`/${locale}/search`}
      >
        {t("action")}
      </Link>
    </div>
  );
}
