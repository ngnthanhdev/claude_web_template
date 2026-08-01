"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import type { CursorPageMeta } from "@shared/api";

export interface AccountCollectionPage<TItem> {
  data: readonly TItem[];
  meta: CursorPageMeta;
}

export interface UseAccountCollectionOptions<TItem> {
  /**
   * The base cache key for this collection (e.g. `["account", "orders"]`) —
   * every fetched page lives under this one key, not one key per cursor, so
   * "Load more" appends to what's already rendered instead of swapping it
   * out for a fresh, single-page cache entry.
   */
  queryKey: readonly unknown[];
  queryFn: (params: {
    cursor: string | undefined;
  }) => Promise<AccountCollectionPage<TItem>>;
  enabled: boolean;
}

export interface UseAccountCollectionResult<TItem> {
  /** Every item fetched so far, oldest page first — accumulates as `fetchNextPage` is called. */
  items: readonly TItem[];
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  refetch: () => void;
  hasNextPage: boolean;
  fetchNextPage: () => void;
}

/**
 * The account area's shared "Load more" pagination shape (orders, library):
 * wraps `useInfiniteQuery` so each additional page is appended to the ones
 * already fetched, rather than an earlier page being discarded the moment a
 * caller pages forward (a shopper with more than one page would otherwise
 * lose page 1 with no way back).
 */
export function useAccountCollection<TItem>({
  queryKey,
  queryFn,
  enabled,
}: UseAccountCollectionOptions<TItem>): UseAccountCollectionResult<TItem> {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => queryFn({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore
        ? (lastPage.meta.nextCursor ?? undefined)
        : undefined,
    enabled,
  });

  return {
    items: query.data?.pages.flatMap((page) => page.data) ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    refetch: () => void query.refetch(),
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
  };
}
