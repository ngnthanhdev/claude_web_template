import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  getProductBySlug,
  listCategories,
  listProducts,
} from "./catalogue-client";

const translations = [
  {
    locale: "vi",
    title: "Bộ giao diện cửa hàng hiện đại",
    summary: "Một cửa hàng nhanh và dễ tuỳ chỉnh.",
  },
  {
    locale: "en",
    title: "Modern storefront template",
    summary: "A fast, adaptable commerce storefront.",
  },
];

const licenceOptions = [
  {
    identifier: "Regular",
    prices: [
      { amount: 1_290_000, currency: "VND" },
      { amount: 49_00, currency: "USD" },
    ],
  },
  {
    identifier: "Extended",
    prices: [
      { amount: 3_990_000, currency: "VND" },
      { amount: 159_00, currency: "USD" },
    ],
  },
];

const productCard = {
  id: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  slug: "lotus-commerce",
  publicationState: "published",
  category: "ecommerce",
  tags: ["fashion", "nextjs"],
  translations,
  currentVersion: "1.4.0",
  thumbnailUrl: "https://media.kitvera.example/lotus/card.webp",
  licenceOptions,
};

const productDetail = {
  ...productCard,
  translations: translations.map((translation) => ({
    ...translation,
    description: `${translation.title} — full description`,
  })),
  changelog: [
    {
      version: "1.4.0",
      releasedAt: "2026-07-20T08:30:00.000Z",
      translations: [
        { locale: "vi", notes: "Cải thiện trang sản phẩm." },
        { locale: "en", notes: "Improved the product page." },
      ],
    },
  ],
  compatibility: [{ target: "nextjs", constraint: ">=15" }],
  specifications: [
    {
      key: "framework",
      translations: [
        { locale: "vi", label: "Nền tảng", value: "Next.js" },
        { locale: "en", label: "Framework", value: "Next.js" },
      ],
    },
  ],
  media: [
    {
      position: 0,
      kind: "image",
      url: "https://media.kitvera.example/lotus/home.webp",
      translations: [
        { locale: "vi", alt: "Trang chủ mẫu Lotus" },
        { locale: "en", alt: "Lotus template home page" },
      ],
    },
  ],
  demoPages: [
    {
      position: 0,
      slug: "home",
      previewUrl: "https://preview-lotus.kitvera.example/home",
      translations: [
        { locale: "vi", title: "Trang chủ" },
        { locale: "en", title: "Home" },
      ],
    },
  ],
  documentationUrl: "https://docs.kitvera.example/lotus-commerce",
  isolatedPreviewUrl: "https://preview-lotus.kitvera.example",
};

