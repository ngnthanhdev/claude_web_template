"use client";

import { useQueries } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import { DiscoveryRail, RailStatus } from "@/components/home/discovery-rail";
import { listProducts } from "@/lib/catalogue-client";
import type {
  LicenceIdentifier,
  LocalizedCategorySummary,
} from "@shared/catalogue";
import { localeSchema, type Currency } from "@shared/localization";

const CATEGORY_RAIL_SIZE = 8;

function pickCategoryName(
  category: LocalizedCategorySummary,
  locale: string,
): string {
  return (
    category.translations.find((translation) => translation.locale === locale)
      ?.name ?? category.slug
  );
}

export interface CategoryIndexProps {
  categories: readonly LocalizedCategorySummary[];
  categoriesLoading: boolean;
  categoriesError: boolean;
  onRetryCategories: () => void;
  currency: Currency;
  licence: LicenceIdentifier;
}

/**
 * The Ecosystem Index's "by category" surface: one product rail per
 * catalogue category. `GET /v1/categories` is owned by the caller (so it
 * shares the mega-menu's cached fetch); this component adds one
 * category-scoped `GET /v1/products` rail per category, which is the only
 * way to get a real per-category slice from the existing collection
 * endpoint (there is no "group by category" response shape).
 */
export function CategoryIndex({
  categories,
  categoriesLoading,
  categoriesError,
  onRetryCategories,
  currency,
  licence,
}: CategoryIndexProps) {
  const locale = localeSchema.parse(useLocale());
  const t = useTranslations("Home.byCategory");

  const railQueries = useQueries({
    queries: categories.map((category) => ({
      queryKey: [
        "home",
        "category-rail",
        category.slug,
        locale,
        currency,
        licence,
      ] as const,
      queryFn: () =>
        listProducts({
          locale,
          currency,
          licence,
          category: [category.slug],
          sort: "newest",
          limit: CATEGORY_RAIL_SIZE,
        }),
    })),
  });

  return (
    <section aria-labelledby="home-by-category" className="flex flex-col gap-8">
      <h2
        className="text-xl font-semibold text-foreground sm:text-2xl"
        id="home-by-category"
      >
        {t("heading")}
      </h2>
      {categoriesError ? (
        <RailStatus onRetry={onRetryCategories} variant="error" />
      ) : categoriesLoading ? (
        <RailStatus variant="loading" />
      ) : categories.length === 0 ? (
        <RailStatus variant="empty" />
      ) : (
        <div className="flex flex-col gap-10">
          {categories.map((category, index) => {
            const result = railQueries[index];
            return (
              <DiscoveryRail
                categories={categories}
                headingLevel="h3"
                isError={result?.isError ?? false}
                isLoading={result?.isPending ?? true}
                key={category.slug}
                licence={licence}
                onRetry={() => void result?.refetch()}
                products={result?.data?.data ?? []}
                title={pickCategoryName(category, locale)}
                viewAllHref={`/${locale}/categories/${category.slug}`}
                viewAllLabel={t("viewAll")}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
