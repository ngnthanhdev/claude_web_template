"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  LicenceIdentifier,
  LocalizedCategorySummary,
  ProductCard as ProductCardData,
} from "@shared/catalogue";
import { localeSchema } from "@shared/localization";

export interface ProductCardProps {
  product: ProductCardData;
  /** The current catalogue's category vocabulary, from `GET /v1/categories`. */
  categories: readonly LocalizedCategorySummary[];
  /** The collection's currently-selected licence tier (URL-backed state, not a global context). */
  licence: LicenceIdentifier;
  className?: string;
}

const MAX_VISIBLE_TAGS = 3;

/**
 * A reusable catalogue product card: localized title/summary, category,
 * tag badges, and the selected-licence price in the selected currency. The
 * whole card is a link to the product detail route
 * (`/[locale]/templates/[slug]`, per the approved design).
 */
export function ProductCard({
  product,
  categories,
  licence,
  className,
}: ProductCardProps) {
  // `useLocale()` is typed as plain `string` unless an `AppConfig` module
  // augmentation narrows it (this app has none); re-validate against the
  // shared vocabulary so `formatMoney` receives the proper `Locale` type.
  const locale = localeSchema.parse(useLocale());
  const { currency } = useCurrency();
  const t = useTranslations("Collection.card");
  const tLicence = useTranslations("Collection.licence");

  const translation =
    product.translations.find((entry) => entry.locale === locale) ??
    product.translations[0];
  const categoryName =
    categories
      .find((category) => category.slug === product.category)
      ?.translations.find((entry) => entry.locale === locale)?.name ??
    product.category;
  const licenceOption = product.licenceOptions.find(
    (option) => option.identifier === licence,
  );
  const price = licenceOption?.prices.find(
    (entry) => entry.currency === currency,
  );
  // Checkout always charges in VND (design §1/§9), so the cart's stored
  // display metadata is captured in VND regardless of the storefront's
  // browsing-currency toggle — only the price shown *here*, for browsing,
  // follows `currency`.
  const cartPrice = licenceOption?.prices.find(
    (entry) => entry.currency === "VND",
  );
  const visibleTags = product.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = product.tags.length - visibleTags.length;

  return (
    <div
      className={cn(
        "group flex flex-col rounded-[var(--radius-panel)] border border-border bg-background transition-colors duration-[var(--dur-short)] ease-[var(--ease-out)] hover:border-primary",
        className,
      )}
    >
      {/* The card's primary navigation target: everything except the
          price/add-to-cart row, which needs its own interactive control and
          so can't sit inside this anchor (no nested interactive elements). */}
      <Link
        className="flex flex-1 flex-col gap-2 rounded-t-[var(--radius-panel)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        href={`/${locale}/templates/${product.slug}`}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-[var(--radius-panel)] bg-muted">
          {/* Decorative: the visible/announced title below already names the product. */}
          <img
            alt=""
            className="size-full object-cover transition-transform duration-[var(--dur-short)] ease-[var(--ease-out)] group-hover:scale-105"
            loading="lazy"
            src={product.thumbnailUrl}
          />
        </div>
        <div className="flex flex-1 flex-col gap-2 px-4 pt-4">
          <span className="inline-flex w-fit items-center rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            {categoryName}
          </span>
          <h3 className="text-base font-semibold text-foreground">
            {translation?.title ?? product.slug}
          </h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {translation?.summary ?? ""}
          </p>
          {visibleTags.length > 0 ? (
            <ul aria-label={t("tagsLabel")} className="flex flex-wrap gap-1.5">
              {visibleTags.map((tag) => (
                <li
                  className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                  key={tag}
                >
                  {tag}
                </li>
              ))}
              {hiddenTagCount > 0 ? (
                <li className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {t("moreTags", { count: hiddenTagCount })}
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </Link>
      <div className="flex flex-col gap-2 p-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">
            {tLicence(licence)}
          </span>
          <span className="text-base font-semibold text-foreground">
            {price ? formatMoney(price, locale) : t("priceUnavailable")}
          </span>
        </div>
        {cartPrice ? (
          <AddToCartButton
            className="w-full sm:w-auto"
            licence={licence}
            price={cartPrice}
            productId={product.id}
            slug={product.slug}
            title={translation?.title ?? product.slug}
          />
        ) : null}
      </div>
    </div>
  );
}
