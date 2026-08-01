import type {
  LocalizedCategorySummary,
  ProductCard as ProductCardData,
} from "@shared/catalogue";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { CartProvider } from "@/lib/cart-store";
import { listCategories, listProducts } from "@/lib/catalogue-client";
import { CurrencyProvider } from "@/lib/currency";
import enCart from "../../../messages/en/cart.json";
import enCollection from "../../../messages/en/collection.json";
import enHome from "../../../messages/en/home.json";
import viCart from "../../../messages/vi/cart.json";
import viCollection from "../../../messages/vi/collection.json";
import viHome from "../../../messages/vi/home.json";

import HomePage from "./page";

vi.mock("@/lib/catalogue-client", () => ({
  listCategories: vi.fn(),
  listProducts: vi.fn(),
}));

const mockedListCategories = vi.mocked(listCategories);
const mockedListProducts = vi.mocked(listProducts);

const enMessages = { ...enHome, ...enCollection, ...enCart };
const viMessages = { ...viHome, ...viCollection, ...viCart };

const categoriesFixture: LocalizedCategorySummary[] = [
  {
    slug: "wordpress",
    translations: [
      { locale: "vi", name: "WordPress", summary: "Mẫu WordPress." },
      { locale: "en", name: "WordPress", summary: "WordPress templates." },
    ],
  },
  {
    slug: "ecommerce",
    translations: [
      { locale: "vi", name: "Thương mại điện tử", summary: "Mẫu cửa hàng." },
      { locale: "en", name: "eCommerce", summary: "Storefront templates." },
    ],
  },
];

function buildProduct(overrides: {
  id: string;
  slug: string;
  category: ProductCardData["category"];
  title: string;
  tags?: string[];
}): ProductCardData {
  return {
    id: overrides.id,
    slug: overrides.slug,
    publicationState: "published",
    category: overrides.category,
    tags: overrides.tags ?? [],
    translations: [
      { locale: "vi", title: overrides.title, summary: "Mô tả mẫu web." },
      {
        locale: "en",
        title: overrides.title,
        summary: "A web template summary.",
      },
    ],
    currentVersion: "1.0.0",
    thumbnailUrl: `https://media.kitvera.example/${overrides.slug}/card.webp`,
    licenceOptions: [
      {
        identifier: "Regular",
        prices: [
          { amount: 1_000_000, currency: "VND" },
          { amount: 40, currency: "USD" },
        ],
      },
      {
        identifier: "Extended",
        prices: [
          { amount: 3_000_000, currency: "VND" },
          { amount: 120, currency: "USD" },
        ],
      },
    ],
  };
}

const editorsPick = buildProduct({
  id: "11111111-1111-4111-a111-111111111111",
  slug: "aurora-pick",
  category: "wordpress",
  title: "Aurora Editor Pick",
});
const novaStorefront = buildProduct({
  id: "22222222-2222-4222-a222-222222222222",
  slug: "nova-storefront",
  category: "ecommerce",
  tags: ["headless"],
  title: "Nova Storefront",
});
const cometLanding = buildProduct({
  id: "33333333-3333-4333-a333-333333333333",
  slug: "comet-landing",
  category: "wordpress",
  tags: ["headless"],
  title: "Comet Landing",
});
const vegaDocs = buildProduct({
  id: "44444444-4444-4444-a444-444444444444",
  slug: "vega-docs",
  category: "wordpress",
  tags: ["solo-tag"],
  title: "Vega Docs",
});
const willowWpKit = buildProduct({
  id: "55555555-5555-4555-a555-555555555555",
  slug: "willow-wp-kit",
  category: "wordpress",
  title: "Willow WP Kit",
});
const emberShop = buildProduct({
  id: "66666666-6666-4666-a666-666666666666",
  slug: "ember-shop",
  category: "ecommerce",
  title: "Ember Shop",
});

const categoryProductsBySlug: Record<string, ProductCardData> = {
  wordpress: willowWpKit,
  ecommerce: emberShop,
};

function productCollection(data: ProductCardData[]) {
  return { data, meta: { nextCursor: null, hasMore: false } };
}

function categoryCollection(data: LocalizedCategorySummary[]) {
  return { data, meta: { nextCursor: null, hasMore: false } };
}

/** Wires the mocked client so each discovery surface gets a distinct, real slice of the fixtures above. */
function mockPopulatedCatalogue() {
  mockedListCategories.mockResolvedValue(categoryCollection(categoriesFixture));
  mockedListProducts.mockImplementation((params) => {
    if (params.category) {
      const [slug] = params.category;
      const product = slug ? categoryProductsBySlug[slug] : undefined;
      return Promise.resolve(productCollection(product ? [product] : []));
    }
    if (params.sort === "recently-updated") {
      return Promise.resolve(productCollection([editorsPick]));
    }
    return Promise.resolve(
      productCollection([novaStorefront, cometLanding, vegaDocs]),
    );
  });
}

