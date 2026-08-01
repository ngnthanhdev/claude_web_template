import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  useAccountCollection,
  type AccountCollectionPage,
} from "./use-account-collection";

interface Item {
  id: string;
}

// A two-page forward-only feed keyed on the requested cursor, mirroring the
// shape `listOrders`/`listLibrary` return.
function pageForCursor(
  cursor: string | undefined,
): AccountCollectionPage<Item> {
  if (cursor === undefined) {
    return {
      data: [{ id: "item-1" }],
      meta: { nextCursor: "c1", hasMore: true },
    };
  }
  if (cursor === "c1") {
    return {
      data: [{ id: "item-2" }],
      meta: { nextCursor: null, hasMore: false },
    };
  }
  throw new Error(`Unexpected cursor in test: ${cursor}`);
}

function renderAccountCollection(enabled = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const queryFn = vi.fn(({ cursor }: { cursor: string | undefined }) =>
    Promise.resolve(pageForCursor(cursor)),
  );

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  const view = renderHook(
    () =>
      useAccountCollection<Item>({
        queryKey: ["account", "test-collection"] as const,
        queryFn,
        enabled,
      }),
    { wrapper },
  );

  return { ...view, queryFn };
}

describe("useAccountCollection", () => {
  it("appends the next page's items to the ones already fetched instead of replacing them", async () => {
    const { result } = renderAccountCollection();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([{ id: "item-1" }]);
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current.items).toEqual([
        { id: "item-1" },
        { id: "item-2" },
      ]),
    );
    // The first page's item is still present — "Load more" never discarded it.
    expect(result.current.items).toContainEqual({ id: "item-1" });
    expect(result.current.hasNextPage).toBe(false);
  });

  it("does not fetch while disabled", async () => {
    const { result, queryFn } = renderAccountCollection(false);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(queryFn).not.toHaveBeenCalled();
  });
});
