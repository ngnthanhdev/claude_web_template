import type { Locale } from "@shared/localization";

/**
 * `e2e/fixtures/purchasable-product.ts` — the seeded-purchasable-product
 * contract `commerce.spec.ts` (T-e3a9d7) drives the Wave-1 cart -> checkout ->
 * sandbox-settle -> library -> download happy path against, plus the route
 * paths that flow visits. Kept separate from `fixtures/test-catalogue.ts`
 * (out of this task's file scope) rather than merged into it.
 *
 * Reuses the first browse-suite fixture product from
 * `apps/api/prisma/seed-e2e.mjs` ("aurora-storefront") instead of adding a
 * fourth product row: every seeded product is already published with priced
 * Regular/Extended licences (see `fixtures/test-catalogue.ts`'s
 * `MIN_SEEDED_PRODUCTS_IN_CATEGORY` contract), so the only real gap for a
 * purchase-to-download flow was a backing artifact file — which
 * `seed-e2e.mjs` now writes under `LOCAL_ARTIFACT_STORAGE_DIR` for this exact
 * product/version. The id/slug/version/titles below must stay in literal sync
 * with `seed-e2e.mjs`'s `PRODUCTS[0]` entry — that seed is a plain `.mjs` and
 * can't import this `.ts` module (see its own header comment).
 */

export const PURCHASABLE_PRODUCT_ID = "b0000000-0000-4000-8000-000000000001";
export const PURCHASABLE_PRODUCT_SLUG = "aurora-storefront";
export const PURCHASABLE_PRODUCT_VERSION = "1.0.0";

/** Matches `seed-e2e.mjs`'s `PRODUCTS[0]` translations exactly — needed to build the add-to-cart button's accessible name (`Cart.addToCart.addLabelForTitle`), which embeds the localized product title. */
export const PURCHASABLE_PRODUCT_TITLES: Record<Locale, string> = {
  en: "Aurora Storefront",
  vi: "Mẫu Aurora Storefront",
};

export function templatePath(locale: Locale, slug: string): string {
  return `/${locale}/templates/${slug}`;
}

export function cartPath(locale: Locale): string {
  return `/${locale}/cart`;
}

export function checkoutResultPath(locale: Locale): string {
  return `/${locale}/checkout/result`;
}

export function accountLibraryPath(locale: Locale): string {
  return `/${locale}/account/library`;
}
