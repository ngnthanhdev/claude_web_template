import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  createDraftProduct,
  createProductVersion,
  editDraftProduct,
  getSellerProductById,
  listSellerProducts,
  submitForReview,
} from "./seller-client";

const PRODUCT_ID = "2a80d74e-6f18-48a6-9034-7b79a8af93e9";
const CSRF_TOKEN = "csrf-token-value";

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

function calledInit(fetchMock: ReturnType<typeof stubFetchOnce>): RequestInit {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return init;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const productSummary = {
  id: PRODUCT_ID,
  slug: "lotus-commerce",
  category: "wordpress" as const,
  publicationState: "draft" as const,
  tags: ["storefront"],
  versions: [
    {
      version: "1.4.0",
      releasedAt: "2026-08-01T00:00:00.000Z",
      reviewState: "draft" as const,
      latestBuildRun: null,
    },
  ],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const productDetail = {
  ...productSummary,
  thumbnailUrl: "https://cdn.kitvera.example/thumb.png",
  documentationUrl: "https://kitvera.example/docs",
  isolatedPreviewUrl: "https://kitvera.example/preview",
  translations: [
    {
      locale: "en" as const,
      title: "Lotus Commerce",
      summary: "A commerce kit",
      description: "A full commerce kit description",
    },
  ],
  media: [],
  compatibility: [],
  specifications: [],
  demoPages: [],
};

describe("createDraftProduct", () => {
  const createInput = {
    slug: "lotus-commerce",
    category: "wordpress" as const,
    thumbnailUrl: "https://cdn.kitvera.example/thumb.png",
    documentationUrl: "https://kitvera.example/docs",
    isolatedPreviewUrl: "https://kitvera.example/preview",
  };

  it("posts a request built only from the shared create-draft schema and validates the response", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(productDetail));

    await expect(createDraftProduct(createInput, CSRF_TOKEN)).resolves.toEqual(
      productDetail,
    );

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/seller/products");
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(createInput);
  });

  it("sends the session CSRF token on the create-draft mutation", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(productDetail));

    await createDraftProduct(createInput, CSRF_TOKEN);

    expect(new Headers(calledInit(fetchMock).headers).get("x-csrf-token")).toBe(
      CSRF_TOKEN,
    );
  });

  it("rejects a request carrying server-owned fields the shared schema does not allow", async () => {
    // Deliberately smuggling server-owned authority: the shared create-draft
    // request schema has no such fields, so this must be rejected before any
    // request is sent, even though `tamperedInput` type-checks as a plain
    // object.
    const tamperedInput = {
      ...createInput,
      sellerId: "attacker-seller-id",
      publicationState: "published",
      isFeatured: true,
    };

    await expect(
      createDraftProduct(tamperedInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects a malformed create-draft response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ id: PRODUCT_ID }));

    await expect(
      createDraftProduct(createInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("editDraftProduct", () => {
  const editInput = {
    category: "wordpress" as const,
    tags: ["storefront"],
  };

  it("sends a PATCH built only from the shared edit-draft schema and validates the response", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(productDetail));

    await expect(
      editDraftProduct(PRODUCT_ID, editInput, CSRF_TOKEN),
    ).resolves.toEqual(productDetail);

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(`/api/v1/seller/products/${PRODUCT_ID}`);
    const init = calledInit(fetchMock);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual(editInput);
  });

  it("sends the session CSRF token on the edit-draft mutation", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(productDetail));

    await editDraftProduct(PRODUCT_ID, editInput, CSRF_TOKEN);

    expect(new Headers(calledInit(fetchMock).headers).get("x-csrf-token")).toBe(
      CSRF_TOKEN,
    );
  });

  it("rejects a request carrying server-owned fields the shared schema does not allow", async () => {
    const tamperedInput = {
      ...editInput,
      publicationState: "published",
      sellerId: "attacker-seller-id",
    };

    await expect(
      editDraftProduct(PRODUCT_ID, tamperedInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects a malformed edit-draft response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ id: PRODUCT_ID }));

    await expect(
      editDraftProduct(PRODUCT_ID, editInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("createProductVersion", () => {
  const versionInput = {
    version: "1.5.0",
    releasedAt: "2026-08-02T00:00:00.000Z",
    translations: [{ locale: "en" as const, notes: "Bug fixes" }],
  };

  it("posts a request built only from the shared create-version schema and validates the response", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(productDetail));

    await expect(
      createProductVersion(PRODUCT_ID, versionInput, CSRF_TOKEN),
    ).resolves.toEqual(productDetail);

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(`/api/v1/seller/products/${PRODUCT_ID}/versions`);
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(versionInput);
  });

  it("sends the session CSRF token on the create-version mutation", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(productDetail));

    await createProductVersion(PRODUCT_ID, versionInput, CSRF_TOKEN);

    expect(new Headers(calledInit(fetchMock).headers).get("x-csrf-token")).toBe(
      CSRF_TOKEN,
    );
  });

  it("rejects a request carrying a reviewState field the shared schema does not allow", async () => {
    const tamperedInput = { ...versionInput, reviewState: "approved" };

    await expect(
      createProductVersion(PRODUCT_ID, tamperedInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects a malformed create-version response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ id: PRODUCT_ID }));

    await expect(
      createProductVersion(PRODUCT_ID, versionInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("submitForReview", () => {
  const submitInput = { version: "1.4.0" };
  const submitResponse = {
    productId: PRODUCT_ID,
    version: "1.4.0",
    reviewState: "in_review" as const,
  };

  it("posts a request built only from the shared submit-for-review schema and validates the response", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(submitResponse));

    await expect(
      submitForReview(PRODUCT_ID, submitInput, CSRF_TOKEN),
    ).resolves.toEqual(submitResponse);

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(
      `/api/v1/seller/products/${PRODUCT_ID}/submit-for-review`,
    );
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(submitInput);
  });

  it("sends the session CSRF token on the submit-for-review mutation", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(submitResponse));

    await submitForReview(PRODUCT_ID, submitInput, CSRF_TOKEN);

    expect(new Headers(calledInit(fetchMock).headers).get("x-csrf-token")).toBe(
      CSRF_TOKEN,
    );
  });

  it("rejects a request that tries to reach an elevated review state the shared schema does not allow", async () => {
    // The dedicated transition schema only ever carries `version` — a
    // seller-controlled `reviewState` field must never be constructible.
    const tamperedInput = { ...submitInput, reviewState: "approved" };

    await expect(
      submitForReview(PRODUCT_ID, tamperedInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects a malformed submit-for-review response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ productId: PRODUCT_ID }));

    await expect(
      submitForReview(PRODUCT_ID, submitInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("listSellerProducts", () => {
  it("validates the cursor-paginated seller product list response", async () => {
    const responseBody = {
      data: [productSummary],
      meta: { nextCursor: null, hasMore: false },
    };
    const fetchMock = stubFetchOnce(jsonResponse(responseBody));

    await expect(listSellerProducts()).resolves.toEqual(responseBody);
    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/seller/products?");
  });

  it("forwards cursor and limit as query parameters", async () => {
    const responseBody = {
      data: [productSummary],
      meta: { nextCursor: "next-cursor", hasMore: true },
    };
    const fetchMock = stubFetchOnce(jsonResponse(responseBody));

    await listSellerProducts({ cursor: "abc", limit: 10 });

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/seller/products?cursor=abc&limit=10");
  });

  it("rejects a malformed seller product list response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ data: [productSummary] }));

    await expect(listSellerProducts()).rejects.toBeInstanceOf(ZodError);
  });
});

describe("getSellerProductById", () => {
  it("fetches one owned seller product and validates the allowlisted detail DTO", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(productDetail));

    await expect(getSellerProductById(PRODUCT_ID)).resolves.toEqual(
      productDetail,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/seller/products/${PRODUCT_ID}`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("rejects a detail response leaking a buyer/order/revenue field", async () => {
    stubFetchOnce(jsonResponse({ ...productDetail, totalRevenue: 100 }));

    await expect(getSellerProductById(PRODUCT_ID)).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});