const categorySummary = {
  slug: "ecommerce",
  translations: [
    { locale: "vi", name: "Thương mại điện tử", summary: "Mẫu cửa hàng." },
    { locale: "en", name: "eCommerce", summary: "Storefront templates." },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetchOnce(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function omit<T extends Record<string, unknown>>(
  value: T,
  key: keyof T,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([entryKey]) => entryKey !== key),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listCategories", () => {
  it("validates a well-formed category collection response", async () => {
    stubFetchOnce(
      jsonResponse({
        data: [categorySummary],
        meta: { nextCursor: null, hasMore: false },
      }),
    );

    await expect(listCategories({ locale: "vi" })).resolves.toMatchObject({
      data: [{ slug: "ecommerce" }],
    });
  });

  it("requests the same-origin proxy path with the locale query param", async () => {
    const fetchMock = stubFetchOnce(
      jsonResponse({ data: [], meta: { nextCursor: null, hasMore: false } }),
    );

    await listCategories({ locale: "en" });

    const [calledPath] = fetchMock.mock.calls[0] as [string];
    expect(calledPath.startsWith("/api/v1/categories?")).toBe(true);
    const search = new URL(calledPath, "http://localhost").searchParams;
    expect(search.get("locale")).toBe("en");
  });

  it("rejects a malformed category collection payload instead of returning it", async () => {
    stubFetchOnce(
      jsonResponse({
        data: [{ ...categorySummary, slug: "not-a-real-category" }],
        meta: { nextCursor: null, hasMore: false },
      }),
    );

    await expect(listCategories({ locale: "vi" })).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});

describe("listProducts", () => {
  it("validates a well-formed product collection response", async () => {
    stubFetchOnce(
      jsonResponse({
        data: [productCard],
        meta: { nextCursor: "opaque-cursor-1", hasMore: true },
      }),
    );

    await expect(
      listProducts({ locale: "en", currency: "USD", licence: "Regular" }),
    ).resolves.toMatchObject({
      data: [{ slug: "lotus-commerce" }],
      meta: { hasMore: true },
    });
  });

  it("serializes the full approved query grammar onto the request URL", async () => {
    const fetchMock = stubFetchOnce(
      jsonResponse({ data: [], meta: { nextCursor: null, hasMore: false } }),
    );

    await listProducts({
      locale: "en",
      currency: "USD",
      licence: "Regular",
      category: ["wordpress", "elementor"],
      technology: ["react"],
      minPrice: 1_000,
      maxPrice: 5_000,
      updatedWithin: "30d",
      sort: "price-asc",
      cursor: "opaque-cursor-value",
      limit: 12,
    });

    const [calledPath] = fetchMock.mock.calls[0] as [string];
    expect(calledPath.startsWith("/api/v1/products?")).toBe(true);
    const search = new URL(calledPath, "http://localhost").searchParams;
    expect(search.getAll("category")).toEqual(["wordpress", "elementor"]);
    expect(search.getAll("technology")).toEqual(["react"]);
    expect(search.get("minPrice")).toBe("1000");
    expect(search.get("maxPrice")).toBe("5000");
    expect(search.get("updatedWithin")).toBe("30d");
    expect(search.get("sort")).toBe("price-asc");
    expect(search.get("cursor")).toBe("opaque-cursor-value");
    expect(search.get("limit")).toBe("12");
  });

  it("defaults sort and limit through the shared schema when omitted", async () => {
    const fetchMock = stubFetchOnce(
      jsonResponse({ data: [], meta: { nextCursor: null, hasMore: false } }),
    );

    await listProducts({ locale: "vi", currency: "VND", licence: "Regular" });

    const [calledPath] = fetchMock.mock.calls[0] as [string];
    const search = new URL(calledPath, "http://localhost").searchParams;
    expect(search.get("sort")).toBe("newest");
    expect(search.get("limit")).toBe("24");
  });

  it("rejects a malformed product collection payload instead of returning it", async () => {
    stubFetchOnce(
      jsonResponse({
        data: [omit(productCard, "thumbnailUrl")],
        meta: { nextCursor: null, hasMore: false },
      }),
    );

    await expect(
      listProducts({ locale: "en", currency: "USD", licence: "Regular" }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects an inconsistent price range before ever calling fetch", async () => {
    const fetchMock = stubFetchOnce(
      jsonResponse({ data: [], meta: { nextCursor: null, hasMore: false } }),
    );

    await expect(
      listProducts({
        locale: "en",
        currency: "USD",
        licence: "Regular",
        minPrice: 100,
        maxPrice: 10,
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getProductBySlug", () => {
  it("validates a well-formed product detail response", async () => {
    stubFetchOnce(jsonResponse(productDetail));

    await expect(getProductBySlug("lotus-commerce")).resolves.toMatchObject({
      slug: "lotus-commerce",
      documentationUrl: productDetail.documentationUrl,
    });
  });

  it("requests the slug under the same-origin proxy path", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(productDetail));

    await getProductBySlug("lotus-commerce");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/products/lotus-commerce",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("rejects a malformed product detail payload instead of returning it", async () => {
    stubFetchOnce(jsonResponse(omit(productDetail, "documentationUrl")));

    await expect(getProductBySlug("lotus-commerce")).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});
