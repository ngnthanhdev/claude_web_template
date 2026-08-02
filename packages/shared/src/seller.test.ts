import { describe, expect, it } from "vitest";

import {
  createDraftProductRequestSchema,
  createVersionRequestSchema,
  editDraftProductRequestSchema,
  factoryArtifactIngestRequestSchema,
  factoryArtifactIngestResponseSchema,
  reviewStateSchema,
  sellerProductDetailResponseSchema,
  sellerProductListResponseSchema,
  submitForReviewRequestSchema,
  submitForReviewResponseSchema,
} from "./index.js";

const validCreateDraftProductRequest = {
  slug: "lotus-commerce-theme",
  category: "ecommerce",
  thumbnailUrl: "https://cdn.example.com/thumbs/lotus-commerce.png",
  documentationUrl: "https://docs.example.com/lotus-commerce",
  isolatedPreviewUrl: "https://preview.example.com/lotus-commerce",
  tags: ["shopify", "storefront"],
};

const validTranslation = {
  locale: "en",
  title: "Lotus Commerce",
  summary: "A storefront theme.",
  description: "A full-featured storefront theme for Shopify.",
};

const validEditDraftProductRequest = {
  category: "ecommerce",
  tags: ["shopify"],
  thumbnailUrl: "https://cdn.example.com/thumbs/lotus-commerce.png",
  documentationUrl: "https://docs.example.com/lotus-commerce",
  isolatedPreviewUrl: "https://preview.example.com/lotus-commerce",
  translations: [validTranslation, { ...validTranslation, locale: "vi" }],
  media: [
    {
      position: 0,
      kind: "image",
      url: "https://cdn.example.com/media/0.png",
      translations: [
        { locale: "en", alt: "Homepage" },
        { locale: "vi", alt: "Trang chủ" },
      ],
    },
  ],
  compatibility: [{ target: "shopify", constraint: ">=2.0" }],
  specifications: [
    {
      key: "responsive",
      translations: [
        { locale: "en", label: "Responsive", value: "Yes" },
        { locale: "vi", label: "Đáp ứng", value: "Có" },
      ],
    },
  ],
  demoPages: [
    {
      position: 0,
      slug: "home",
      previewUrl: "https://preview.example.com/lotus-commerce/home",
      translations: [
        { locale: "en", title: "Home" },
        { locale: "vi", title: "Trang chủ" },
      ],
    },
  ],
};

const validCreateVersionRequest = {
  version: "1.0.0",
  releasedAt: "2026-08-01T00:00:00.000Z",
  translations: [
    { locale: "en", notes: "Initial release." },
    { locale: "vi", notes: "Phát hành đầu tiên." },
  ],
};

const validSubmitForReviewRequest = { version: "1.0.0" };

const validArtifact = {
  id: "3b6e1c2a-4f5d-4e6f-8a9b-0c1d2e3f4a5b",
  storageId: "s3://factory-artifacts/lotus-commerce/1.0.0.zip",
  checksum: "a".repeat(64),
  sizeBytes: 1_048_576,
  producedAt: "2026-08-01T00:00:00.000Z",
  factoryRunId: "run-2026-08-01-001",
};

const validVersionSummary = {
  version: "1.0.0",
  releasedAt: "2026-08-01T00:00:00.000Z",
  reviewState: "in_review",
  latestBuildRun: {
    id: "6d4b8a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b",
    status: "succeeded",
    startedAt: "2026-08-01T00:00:00.000Z",
    finishedAt: "2026-08-01T00:05:00.000Z",
    qaVerdict: "passed",
    scanVerdict: "passed",
    artifact: validArtifact,
  },
};