function renderHomePage(locale: "vi" | "en", messages: typeof enMessages) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <CurrencyProvider>
          <CartProvider>
            <HomePage />
          </CartProvider>
        </CurrencyProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("HomePage", () => {
  it("renders editor's picks, newest, by-category, and by-niche rails from the mocked client", async () => {
    mockPopulatedCatalogue();
    renderHomePage("en", enMessages);

    await screen.findByRole("heading", { level: 3, name: "Willow WP Kit" });

    const editorsRegion = screen.getByRole("region", {
      name: enHome.Home.editorsPicks.heading,
    });
    expect(
      within(editorsRegion).getByRole("heading", {
        level: 3,
        name: "Aurora Editor Pick",
      }),
    ).toBeInTheDocument();

    const newestRegion = screen.getByRole("region", {
      name: enHome.Home.newest.heading,
    });
    expect(
      within(newestRegion).getByRole("heading", {
        level: 3,
        name: "Nova Storefront",
      }),
    ).toBeInTheDocument();
    expect(
      within(newestRegion).getByRole("heading", {
        level: 3,
        name: "Comet Landing",
      }),
    ).toBeInTheDocument();
    expect(
      within(newestRegion).getByRole("heading", {
        level: 3,
        name: "Vega Docs",
      }),
    ).toBeInTheDocument();

    const categoryRegion = screen.getByRole("region", {
      name: enHome.Home.byCategory.heading,
    });
    const wordpressRail = within(categoryRegion).getByRole("region", {
      name: "WordPress",
    });
    expect(
      within(wordpressRail).getByRole("heading", {
        level: 3,
        name: "Willow WP Kit",
      }),
    ).toBeInTheDocument();
    expect(
      within(wordpressRail).getByRole("link", {
        name: enHome.Home.byCategory.viewAll,
      }),
    ).toHaveAttribute("href", "/en/categories/wordpress");
    const ecommerceRail = within(categoryRegion).getByRole("region", {
      name: "eCommerce",
    });
    expect(
      within(ecommerceRail).getByRole("heading", {
        level: 3,
        name: "Ember Shop",
      }),
    ).toBeInTheDocument();

    const nicheRegion = screen.getByRole("region", {
      name: enHome.Home.byNiche.heading,
    });
    const headlessRail = within(nicheRegion).getByRole("region", {
      name: "Niche: headless",
    });
    expect(
      within(headlessRail).getByRole("heading", {
        level: 3,
        name: "Nova Storefront",
      }),
    ).toBeInTheDocument();
    expect(
      within(headlessRail).getByRole("heading", {
        level: 3,
        name: "Comet Landing",
      }),
    ).toBeInTheDocument();

    expect(mockedListProducts).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "recently-updated" }),
    );
  });

  it("renders the Vietnamese landing copy and rail headings", async () => {
    mockPopulatedCatalogue();
    renderHomePage("vi", viMessages);

    expect(
      screen.getByRole("heading", { level: 1, name: viHome.Home.pageTitle }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("region", {
        name: viHome.Home.editorsPicks.heading,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: viHome.Home.newest.heading }),
    ).toBeInTheDocument();
  });

  it("shows an honest empty state instead of fabricating inventory", async () => {
    mockedListCategories.mockResolvedValue(
      categoryCollection(categoriesFixture),
    );
    mockedListProducts.mockResolvedValue(productCollection([]));

    renderHomePage("en", enMessages);

    // The outer "Browse by category" region renders unconditionally as soon
    // as the component mounts, so waiting on it wouldn't wait for either the
    // categories fetch or the category's own product fetch to resolve. Wait
    // on the per-category rail itself instead, which only exists once
    // categories have loaded.
    const wordpressRail = await screen.findByRole("region", {
      name: "WordPress",
    });
    expect(
      await within(wordpressRail).findByText(enHome.Home.rail.emptyHeading),
    ).toBeInTheDocument();
    expect(within(wordpressRail).queryAllByRole("listitem")).toHaveLength(0);

    const editorsRegion = screen.getByRole("region", {
      name: enHome.Home.editorsPicks.heading,
    });
    expect(
      within(editorsRegion).getByText(enHome.Home.rail.emptyHeading),
    ).toBeInTheDocument();
    expect(within(editorsRegion).queryAllByRole("listitem")).toHaveLength(0);

    const newestRegion = screen.getByRole("region", {
      name: enHome.Home.newest.heading,
    });
    expect(within(newestRegion).queryAllByRole("listitem")).toHaveLength(0);

    const nicheRegion = screen.getByRole("region", {
      name: enHome.Home.byNiche.heading,
    });
    expect(
      within(nicheRegion).queryByRole("heading", { level: 3 }),
    ).not.toBeInTheDocument();
    expect(
      within(nicheRegion).getByText(enHome.Home.rail.emptyHeading),
    ).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    mockPopulatedCatalogue();
    const { container } = renderHomePage("en", enMessages);

    await screen.findByRole("heading", { level: 3, name: "Willow WP Kit" });

    expect((await axe(container)).violations).toEqual([]);
  });
});
