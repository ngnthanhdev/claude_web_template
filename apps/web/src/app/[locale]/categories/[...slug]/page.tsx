"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { notFound, useParams } from "next/navigation";
import { useEffect } from "react";

import { CollectionPager } from "@/components/catalogue/collection-pager";
import { FilterRail } from "@/components/catalogue/filter-rail";
import { PriceRangeControl } from "@/components/catalogue/price-range-control";
import { ProductGrid } from "@/components/catalogue/product-grid";
import { SortControl } from "@/components/catalogue/sort-control";
import { useProductCollection } from "@/hooks/use-product-collection";
import { listCategories } from "@/lib/catalogue-client";
import { useCurrency } from "@/lib/currency";
import {
  categorySlugSchema,
  slugSchema,
  type CategorySlug,
  type Slug,
} from "@shared/catalogue";
import { localeSchema } from "@shared/localization";

/**
 * True once the collection's URL-backed `category`/`subcategory` filters
 * already match the single value the route resolved (or, for `subcategory`,
 * once both are absent). Used to gate the route-lock effect below so it only
 * ever replaces the URL when the two have actually drifted apart.
 */
function matchesLockedValue(
  actual: readonly string[] | undefined,
  expected: string | undefined,
): boolean {
  if (expected === undefined) return actual === undefined;
  return actual !== undefined && actual.length === 1 && actual[0] === expected;
}

/**
 * `/[locale]/categories/[...slug]`: the approved Catalogue macrostructure,
 * pre-scoped to the category (and, optionally, subcategory) the route path
 * resolves to. Composes the `T-8f43e2` collection kit and
 * `useProductCollection` exactly like `/[locale]/search` — the only
 * difference is that the category dimension is locked from the route rather
 * than offered as a togglable filter.
 */
export default function CategoryCollectionPage() {
  const routeParams = useParams<{ slug?: string[] }>();
  const locale = localeSchema.parse(useLocale());
  const { currency } = useCurrency();
  const t = useTranslations("Catalogue");

  const [categorySegment, subcategorySegment, ...restSegments] =
    routeParams.slug ?? [];

  const parsedCategory = categorySlugSchema.safeParse(categorySegment);
  const parsedSubcategory =
    subcategorySegment === undefined
      ? undefined
      : slugSchema.safeParse(subcategorySegment);

  const isKnownRoute =
    parsedCategory.success &&
    restSegments.length === 0 &&
    (parsedSubcategory === undefined || parsedSubcategory.success);

  // Every hook below must run unconditionally on every render (Rules of
  // Hooks), including the render that is about to 404 — so an unknown route
  // still resolves *some* well-typed value here; it is never rendered, since
  // the component returns `null` below before reaching the JSX that would
  // use it.
  const category: CategorySlug = parsedCategory.success
    ? parsedCategory.data
    : categorySlugSchema.options[0];
  const subcategory: Slug | undefined = parsedSubcategory?.success
    ? parsedSubcategory.data
    : undefined;

  const categoriesQuery = useQuery({
    queryKey: ["categories", locale],
    queryFn: () => listCategories({ locale }),
  });
  const categories = categoriesQuery.data?.data ?? [];
  const categoryName =
    categories
      .find((entry) => entry.slug === category)
      ?.translations.find((entry) => entry.locale === locale)?.name ?? category;

  const collection = useProductCollection({ locale, currency });
  const { updateFilters } = collection;
  const isCategoryLocked =
    matchesLockedValue(collection.filters.category, category) &&
    matchesLockedValue(collection.filters.subcategory, subcategory);

  useEffect(() => {
    if (!isKnownRoute || isCategoryLocked) return;

    updateFilters({
      category: [category],
      subcategory: subcategory === undefined ? undefined : [subcategory],
    });
  }, [isKnownRoute, isCategoryLocked, category, subcategory, updateFilters]);

  if (!isKnownRoute) {
    notFound();
    return null;
  }

  return (
    <section
      aria-labelledby="category-collection-title"
      className="flex flex-col gap-6"
    >
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("category.context")}
        </p>
        <h1
          className="text-2xl font-semibold text-foreground"
          id="category-collection-title"
        >
          {categoryName}
        </h1>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="flex flex-col gap-6">
          {/* The category itself is route-locked, not a togglable filter, so
              the checkbox group that would otherwise duplicate it is
              suppressed by passing no category vocabulary here. */}
          <FilterRail
            categories={[]}
            filters={collection.filters}
            locale={locale}
            onChange={collection.updateFilters}
            onClear={collection.resetFilters}
          />
          <PriceRangeControl
            currency={currency}
            licence={collection.filters.licence}
            maxPrice={collection.filters.maxPrice}
            minPrice={collection.filters.minPrice}
            onChange={collection.updateFilters}
          />
        </aside>
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <SortControl
              onChange={(sort) => collection.updateFilters({ sort })}
              sort={collection.filters.sort}
            />
          </div>
          <ProductGrid
            categories={categories}
            isError={collection.isError}
            isFetching={collection.isFetching}
            isLoading={collection.isLoading}
            licence={collection.filters.licence}
            onResetFilters={collection.resetFilters}
            onRetry={collection.refetch}
            products={collection.products}
          />
          <CollectionPager
            hasNextPage={collection.hasNextPage}
            hasPreviousPage={collection.hasPreviousPage}
            isFetching={collection.isFetching}
            onNext={collection.goToNextPage}
            onPrevious={collection.goToPreviousPage}
          />
        </div>
      </div>
    </section>
  );
}
