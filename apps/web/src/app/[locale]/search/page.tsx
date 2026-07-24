"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
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
import type { ProductSort } from "@shared/catalogue";
import { localeSchema } from "@shared/localization";

/** The collection's sort default when no search text is active (`productCollectionQuerySchema`'s own default). */
const DEFAULT_SORT_WITHOUT_QUERY: ProductSort = "newest";
/** The collection's sort default once search text is active. */
const DEFAULT_SORT_WITH_QUERY: ProductSort = "relevance";

/**
 * `/[locale]/search`: the same Catalogue collection surface as
 * `/[locale]/categories/[...slug]`, unscoped, with a free-text search box
 * wired to the URL-backed `q` filter. Submitting a query flips `sort` to the
 * approved query-dependent default in the same step, exactly like landing on
 * a fresh `?q=` link already does via the shared schema's own default.
 */
export default function SearchPage() {
  const locale = localeSchema.parse(useLocale());
  const { currency } = useCurrency();
  const t = useTranslations("Catalogue");
  const searchInputId = useId();

  const categoriesQuery = useQuery({
    queryKey: ["categories", locale],
    queryFn: () => listCategories({ locale }),
  });
  const categories = categoriesQuery.data?.data ?? [];

  const collection = useProductCollection({ locale, currency });
  const [searchText, setSearchText] = useState(collection.filters.q ?? "");

  // Keeps the (locally editable) search box in sync whenever the URL-backed
  // `q` changes for a reason other than this box's own submit — e.g. Back
  // navigation, a pasted link, or `FilterRail`'s "clear filters" action.
  useEffect(() => {
    setSearchText(collection.filters.q ?? "");
  }, [collection.filters.q]);

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
    <section aria-labelledby="search-title" className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("search.context")}
        </p>
        <h1
          className="text-2xl font-semibold text-foreground"
          id="search-title"
        >
          {t("search.heading")}
        </h1>
      </div>

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

      {collection.filters.q ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("search.activeQuery", { query: collection.filters.q })}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="flex flex-col gap-6">
          <FilterRail
            categories={categories}
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