const validSellerProductSummary = {
  id: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  slug: "lotus-commerce-theme",
  category: "ecommerce",
  publicationState: "draft",
  tags: ["shopify"],
  versions: [validVersionSummary],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const validSellerProductDetail = {
  ...validSellerProductSummary,
  thumbnailUrl: "https://cdn.example.com/thumbs/lotus-commerce.png",
  documentationUrl: "https://docs.example.com/lotus-commerce",
  isolatedPreviewUrl: "https://preview.example.com/lotus-commerce",
  translations: [validTranslation, { ...validTranslation, locale: "vi" }],
  media: validEditDraftProductRequest.media,
  compatibility: validEditDraftProductRequest.compatibility,
  specifications: validEditDraftProductRequest.specifications,
  demoPages: validEditDraftProductRequest.demoPages,
};

const validFactoryIngestRequest = {
  productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  version: "1.0.0",
  storageId: "s3://factory-artifacts/lotus-commerce/1.0.0.zip",
  checksum: "a".repeat(64),
  signature: "b".repeat(88),
  sizeBytes: 1_048_576,
  producedAt: "2026-08-01T00:00:00.000Z",
  factoryRunId: "run-2026-08-01-001",
  qaVerdict: "passed",
  scanVerdict: "passed",
};

describe("reviewStateSchema", () => {
  it("is exactly draft|in_review|approved", () => {
    expect(reviewStateSchema.options).toEqual([
      "draft",
      "in_review",
      "approved",
    ]);
  });

  it("rejects published (publication stays on PublicationState)", () => {
    expect(reviewStateSchema.safeParse("published").success).toBe(false);
  });
});

describe("create-draft-product request contract", () => {
  it("accepts a representative valid payload", () => {
    expect(
      createDraftProductRequestSchema.parse(validCreateDraftProductRequest),
    ).toEqual(validCreateDraftProductRequest);
  });

  for (const smuggledField of [
    { sellerId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9" },
    { publicationState: "published" },
    { isFeatured: true },
    { price: { amount: 1_000, currency: "USD" } },
    { reviewState: "approved" },
    { checksum: "a".repeat(64) },
    { signature: "b".repeat(88) },
  ]) {
    it(`rejects a smuggled server-owned field: ${Object.keys(smuggledField)[0]}`, () => {
      expect(
        createDraftProductRequestSchema.safeParse({
          ...validCreateDraftProductRequest,
          ...smuggledField,
        }).success,
      ).toBe(false);
    });
  }

  it("rejects an unknown category", () => {
    expect(
      createDraftProductRequestSchema.safeParse({
        ...validCreateDraftProductRequest,
        category: "not-a-category",
      }).success,
    ).toBe(false);
  });

  it("rejects an over-long tags list", () => {
    expect(
      createDraftProductRequestSchema.safeParse({
        ...validCreateDraftProductRequest,
        tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`),
      }).success,
    ).toBe(false);
  });

  it("rejects a non-public/SSRF-prone URL on the authoring write path", () => {
    for (const badUrl of [
      "http://169.254.169.254/latest/meta-data",
      "https://localhost/internal",
      "https://user:pass@cdn.example.com/thumb.png",
    ]) {
      expect(
        createDraftProductRequestSchema.safeParse({
          ...validCreateDraftProductRequest,
          thumbnailUrl: badUrl,
        }).success,
      ).toBe(false);
    }
  });
});

describe("edit-draft-product request contract", () => {
  it("accepts a representative valid payload", () => {
    expect(
      editDraftProductRequestSchema.parse(validEditDraftProductRequest),
    ).toEqual(validEditDraftProductRequest);
  });

  it("accepts a partial payload (PATCH semantics)", () => {
    expect(
      editDraftProductRequestSchema.safeParse({ tags: ["shopify"] }).success,
    ).toBe(true);
    expect(editDraftProductRequestSchema.safeParse({}).success).toBe(true);
  });

  for (const smuggledField of [
    { sellerId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9" },
    { publicationState: "published" },
    { isFeatured: true },
    { price: { amount: 1_000, currency: "USD" } },
    { reviewState: "approved" },
  ]) {
    it(`rejects a smuggled server-owned field: ${Object.keys(smuggledField)[0]}`, () => {
      expect(
        editDraftProductRequestSchema.safeParse({
          ...validEditDraftProductRequest,
          ...smuggledField,
        }).success,
      ).toBe(false);
    });
  }

  it("rejects an unknown locale in translations", () => {
    expect(
      editDraftProductRequestSchema.safeParse({
        translations: [{ ...validTranslation, locale: "fr" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed media url", () => {
    expect(
      editDraftProductRequestSchema.safeParse({
        media: [{ ...validEditDraftProductRequest.media[0], url: "not-a-url" }],
      }).success,
    ).toBe(false);
  });
});

describe("create-version request contract", () => {
  it("accepts a representative valid payload", () => {
    expect(createVersionRequestSchema.parse(validCreateVersionRequest)).toEqual(
      validCreateVersionRequest,
    );
  });

  it("rejects a malformed semantic version", () => {
    expect(
      createVersionRequestSchema.safeParse({
        ...validCreateVersionRequest,
        version: "1.0",
      }).success,
    ).toBe(false);
  });

  for (const smuggledField of [
    { reviewState: "approved" },
    { checksum: "a".repeat(64) },
    { signature: "b".repeat(88) },
  ]) {
    it(`rejects a smuggled server-owned field: ${Object.keys(smuggledField)[0]}`, () => {
      expect(
        createVersionRequestSchema.safeParse({
          ...validCreateVersionRequest,
          ...smuggledField,
        }).success,
      ).toBe(false);
    });
  }
});

describe("submit-for-review request/response contract", () => {
  it("accepts a representative valid request", () => {
    expect(
      submitForReviewRequestSchema.parse(validSubmitForReviewRequest),
    ).toEqual(validSubmitForReviewRequest);
  });

  it("rejects a request that tries to set reviewState directly (e.g. approved/published)", () => {
    expect(
      submitForReviewRequestSchema.safeParse({
        ...validSubmitForReviewRequest,
        reviewState: "approved",
      }).success,
    ).toBe(false);
    expect(
      submitForReviewRequestSchema.safeParse({
        ...validSubmitForReviewRequest,
        reviewState: "published",
      }).success,
    ).toBe(false);
  });

  it("accepts a representative valid response and rejects an out-of-range reviewState", () => {
    const response = {
      productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
      version: "1.0.0",
      reviewState: "in_review",
    };
    expect(submitForReviewResponseSchema.parse(response)).toEqual(response);
    expect(
      submitForReviewResponseSchema.safeParse({
        ...response,
        reviewState: "published",
      }).success,
    ).toBe(false);
  });
});

describe("seller product-list response contract", () => {
  it("accepts a representative valid page", () => {
    const response = {
      data: [validSellerProductSummary],
      meta: { nextCursor: null, hasMore: false },
    };
    expect(sellerProductListResponseSchema.parse(response)).toEqual(response);
  });

  for (const buyerOrPersistenceField of [
    "buyerId",
    "buyerEmail",
    "orderId",
    "revenueMinor",
    "totalSalesMinor",
  ]) {
    it(`rejects a buyer/order/persistence-only field on a summary: ${buyerOrPersistenceField}`, () => {
      expect(
        sellerProductListResponseSchema.safeParse({
          data: [
            { ...validSellerProductSummary, [buyerOrPersistenceField]: "x" },
          ],
          meta: { nextCursor: null, hasMore: false },
        }).success,
      ).toBe(false);
    });
  }
});

describe("seller product-detail response contract", () => {
  it("accepts a representative valid detail (publicationState + version reviewState + artifact/build metadata)", () => {
    expect(
      sellerProductDetailResponseSchema.parse(validSellerProductDetail),
    ).toEqual(validSellerProductDetail);
  });

  for (const buyerOrOrderField of [
    "buyerId",
    "buyerEmail",
    "orderId",
    "revenueMinor",
    "totalSalesMinor",
    "payoutAmountMinor",
  ]) {
    it(`rejects a buyer/order/revenue field: ${buyerOrOrderField}`, () => {
      expect(
        sellerProductDetailResponseSchema.safeParse({
          ...validSellerProductDetail,
          [buyerOrOrderField]: "must-not-leak",
        }).success,
      ).toBe(false);
    });
  }

  it("rejects the artifact signature on the linked build metadata", () => {
    expect(
      sellerProductDetailResponseSchema.safeParse({
        ...validSellerProductDetail,
        versions: [
          {
            ...validVersionSummary,
            latestBuildRun: {
              ...validVersionSummary.latestBuildRun,
              artifact: {
                ...validArtifact,
                signature: "b".repeat(88),
              },
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("factory artifact ingest request/response contract", () => {
  it("accepts a representative valid payload", () => {
    expect(
      factoryArtifactIngestRequestSchema.parse(validFactoryIngestRequest),
    ).toEqual(validFactoryIngestRequest);
  });

  it("rejects a malformed semantic version", () => {
    expect(
      factoryArtifactIngestRequestSchema.safeParse({
        ...validFactoryIngestRequest,
        version: "not-a-version",
      }).success,
    ).toBe(false);
  });

  it("requires checksum and signature", () => {
    const { checksum: _checksum, ...withoutChecksum } =
      validFactoryIngestRequest;
    expect(
      factoryArtifactIngestRequestSchema.safeParse(withoutChecksum).success,
    ).toBe(false);

    const { signature: _signature, ...withoutSignature } =
      validFactoryIngestRequest;
    expect(
      factoryArtifactIngestRequestSchema.safeParse(withoutSignature).success,
    ).toBe(false);
  });

  it("accepts a representative valid response", () => {
    const response = {
      artifactId: "3b6e1c2a-4f5d-4e6f-8a9b-0c1d2e3f4a5b",
      buildRunId: "6d4b8a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b",
      productId: validFactoryIngestRequest.productId,
      version: validFactoryIngestRequest.version,
      recordedAt: "2026-08-01T00:05:00.000Z",
    };
    expect(factoryArtifactIngestResponseSchema.parse(response)).toEqual(
      response,
    );
  });

  it("rejects a persistence-only field on the ingest response", () => {
    expect(
      factoryArtifactIngestResponseSchema.safeParse({
        artifactId: "3b6e1c2a-4f5d-4e6f-8a9b-0c1d2e3f4a5b",
        buildRunId: "6d4b8a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b",
        productId: validFactoryIngestRequest.productId,
        version: validFactoryIngestRequest.version,
        recordedAt: "2026-08-01T00:05:00.000Z",
        storageId: "s3://leaked",
      }).success,
    ).toBe(false);
  });
});
