"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, type FormEvent } from "react";

import { CollectionPager } from "@/components/catalogue/collection-pager";
import { FilterRail } from "@/components/catalogue/filter-rail";
import { PriceRangeControl } from "@/components/catalogue/price-range-control";
import { ProductGrid } from "@/components/catalogue/product-grid";
import { SortControl } from "@/components/catalogue/sort-control";
import { Button } from "@/components/ui/button";
import { useProductCollection } from "@/hooks/use-product-collection";
import { listCategories } from "@/lib/catalogue-client";
import { useCurrency } from "@/lib/currency";
import type { ProductCollectionFilterState } from "@/lib/product-query-url";
import type { CategorySlug, ProductSort, Slug } from "@shared/catalogue";
import type { Locale } from "@shared/localization";

/** The collection's sort default when no search text is active (`productCollectionQuerySchema`'s own default). */
const DEFAULT_SORT_WITHOUT_QUERY: ProductSort = "newest";
/** The collection's sort default once search text is active. */
const DEFAULT_SORT_WITH_QUERY: ProductSort = "relevance";

export interface CollectionViewCategoryProps {
  mode: "category";
  locale: Locale;
  /** The category the route already resolved+validated server-side. */
  category: CategorySlug;
  subcategory?: Slug;
  /** The category's localized display name, resolved server-side. */
  categoryName: string;
}

export interface CollectionViewSearchProps {
  mode: "search";
  locale: Locale;
}

export type CollectionViewProps =
  CollectionViewCategoryProps | CollectionViewSearchProps;

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
 * The approved Catalogue collection surface — `FilterRail` +
 * `PriceRangeControl` + `SortControl` + `ProductGrid` + `CollectionPager`,
 * all driven by `useProductCollection`'s URL-backed state. Shared by
 * `/[locale]/categories/[...slug]` ("category" mode: pre-scoped to a
 * category/subcategory the server already resolved+validated, so an unknown
 * segment never reaches this component) and `/[locale]/search` ("search"
 * mode: unscoped, with the free-text search box active).
 */
export function CollectionView(props: CollectionViewProps) {
  const { locale, mode } = props;
  const category = mode === "category" ? props.category : undefined;
  const subcategory = mode === "category" ? props.subcategory : undefined;

  const { currency } = useCurrency();
  const t = useTranslations("Catalogue");
  const searchInputId = useId();
  const headingId = useId();

  const categoriesQuery = useQuery({
    queryKey: ["categories", locale],
    queryFn: () => listCategories({ locale }),
  });
  const categories = categoriesQuery.data?.data ?? [];

  const collection = useProductCollection({ locale, currency });
  const { updateFilters } = collection;
  const [searchText, setSearchText] = useState(collection.filters.q ?? "");

  // Keeps the (locally editable) search box in sync whenever the URL-backed
  // `q` changes for a reason other than this box's own submit — e.g. Back
  // navigation, a pasted link, or `FilterRail`'s "clear filters" action.
  useEffect(() => {
    setSearchText(collection.filters.q ?? "");
  }, [collection.filters.q]);

  const isCategoryLocked =
    mode === "search" ||
    (matchesLockedValue(collection.filters.category, category) &&
      matchesLockedValue(collection.filters.subcategory, subcategory));

  useEffect(() => {
    if (mode !== "category" || isCategoryLocked || category === undefined) {
      return;
    }

    updateFilters({
      category: [category],
      subcategory: subcategory === undefined ? undefined : [subcategory],
    });
  }, [mode, isCategoryLocked, category, subcategory, updateFilters]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuery = searchText.trim();
    const hasQuery = trimmedQuery.length > 0;
    const hadQuery = collection.filters.q !== undefined;

    const patch: Partial<ProductCollectionFilterState> = {
      q: hasQuery ? trimmedQuery : undefined,
    };

    // Only flip `sort` when it is still sitting on the *other* state's
    // default — an explicit sort the shopper already picked (price, title,
    // …) is preserved either way.
    if (
      hasQuery &&
      !hadQuery &&
      collection.filters.sort === DEFAULT_SORT_WITHOUT_QUERY
    ) {
      patch.sort = DEFAULT_SORT_WITH_QUERY;
    } else if (
      !hasQuery &&
      hadQuery &&
      collection.filters.sort === DEFAULT_SORT_WITH_QUERY
    ) {
      patch.sort = DEFAULT_SORT_WITHOUT_QUERY;
    }

    collection.updateFilters(patch);
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {mode === "category" ? t("category.context") : t("search.context")}
        </p>
        <h1 className="text-2xl font-semibold text-foreground" id={headingId}>
          {mode === "category" ? props.categoryName : t("search.heading")}
        </h1>
      </div>

      {mode === "search" ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={handleSearchSubmit}
          role="search"
        >
          <div className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor={searchInputId}
            >
              {t("search.inputLabel")}
            </label>
            <input
              className="h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              id={searchInputId}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t("search.placeholder")}
              type="search"
              value={searchText}
            />
          </div>
          <Button type="submit">{t("search.submit")}</Button>
        </form>
      ) : null}

      {mode === "search" && collection.filters.q ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("search.activeQuery", { query: collection.filters.q })}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="flex flex-col gap-6">
          {/* In "category" mode the category itself is route-locked, not a
              togglable filter, so the checkbox group that would otherwise
              duplicate it is suppressed by passing no category vocabulary
              here. */}
          <FilterRail
            categories={mode === "search" ? categories : []}
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
