import { describe, expect, it } from "vitest";

import {
  categorySlugSchema,
  licenceIdentifierSchema,
  localizedCategorySummarySchema,
  productCollectionResponseSchema,
  productDetailResponseSchema,
  publicationStateSchema,
} from "./index.js";

const translations = [
  {
    locale: "vi",
    title: "Bộ giao diện cửa hàng hiện đại",
    summary: "Một cửa hàng nhanh và dễ tuỳ chỉnh.",
    description: "Bộ giao diện song ngữ dành cho các thương hiệu bán lẻ.",
  },
  {
    locale: "en",
    title: "Modern storefront template",
    summary: "A fast, adaptable commerce storefront.",
    description: "A bilingual template for modern retail brands.",
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
  translations: translations.map(
    ({ description: _description, ...translation }) => translation,
  ),
  currentVersion: "1.4.0",
  thumbnailUrl: "https://media.kitvera.example/lotus/card.webp",
  licenceOptions,
};

const productDetail = {
  ...productCard,
  translations,
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
  compatibility: [
    { target: "nextjs", constraint: ">=15" },
    { target: "nodejs", constraint: ">=20" },
  ],
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
    {
      position: 1,
      kind: "video",
      url: "https://media.kitvera.example/lotus/tour.mp4",
      translations: [
        { locale: "vi", alt: "Video giới thiệu Lotus" },
        { locale: "en", alt: "Lotus template tour" },
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
    {
      position: 1,
      slug: "product-detail",
      previewUrl: "https://preview-lotus.kitvera.example/products/example",
      translations: [
        { locale: "vi", title: "Chi tiết sản phẩm" },
        { locale: "en", title: "Product detail" },
      ],
    },
  ],
  documentationUrl: "https://docs.kitvera.example/lotus-commerce",
  isolatedPreviewUrl: "https://preview-lotus.kitvera.example",
};

describe("catalogue read contracts", () => {
  it("exports the approved enums and parses bilingual category summaries", () => {
    expect(categorySlugSchema.options).toEqual([
      "wordpress",
      "elementor",
      "html",
      "shopify",
      "jamstack",
      "marketing",
      "cms",
      "ecommerce",
      "ui-templates",
      "plugins",
    ]);
    expect(publicationStateSchema.parse("published")).toBe("published");
    expect(licenceIdentifierSchema.parse("Regular")).toBe("Regular");
    expect(licenceIdentifierSchema.parse("Extended")).toBe("Extended");

    expect(
      localizedCategorySummarySchema.parse({
        slug: "ecommerce",
        translations: [
          {
            locale: "vi",
            name: "Thương mại điện tử",
            summary: "Mẫu cửa hàng.",
          },
          { locale: "en", name: "eCommerce", summary: "Storefront templates." },
        ],
      }),
    ).toMatchObject({ slug: "ecommerce" });
  });

  it("parses product cards in the cursor collection envelope", () => {
    expect(
      productCollectionResponseSchema.parse({
        data: [productCard],
        meta: { nextCursor: "next-product", hasMore: true },
      }),
    ).toMatchObject({
      data: [{ slug: "lotus-commerce" }],
      meta: { hasMore: true },
    });
  });

  it("parses a representative bilingual product detail response", () => {
    expect(productDetailResponseSchema.parse(productDetail)).toEqual(
      productDetail,
    );
  });

  it.each(["themes", "ui_templates", "Ecommerce"])(
    "rejects the unknown or malformed category slug %s",
    (category) => {
      expect(categorySlugSchema.safeParse(category).success).toBe(false);
    },
  );

  it("rejects unsupported locales and currencies", () => {
    expect(
      productDetailResponseSchema.safeParse({
        ...productDetail,
        translations: [{ ...translations[0], locale: "fr" }, translations[1]],
      }).success,
    ).toBe(false);
    expect(
      productDetailResponseSchema.safeParse({
        ...productDetail,
        licenceOptions: [
          {
            ...licenceOptions[0],
            prices: [
              { amount: 49_00, currency: "EUR" },
              licenceOptions[0]?.prices[1],
            ],
          },
          licenceOptions[1],
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects fractional prices and incomplete licence or currency coverage", () => {
    expect(
      productDetailResponseSchema.safeParse({
        ...productDetail,
        licenceOptions: [
          {
            ...licenceOptions[0],
            prices: [
              { amount: 1_290_000.5, currency: "VND" },
              { amount: 49_00, currency: "USD" },
            ],
          },
          licenceOptions[1],
        ],
      }).success,
    ).toBe(false);

    expect(
      productDetailResponseSchema.safeParse({
        ...productDetail,
        licenceOptions: [licenceOptions[0]],
      }).success,
    ).toBe(false);
    expect(
      productDetailResponseSchema.safeParse({
        ...productDetail,
        licenceOptions: [
          { ...licenceOptions[0], prices: [licenceOptions[0]?.prices[0]] },
          licenceOptions[1],
        ],
      }).success,
    ).toBe(false);
  });

  it.each([
    "javascript:alert(1)",
    "ftp://media.kitvera.example/image.webp",
    "https://user:secret@media.kitvera.example/image.webp",
    "http://localhost:3000/image.webp",
    "http://192.168.1.4/image.webp",
    "http://2130706433/image.webp",
    "http://127.1/image.webp",
    "http://127.0.0.1./image.webp",
    "http://[0:0:0:0:0:0:0:1]/image.webp",
    "http://[::ffff:127.0.0.1]/image.webp",
    "http://[::ffff:10.0.0.1]/image.webp",
    "http://[::ffff:172.16.0.1]/image.webp",
    "http://[::ffff:192.168.0.1]/image.webp",
  ])("rejects the unsafe or non-HTTP(S) public URL %s", (url) => {
    expect(
      productDetailResponseSchema.safeParse({
        ...productDetail,
        documentationUrl: url,
      }).success,
    ).toBe(false);
  });

  it.each([
    "https://media.kitvera.example/image.webp",
    "http://media.kitvera.example/image.webp",
  ])("accepts the public HTTP(S) URL %s", (documentationUrl) => {
    expect(
      productDetailResponseSchema.safeParse({
        ...productDetail,
        documentationUrl,
      }).success,
    ).toBe(true);
  });

  it.each(["Lotus Commerce", "lotus_commerce", "-lotus", "lotus-"])(
    "rejects the malformed product slug %s",
    (slug) => {
      expect(
        productDetailResponseSchema.safeParse({ ...productDetail, slug })
          .success,
      ).toBe(false);
    },
  );

  it.each(["v1.4.0", "1.4", "01.4.0", "latest"])(
    "rejects the malformed semantic version %s",
    (currentVersion) => {
      expect(
        productDetailResponseSchema.safeParse({
          ...productDetail,
          currentVersion,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects duplicate ordered media and demo positions", () => {
    expect(
      productDetailResponseSchema.safeParse({
        ...productDetail,
        media: [
          productDetail.media[0],
          { ...productDetail.media[1], position: 0 },
        ],
      }).success,
    ).toBe(false);
    expect(
      productDetailResponseSchema.safeParse({
        ...productDetail,
        demoPages: [
          productDetail.demoPages[0],
          { ...productDetail.demoPages[1], position: 0 },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields at every public response boundary", () => {
    expect(
      productDetailResponseSchema.safeParse({
        ...productDetail,
        searchScore: 0.98,
      }).success,
    ).toBe(false);
    expect(
      productCollectionResponseSchema.safeParse({
        data: [{ ...productCard, salesCount: 10 }],
        meta: { nextCursor: null, hasMore: false },
      }).success,
    ).toBe(false);
  });
});
