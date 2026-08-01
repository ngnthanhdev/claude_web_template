import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import type {
  LocalizedCategorySummary,
  ProductCard as ProductCardData,
} from "@shared/catalogue";

import { CollectionView } from "@/components/catalogue/collection-view";
import { Providers } from "@/components/providers";
import { listCategories, listProducts } from "@/lib/catalogue-client";
import enCatalogue from "../../../../messages/en/catalogue.json";
import viCatalogue from "../../../../messages/vi/catalogue.json";
import enCart from "../../../../messages/en/cart.json";
import viCart from "../../../../messages/vi/cart.json";
import enCollection from "../../../../messages/en/collection.json";
import viCollection from "../../../../messages/vi/collection.json";
import SearchPage from "./page";

vi.mock("@/lib/catalogue-client", () => ({
  listCategories: vi.fn(),
  listProducts: vi.fn(),
}));

let mockPathnameValue = "/en/search";
let mockSearchParamsValue = new URLSearchParams();
// A real `router.replace` changes what the *next* `useSearchParams()` read
// returns; a no-op spy would leave `use-product-collection`'s route-lock
// effect (in `CollectionView`'s "category" mode) permanently "unlocked" and
// re-firing.
const mockRouterReplace = vi.fn((url: string) => {
  const queryIndex = url.indexOf("?");
  mockSearchParamsValue = new URLSearchParams(
    queryIndex === -1 ? "" : url.slice(queryIndex + 1),
  );
});
// `useRouter()` must return the *same* object reference across renders,
// exactly like Next's real implementation — `use-product-collection.ts`
// memoizes `replaceUrl`/`updateFilters` off this value, so a fresh object
// literal per call would invalidate that memoization every render and spin
// the route-lock effect into an infinite loop.
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

const mockedListCategories = vi.mocked(listCategories);
const mockedListProducts = vi.mocked(listProducts);

const categoriesFixture: LocalizedCategorySummary[] = [
  {
    slug: "wordpress",
    translations: [
      { locale: "vi", name: "WordPress", summary: "Mẫu WordPress." },
      { locale: "en", name: "WordPress", summary: "WordPress templates." },
    ],
  },
  {
    slug: "shopify",
    translations: [
      { locale: "vi", name: "Shopify", summary: "Mẫu Shopify." },
      { locale: "en", name: "Shopify", summary: "Shopify templates." },
    ],
  },
];

function buildProduct(
  overrides: Partial<ProductCardData> = {},
): ProductCardData {
  return {
    id: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
    slug: "lotus-commerce",
    publicationState: "published",
    category: "wordpress",
    tags: ["blog"],
    translations: [
      {
        locale: "vi",
        title: "Lotus Commerce",
        summary: "Một cửa hàng nhanh.",
      },
      { locale: "en", title: "Lotus Commerce", summary: "A fast storefront." },
    ],
    currentVersion: "1.0.0",
    thumbnailUrl: "https://media.kitvera.example/lotus/card.webp",
    licenceOptions: [
      {
        identifier: "Regular",
        prices: [
          { amount: 1_290_000, currency: "VND" },
          { amount: 4_900, currency: "USD" },
        ],
      },
      {
        identifier: "Extended",
        prices: [
          { amount: 3_990_000, currency: "VND" },
          { amount: 15_900, currency: "USD" },
        ],
      },
    ],
    ...overrides,
  };
}

const emptyMeta = { nextCursor: null, hasMore: false };

function buildMessages(locale: "vi" | "en") {
  return locale === "vi"
    ? { ...viCatalogue, ...viCollection, ...viCart }
    : { ...enCatalogue, ...enCollection, ...enCart };
}

function renderSearchPage(locale: "vi" | "en" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={buildMessages(locale)}>
      <Providers>
        <SearchPage />
      </Providers>
    </NextIntlClientProvider>,
  );
}

/**
 * `/[locale]/categories/[...slug]` is now a Server Component (see
 * `../categories/[...slug]/page.tsx`) that resolves+validates the category
 * server-side and renders `CollectionView` in "category" mode — it can no
 * longer be rendered through React Testing Library. These tests exercise
 * `CollectionView` directly instead, with the same "wordpress" category the
 * server would have already resolved.
 */
