"use client";

import { useLocale, useTranslations } from "next-intl";

import { humanizeSlug } from "@/lib/format";
import type { ProductDetailResponse } from "@shared/catalogue";
import { localeSchema } from "@shared/localization";

export interface DetailHeaderProps {
  product: ProductDetailResponse;
}

/**
 * The product hero: category/version badges, localized title, summary,
 * description, primary media (reserved aspect ratio), and tags — every
 * field sourced directly from the validated detail response, nothing
 * invented.
 */
export function DetailHeader({ product }: DetailHeaderProps) {
  const locale = localeSchema.parse(useLocale());
  const t = useTranslations("Product.header");

  const translation =
    product.translations.find((entry) => entry.locale === locale) ??
    product.translations[0];
  const heroMedia = product.media[0];

  return (
    <header className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex w-fit items-center rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
          {humanizeSlug(product.category)}
        </span>
        <span className="inline-flex w-fit items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          {t("versionLabel", { version: product.currentVersion })}
        </span>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {translation?.title ?? product.slug}
      </h1>
      <p className="text-lg text-muted-foreground">
        {translation?.summary ?? ""}
      </p>

      {heroMedia ? (
        <div className="aspect-video w-full overflow-hidden rounded-[var(--radius-panel)] border border-border bg-muted">
          {heroMedia.kind === "video" ? (
            <video
              className="size-full object-cover"
              controls
              src={heroMedia.url}
            />
          ) : (
            <img
              alt={
                heroMedia.translations.find((entry) => entry.locale === locale)
                  ?.alt ?? ""
              }
              className="size-full object-cover"
              src={heroMedia.url}
            />
          )}
        </div>
      ) : null}

      <p className="max-w-3xl text-base text-foreground">
        {translation?.description ?? ""}
      </p>

      {product.tags.length > 0 ? (
        <ul aria-label={t("tagsLabel")} className="flex flex-wrap gap-1.5">
          {product.tags.map((tag) => (
            <li
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
              key={tag}
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
