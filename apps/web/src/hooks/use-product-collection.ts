"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { listProducts } from "@/lib/catalogue-client";
import {
  decodeProductCollectionUrlState,
  encodeProductCollectionUrlState,
  type ProductCollectionFilterState,
  type ProductCollectionUrlState,
} from "@/lib/product-query-url";
import type { ProductCard } from "@shared/catalogue";
import type { CursorPageMeta } from "@shared/api";
import type { Currency, Locale } from "@shared/localization";

export interface UseProductCollectionOptions {
  /** The active route locale (`[locale]` segment) — request context, not state this hook owns. */
  locale: Locale;
  /** The shopper's selected display currency, from the existing `useCurrency` context. */
  currency: Currency;
}

export interface UseProductCollectionResult {
  /** The resolved, non-cursor collection state (facets, sort, price, licence). */
  filters: ProductCollectionFilterState;
  /** Merges `patch` into the current filters, drops the cursor, and replaces the URL. */
  updateFilters: (patch: Partial<ProductCollectionFilterState>) => void;
  /** Returns to the fully-defaulted, filterless collection view. */
  resetFilters: () => void;
  products: readonly ProductCard[];
  meta: CursorPageMeta | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
}

/**
 * Owns the catalogue collection's URL-backed state — every filter, the
 * sort, the price range, and the selected licence — plus the opaque
 * continuation cursor, and drives the TanStack Query fetch that state
 * produces through the Round-1 `listProducts` client.
 *
 * Cursor pagination here is forward-only (the API returns `nextCursor`, not
 * a `prevCursor`), so "previous page" is answered from an in-memory stack of
 * cursors this hook has already visited this session, not from the server.
 * A cursor that arrives via a pasted link or the browser's own Back
 * navigation still renders the right page; it just starts a fresh stack, so
 * "previous" is disabled until the shopper pages forward again from there.
 */
export function useProductCollection({
  locale,
  currency,
}: UseProductCollectionOptions): UseProductCollectionResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();

  const { filters, cursor } = useMemo(() => {
    const { cursor: activeCursor, ...rest } = decodeProductCollectionUrlState(
      searchString,
      { locale, currency },
    );
    return { filters: rest, cursor: activeCursor };
  }, [searchString, locale, currency]);

  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>(
    [],
  );

  const replaceUrl = useCallback(
    (nextState: Partial<ProductCollectionUrlState>) => {
      const query = encodeProductCollectionUrlState(nextState).toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  const updateFilters = useCallback(
    (patch: Partial<ProductCollectionFilterState>) => {
      setCursorHistory([]);
      replaceUrl({ ...filters, ...patch });
    },
    [filters, replaceUrl],
  );

  const resetFilters = useCallback(() => {
    setCursorHistory([]);
    replaceUrl(decodeProductCollectionUrlState("", { locale, currency }));
  }, [currency, locale, replaceUrl]);

  const queryParams = useMemo(
    () => ({ ...filters, cursor, locale, currency }),
    [filters, cursor, locale, currency],
  );

  const query = useQuery({
    queryKey: ["catalogue", "product-collection", queryParams] as const,
    queryFn: () => listProducts(queryParams),
    placeholderData: keepPreviousData,
  });

  const meta = query.data?.meta;

  const goToNextPage = useCallback(() => {
    if (!meta?.hasMore || !meta.nextCursor) return;

    const nextCursor = meta.nextCursor;
    setCursorHistory((history) => [...history, cursor]);
    replaceUrl({ ...filters, cursor: nextCursor });
  }, [cursor, filters, meta, replaceUrl]);

  const goToPreviousPage = useCallback(() => {
    if (cursorHistory.length === 0) return;

    const previousCursor = cursorHistory[cursorHistory.length - 1];
    setCursorHistory((history) => history.slice(0, -1));
    replaceUrl({ ...filters, cursor: previousCursor });
  }, [cursorHistory, filters, replaceUrl]);

  return {
    filters,
    updateFilters,
    resetFilters,
    products: query.data?.data ?? [],
    meta,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
    hasPreviousPage: cursorHistory.length > 0,
    // Gate on both fields the click handler needs: a schema-valid but
    // inconsistent `{ hasMore: true, nextCursor: null }` must not enable a
    // Next button whose handler would then bail as a no-op.
    hasNextPage: Boolean(meta?.hasMore && meta.nextCursor),
    goToNextPage,
    goToPreviousPage,
  };
}
