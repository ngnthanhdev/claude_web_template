import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  getProductBySlugServer,
  listCategoriesServer,
} from "./catalogue-server";

const originalApiOrigin = process.env.API_ORIGIN;

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

const productDetail = {
  id: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  slug: "lotus-commerce",
  publicationState: "published",
  category: "ecommerce",
  tags: ["fashion", "nextjs"],
  translations: translations.map((translation) => ({
    ...translation,
    description: `${translation.title} — full description`,
  })),
  currentVersion: "1.4.0",
  thumbnailUrl: "https://media.kitvera.example/lotus/card.webp",
  licenceOptions,
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

beforeEach(() => {
  process.env.API_ORIGIN = "http://api.internal.test:4000";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalApiOrigin === undefined) {
    delete process.env.API_ORIGIN;
  } else {
    process.env.API_ORIGIN = originalApiOrigin;
  }
});

describe("getProductBySlugServer", () => {
  it("validates a well-formed product detail response", async () => {
    stubFetchOnce(jsonResponse(productDetail));

    await expect(
      getProductBySlugServer("lotus-commerce"),
    ).resolves.toMatchObject({
      slug: "lotus-commerce",
      documentationUrl: productDetail.documentationUrl,
    });
  });

  it("fetches directly against the API origin (not the same-origin proxy) and forwards no cookies", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(productDetail));

    await getProductBySlugServer("lotus-commerce");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      string | URL,
      RequestInit | undefined,
    ];
    expect(String(calledUrl)).toBe(
      "http://api.internal.test:4000/v1/products/lotus-commerce",
    );
    expect(calledInit?.credentials).toBeUndefined();
    expect(new Headers(calledInit?.headers).get("cookie")).toBeNull();
  });

  it("returns null for an API 404 instead of throwing, so the caller can render a real not-found", async () => {
    stubFetchOnce(
      jsonResponse(
        { error: { code: "NOT_FOUND", message: "Product not found" } },
        404,
      ),
    );

    await expect(getProductBySlugServer("unknown-slug")).resolves.toBeNull();
  });

  it("rejects a malformed product detail payload instead of returning it", async () => {
    stubFetchOnce(jsonResponse(omit(productDetail, "documentationUrl")));

    await expect(
      getProductBySlugServer("lotus-commerce"),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("throws instead of signalling not-found when the API fails for a reason other than 404", async () => {
    stubFetchOnce(
      jsonResponse(
        { error: { code: "INTERNAL_SERVER_ERROR", message: "boom" } },
        500,
      ),
    );

    await expect(getProductBySlugServer("lotus-commerce")).rejects.toThrow();
  });
});

describe("listCategoriesServer", () => {
  it("validates a well-formed category collection response", async () => {
    stubFetchOnce(
      jsonResponse({
        data: [categorySummary],
        meta: { nextCursor: null, hasMore: false },
      }),
    );

    await expect(listCategoriesServer({ locale: "vi" })).resolves.toMatchObject(
      {
        data: [{ slug: "ecommerce" }],
      },
    );
  });

  it("fetches the API origin directly with the locale query param and forwards no cookies", async () => {
    const fetchMock = stubFetchOnce(
      jsonResponse({ data: [], meta: { nextCursor: null, hasMore: false } }),
    );

    await listCategoriesServer({ locale: "en" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      string | URL,
      RequestInit | undefined,
    ];
    const url = new URL(String(calledUrl));
    expect(url.origin).toBe("http://api.internal.test:4000");
    expect(url.pathname).toBe("/v1/categories");
    expect(url.searchParams.get("locale")).toBe("en");
    expect(calledInit?.credentials).toBeUndefined();
    expect(new Headers(calledInit?.headers).get("cookie")).toBeNull();
  });

  it("rejects a malformed category collection payload instead of returning it", async () => {
    stubFetchOnce(
      jsonResponse({
        data: [{ ...categorySummary, slug: "not-a-real-category" }],
        meta: { nextCursor: null, hasMore: false },
      }),
    );

    await expect(listCategoriesServer({ locale: "vi" })).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("rejects an API failure instead of returning a partial result", async () => {
    stubFetchOnce(
      jsonResponse(
        { error: { code: "INTERNAL_SERVER_ERROR", message: "boom" } },
        500,
      ),
    );

    await expect(listCategoriesServer({ locale: "vi" })).rejects.toThrow();
  });
});
