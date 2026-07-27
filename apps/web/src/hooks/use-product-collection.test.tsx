import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listProducts } from "@/lib/catalogue-client";
import type { ProductCard } from "@shared/catalogue";
import type { ProductCollectionResponse } from "@shared/catalogue";

import { useProductCollection } from "./use-product-collection";

vi.mock("@/lib/catalogue-client", () => ({
  listProducts: vi.fn(),
}));

// The mock mirrors Next's real routing: `router.replace(url)` changes what the
// *next* `useSearchParams()` read returns, and `useRouter()` hands back the
// same object reference every render (the hook memoizes `replaceUrl` off it).
let mockPathnameValue = "/en/templates";
let mockSearchParamsValue = new URLSearchParams();
const mockRouterReplace = vi.fn((url: string) => {
  const queryIndex = url.indexOf("?");
  mockSearchParamsValue = new URLSearchParams(
    queryIndex === -1 ? "" : url.slice(queryIndex + 1),
  );
});
const mockRouter = {
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: mockRouterReplace,
};

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => mockPathnameValue,
    useRouter: () => mockRouter,
    useSearchParams: () => mockSearchParamsValue,
  };
});

const mockedListProducts = vi.mocked(listProducts);

function buildProduct(id: string): ProductCard {
  return {
    id,
    slug: `template-${id}`,
    publicationState: "published",
    category: "wordpress",
    tags: ["blog"],
    translations: [
      { locale: "vi", title: "Mẫu", summary: "Mô tả." },
      { locale: "en", title: "Template", summary: "Summary." },
    ],
    currentVersion: "1.0.0",
    thumbnailUrl: "https://media.kitvera.example/card.webp",
    licenceOptions: [
      {
        identifier: "Regular",
        prices: [
          { amount: 1_290_000, currency: "VND" },
          { amount: 4_900, currency: "USD" },
        ],
      },
    ],
  };
}

// A three-page forward-only feed keyed on the requested cursor, so paging
// forward and back exercises the hook's in-memory cursor stack for real.
function pageForCursor(cursor: string | undefined): ProductCollectionResponse {
  if (cursor === undefined) {
    return {
      data: [buildProduct("p1")],
      meta: { nextCursor: "c1", hasMore: true },
    };
  }
  if (cursor === "c1") {
    return {
      data: [buildProduct("p2")],
      meta: { nextCursor: "c2", hasMore: true },
    };
  }
  if (cursor === "c2") {
    return {
      data: [buildProduct("p3")],
      meta: { nextCursor: null, hasMore: false },
    };
  }
  return { data: [], meta: { nextCursor: null, hasMore: false } };
}

function renderCollection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => useProductCollection({ locale: "en", currency: "USD" }),
    { wrapper },
  );
}

beforeEach(() => {
  mockPathnameValue = "/en/templates";
  mockSearchParamsValue = new URLSearchParams();
  mockRouterReplace.mockClear();
  mockedListProducts.mockReset();
  mockedListProducts.mockImplementation(async (params) =>
    pageForCursor(params.cursor),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useProductCollection", () => {
  it("starts with no back-history and forward enabled from server meta", async () => {
    const { result } = renderCollection();

    await waitFor(() => expect(result.current.meta?.nextCursor).toBe("c1"));
    expect(result.current.hasPreviousPage).toBe(false);
    expect(result.current.hasNextPage).toBe(true);
  });

  it("pages forward and back through the in-memory cursor stack", async () => {
    const { result } = renderCollection();
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    // Forward to page 2: current (empty) cursor is pushed, URL carries c1.
    act(() => result.current.goToNextPage());
    expect(mockSearchParamsValue.get("cursor")).toBe("c1");
    expect(result.current.hasPreviousPage).toBe(true);
    await waitFor(() => expect(result.current.meta?.nextCursor).toBe("c2"));

    // Forward to page 3, the last page.
    act(() => result.current.goToNextPage());
    expect(mockSearchParamsValue.get("cursor")).toBe("c2");
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));

    // Next is a no-op once the server reports no further page.
    mockRouterReplace.mockClear();
    act(() => result.current.goToNextPage());
    expect(mockRouterReplace).not.toHaveBeenCalled();

    // Back to page 2 via the popped cursor.
    act(() => result.current.goToPreviousPage());
    expect(mockSearchParamsValue.get("cursor")).toBe("c1");
    expect(result.current.hasPreviousPage).toBe(true);
    await waitFor(() => expect(result.current.meta?.nextCursor).toBe("c2"));

    // Back to page 1: the stack empties, so previous disables.
    act(() => result.current.goToPreviousPage());
    expect(mockSearchParamsValue.has("cursor")).toBe(false);
    expect(result.current.hasPreviousPage).toBe(false);
    await waitFor(() => expect(result.current.meta?.nextCursor).toBe("c1"));

    // Previous is a no-op at the start of the stack.
    mockRouterReplace.mockClear();
    act(() => result.current.goToPreviousPage());
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("drops the cursor and clears back-history when filters change", async () => {
    mockSearchParamsValue = new URLSearchParams("cursor=c1");
    const { result } = renderCollection();
    await waitFor(() => expect(result.current.meta?.nextCursor).toBe("c2"));

    act(() => result.current.goToNextPage());
    expect(result.current.hasPreviousPage).toBe(true);

    act(() => result.current.updateFilters({ sort: "price-asc" }));
    expect(result.current.hasPreviousPage).toBe(false);
    expect(mockSearchParamsValue.has("cursor")).toBe(false);
    expect(mockSearchParamsValue.get("sort")).toBe("price-asc");
  });

  it("resets to the default view and clears back-history", async () => {
    mockSearchParamsValue = new URLSearchParams("cursor=c1&sort=price-asc");
    const { result } = renderCollection();
    await waitFor(() => expect(result.current.meta).toBeDefined());

    act(() => result.current.goToNextPage());
    expect(result.current.hasPreviousPage).toBe(true);

    act(() => result.current.resetFilters());
    expect(result.current.hasPreviousPage).toBe(false);
    expect(mockSearchParamsValue.has("cursor")).toBe(false);
    // Reset writes the defaults explicitly rather than dropping the keys, so
    // the deep-linked `price-asc` sort returns to the default `newest`.
    expect(mockSearchParamsValue.get("sort")).toBe("newest");
  });

  it("keeps the Next control disabled when meta is inconsistent (hasMore but no cursor)", async () => {
    mockedListProducts.mockResolvedValue({
      data: [buildProduct("p1")],
      meta: { nextCursor: null, hasMore: true },
    });
    const { result } = renderCollection();

    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.hasNextPage).toBe(false);
  });
});