function renderCategoryCollectionView(locale: "vi" | "en" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={buildMessages(locale)}>
      <Providers>
        <CollectionView
          category="wordpress"
          categoryName="WordPress"
          locale={locale}
          mode="category"
        />
      </Providers>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockPathnameValue = "/en/search";
  mockSearchParamsValue = new URLSearchParams();
  mockedListCategories.mockResolvedValue({
    data: categoriesFixture,
    meta: emptyMeta,
  });
  mockedListProducts.mockResolvedValue({
    data: [buildProduct()],
    meta: emptyMeta,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("CollectionView (category mode)", () => {
  it("pre-scopes the collection to the resolved category and hides the redundant category filter", async () => {
    renderCategoryCollectionView("en");

    expect(
      await screen.findByRole("heading", { level: 1, name: "WordPress" }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedListProducts).toHaveBeenCalledWith(
        expect.objectContaining({ category: ["wordpress"] }),
      );
    });

    expect(
      screen.queryByRole("checkbox", { name: "WordPress" }),
    ).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations in either locale", async () => {
    const { container: en } = renderCategoryCollectionView("en");
    await screen.findByRole("link", { name: /Lotus Commerce/ });
    expect((await axe(en)).violations).toEqual([]);
    cleanup();

    const { container: vi_ } = renderCategoryCollectionView("vi");
    await screen.findByRole("link", { name: /Lotus Commerce/ });
    expect((await axe(vi_)).violations).toEqual([]);
  });
});

describe("SearchPage", () => {
  it("seeds the search box from an existing `q` and defaults sort to relevance", async () => {
    mockSearchParamsValue = new URLSearchParams("q=coffee");

    renderSearchPage("en");

    expect(
      await screen.findByRole("searchbox", { name: "Search query" }),
    ).toHaveValue("coffee");
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue(
      "relevance",
    );
    expect(screen.getByText(/Showing results for/)).toBeInTheDocument();
  });

  it("defaults sort to newest when no search text is active", async () => {
    renderSearchPage("en");

    expect(await screen.findByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue(
      "newest",
    );
    expect(screen.queryByText(/Showing results for/)).not.toBeInTheDocument();
  });

  it("flips the sort default to relevance when a search query is submitted interactively", async () => {
    const user = userEvent.setup();
    renderSearchPage("en");

    const input = await screen.findByRole("searchbox", {
      name: "Search query",
    });
    await user.type(input, "coffee");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      const lastCall = mockRouterReplace.mock.calls.at(-1) as
        [string, unknown] | undefined;
      expect(lastCall?.[0]).toContain("q=coffee");
      expect(lastCall?.[0]).toContain("sort=relevance");
    });
  });

  it("restores filters, sort, price range, licence, and cursor from an existing URL on mount", async () => {
    mockSearchParamsValue = new URLSearchParams(
      "category=wordpress&sort=price-asc&licence=Extended&minPrice=100000&maxPrice=500000&cursor=opaque-cursor-value",
    );

    renderSearchPage("en");

    await waitFor(() => {
      expect(mockedListProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          category: ["wordpress"],
          sort: "price-asc",
          licence: "Extended",
          minPrice: 100000,
          maxPrice: 500000,
          cursor: "opaque-cursor-value",
        }),
      );
    });

    expect(
      await screen.findByRole("checkbox", { name: "WordPress" }),
    ).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue(
      "price-asc",
    );
    expect(screen.getByRole("radio", { name: "Extended" })).toBeChecked();
    expect(screen.getByLabelText("Minimum price")).toHaveValue(100000);
    expect(screen.getByLabelText("Maximum price")).toHaveValue(500000);
  });

  it("shows the honest empty-results state when the collection has no matches", async () => {
    mockedListProducts.mockResolvedValue({ data: [], meta: emptyMeta });

    renderSearchPage("en");

    expect(
      await screen.findByText("No templates match these filters"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset filters" }),
    ).toBeInTheDocument();
  });

  it("has no detectable accessibility violations in either locale", async () => {
    const { container: en } = renderSearchPage("en");
    await screen.findByRole("link", { name: /Lotus Commerce/ });
    expect((await axe(en)).violations).toEqual([]);
    cleanup();

    const { container: vi_ } = renderSearchPage("vi");
    await screen.findByRole("link", { name: /Lotus Commerce/ });
    expect((await axe(vi_)).violations).toEqual([]);
  });

  it("keeps the vi and en catalogue message catalogues on exactly the same key set", () => {
    const keys = (value: unknown, prefix = ""): string[] => {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        return [prefix];

      return Object.entries(value).flatMap(([key, nested]) =>
        keys(nested, prefix ? `${prefix}.${key}` : key),
      );
    };

    expect(keys(viCatalogue).sort()).toEqual(keys(enCatalogue).sort());
  });
});
