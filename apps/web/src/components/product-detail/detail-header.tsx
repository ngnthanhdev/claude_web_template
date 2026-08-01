"use client";

import { licenceIdentifierSchema } from "@shared/catalogue";
import type { ProductDetailResponse } from "@shared/catalogue";
import { localeSchema } from "@shared/localization";
import { useLocale, useTranslations } from "next-intl";

import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { useCurrency } from "@/lib/currency";
import { formatMoney, humanizeSlug } from "@/lib/format";

export interface DetailHeaderProps {
  product: ProductDetailResponse;
}

/**
 * The product hero: category/version badges, localized title, summary,
 * description, primary media (reserved aspect ratio), tags, and a quick
 * add-to-cart block offering every licence tier — every field sourced
 * directly from the validated detail response, nothing invented.
 */
export function DetailHeader({ product }: DetailHeaderProps) {
  const locale = localeSchema.parse(useLocale());
  const { currency } = useCurrency();
  const t = useTranslations("Product.header");
  const tLicence = useTranslations("Product.licence");
  const tCart = useTranslations("Cart.addToCart");

  const translation =
    product.translations.find((entry) => entry.locale === locale) ??
    product.translations[0];
  const heroMedia = product.media[0];
  const title = translation?.title ?? product.slug;

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

      <div
        aria-labelledby="detail-header-add-to-cart-heading"
        className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-muted/40 p-4"
      >
        <h2
          className="text-sm font-semibold uppercase tracking-wide text-foreground"
          id="detail-header-add-to-cart-heading"
        >
          {tCart("detailHeading")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {licenceIdentifierSchema.options.map((identifier) => {
            const option = product.licenceOptions.find(
              (entry) => entry.identifier === identifier,
            );
            const price = option?.prices.find(
              (entry) => entry.currency === currency,
            );

            return (
              <div
                className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3"
                key={identifier}
              >
                <span className="font-medium text-foreground">
                  {tLicence(identifier)}
                </span>
                <span className="text-lg font-semibold text-foreground">
                  {price
                    ? formatMoney(price, locale)
                    : tLicence("priceUnavailable")}
                </span>
                {price ? (
                  <AddToCartButton
                    licence={identifier}
                    price={price}
                    productId={product.id}
                    slug={product.slug}
                    title={title}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
}
