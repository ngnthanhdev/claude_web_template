import { HttpStatus } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { apiErrorSchema } from "@marketplace/shared/api";
import { ZodValidationException } from "nestjs-zod";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { configureApp } from "../bootstrap/configure-app.js";
import { AuthCryptoService } from "../auth/core/auth-crypto.service.js";
import {
  AUTH_CLOCK,
  AuthSessionService,
} from "../auth/core/auth-session.service.js";
import { SESSION_COOKIE_NAME } from "../auth/core/auth-cookie.js";
import { SessionAuthGuard } from "../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../auth/sessions/session-csrf.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SellerGuard } from "./seller.guard.js";
import { SellerProductsController } from "./seller-products.controller.js";
import { SellerProductsService } from "./seller-products.service.js";
import { SellerReviewController } from "./seller-review.controller.js";
import { SellerReviewService } from "./seller-review.service.js";
import { SellerVersionsController } from "./seller-versions.controller.js";
import { SellerVersionsService } from "./seller-versions.service.js";

const rawSessionToken = Buffer.alloc(32, 31).toString("base64url");
const csrfToken = Buffer.alloc(32, 32).toString("base64url");
const sessionId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const sellerId = "10000000-0000-4000-8000-000000000003";
const productId = "20000000-0000-4000-8000-000000000001";
const idleExpiresAt = new Date("2026-08-21T00:00:00.000Z");
const absoluteExpiresAt = new Date("2026-10-20T00:00:00.000Z");
const now = new Date("2026-07-22T00:00:00.000Z");

function cookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

const validCreateBody = {
  slug: "lotus-commerce-theme",
  category: "ecommerce",
  thumbnailUrl: "https://cdn.example.com/thumbs/lotus-commerce.png",
  documentationUrl: "https://docs.example.com/lotus-commerce",
  isolatedPreviewUrl: "https://preview.example.com/lotus-commerce",
};

const validVersionBody = {
  version: "1.0.0",
  releasedAt: "2026-08-01T00:00:00.000Z",
  translations: [{ locale: "en", notes: "Initial release." }],
};

describe("Seller controllers", () => {
  let app: NestFastifyApplication;
  const sellerProducts = {
    list: vi.fn(),
    findOwnedDetail: vi.fn(),
    createDraft: vi.fn(),
    editDraft: vi.fn(),
  };
  const sellerVersions = { createVersion: vi.fn() };
  const sellerReview = { submitForReview: vi.fn() };
  const sessions = { resolveSession: vi.fn(), verifyCsrf: vi.fn() };
  const crypto = { hashSessionToken: vi.fn(), deriveCsrfToken: vi.fn() };
  const clock = { now: vi.fn() };
  const prisma = {
    session: { findUnique: vi.fn() },
    userRole: { findFirst: vi.fn() },
    sellerProfile: { findUnique: vi.fn() },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        SellerProductsController,
        SellerVersionsController,
        SellerReviewController,
      ],
      providers: [
        SessionAuthGuard,
        SessionCsrfGuard,
        SellerGuard,
        { provide: SellerProductsService, useValue: sellerProducts },
        { provide: SellerVersionsService, useValue: sellerVersions },
        { provide: SellerReviewService, useValue: sellerReview },
        { provide: AuthSessionService, useValue: sessions },
        { provide: AuthCryptoService, useValue: crypto },
        { provide: AUTH_CLOCK, useValue: clock },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clock.now.mockReturnValue(now);
    crypto.hashSessionToken.mockReturnValue("stored-session-hash");
    crypto.deriveCsrfToken.mockReturnValue(csrfToken);
    prisma.session.findUnique.mockResolvedValue({
      id: sessionId,
      csrfHash: "stored-csrf-hash",
      idleExpiresAt,
      absoluteExpiresAt,
      revokedAt: null,
      rotatedToId: null,
      user: { id: userId, normalizedEmail: "seller@example.com" },
    });
    sessions.resolveSession.mockResolvedValue({
      sessionId,
      user: { id: userId, email: "seller@example.com" },
      csrfToken,
      idleExpiresAt,
      absoluteExpiresAt,
      replacementSessionToken: null,
    });
    sessions.verifyCsrf.mockReturnValue(true);
    prisma.userRole.findFirst.mockResolvedValue({ id: "role-assignment" });
    prisma.sellerProfile.findUnique.mockResolvedValue({ id: sellerId });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the shared 401 envelope when the session cookie is absent", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/seller/products")
      .expect(HttpStatus.UNAUTHORIZED);
    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "SESSION_UNAUTHENTICATED" },
    });
    expect(sellerProducts.list).not.toHaveBeenCalled();
  });

  it("rejects a session without the seller role", async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get("/v1/seller/products")
      .set("Cookie", cookieHeader())
      .expect(HttpStatus.FORBIDDEN);
    expect(sellerProducts.list).not.toHaveBeenCalled();
    expect(prisma.sellerProfile.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a seller role that has no seller profile (never auto-provisions one)", async () => {
    prisma.sellerProfile.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get("/v1/seller/products")
      .set("Cookie", cookieHeader())
      .expect(HttpStatus.FORBIDDEN);
    expect(sellerProducts.list).not.toHaveBeenCalled();
  });

  it("delegates the server-resolved sellerId to the list, never a client-supplied one", async () => {
    sellerProducts.list.mockResolvedValue({
      data: [],
      meta: { nextCursor: null, hasMore: false },
    });

    await request(app.getHttpServer())
      .get("/v1/seller/products")
      .set("Cookie", cookieHeader())
      .expect(HttpStatus.OK);

    expect(sellerProducts.list).toHaveBeenCalledWith(sellerId, { limit: 20 });
  });

  it("rejects an attempt to smuggle a sellerId query parameter (the list query is a closed allowlist)", async () => {
    await request(app.getHttpServer())
      .get("/v1/seller/products?sellerId=some-other-id")
      .set("Cookie", cookieHeader())
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(sellerProducts.list).not.toHaveBeenCalled();
  });

  it("returns the shared 422 envelope for a malformed product id", async () => {
    await request(app.getHttpServer())
      .get("/v1/seller/products/not-a-uuid")
      .set("Cookie", cookieHeader())
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(sellerProducts.findOwnedDetail).not.toHaveBeenCalled();
  });

  it("requires the session-bound CSRF token to create a draft product", async () => {
    await request(app.getHttpServer())
      .post("/v1/seller/products")
      .set("Cookie", cookieHeader())
      .send(validCreateBody)
      .expect(HttpStatus.FORBIDDEN);
    expect(sellerProducts.createDraft).not.toHaveBeenCalled();
  });

  it("rejects a create body that smuggles a server-owned field", async () => {
    for (const smuggled of [
      { sellerId: "20000000-0000-4000-8000-0000000000ff" },
      { publicationState: "published" },
      { isFeatured: true },
      { reviewState: "approved" },
    ]) {
      const response = await request(app.getHttpServer())
        .post("/v1/seller/products")
        .set("Cookie", cookieHeader())
        .set("X-CSRF-Token", csrfToken)
        .send({ ...validCreateBody, ...smuggled })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(apiErrorSchema.parse(response.body)).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }
    expect(sellerProducts.createDraft).not.toHaveBeenCalled();
  });

  it("delegates the server-resolved sellerId and parsed body to create a draft product", async () => {
    sellerProducts.createDraft.mockResolvedValue({ id: productId });

    await request(app.getHttpServer())
      .post("/v1/seller/products")
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send(validCreateBody)
      .expect(HttpStatus.CREATED);

    expect(sellerProducts.createDraft).toHaveBeenCalledWith(
      sellerId,
      validCreateBody,
    );
  });

  it("rejects an edit body that smuggles a server-owned field", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/seller/products/${productId}`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ publicationState: "published" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(sellerProducts.editDraft).not.toHaveBeenCalled();
  });

  it("delegates a scoped edit to the server-resolved sellerId", async () => {
    sellerProducts.editDraft.mockResolvedValue({ id: productId });

    await request(app.getHttpServer())
      .patch(`/v1/seller/products/${productId}`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ tags: ["shopify"] })
      .expect(HttpStatus.OK);

    expect(sellerProducts.editDraft).toHaveBeenCalledWith(sellerId, productId, {
      tags: ["shopify"],
    });
  });

  it("requires the session-bound CSRF token to create a version", async () => {
    await request(app.getHttpServer())
      .post(`/v1/seller/products/${productId}/versions`)
      .set("Cookie", cookieHeader())
      .send(validVersionBody)
      .expect(HttpStatus.FORBIDDEN);
    expect(sellerVersions.createVersion).not.toHaveBeenCalled();
  });

  it("rejects a version body that smuggles reviewState", async () => {
    await request(app.getHttpServer())
      .post(`/v1/seller/products/${productId}/versions`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ ...validVersionBody, reviewState: "approved" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(sellerVersions.createVersion).not.toHaveBeenCalled();
  });

  it("delegates version creation to the server-resolved sellerId", async () => {
    sellerVersions.createVersion.mockResolvedValue({ id: productId });

    await request(app.getHttpServer())
      .post(`/v1/seller/products/${productId}/versions`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send(validVersionBody)
      .expect(HttpStatus.CREATED);

    expect(sellerVersions.createVersion).toHaveBeenCalledWith(
      sellerId,
      productId,
      validVersionBody,
    );
  });

  it("rejects a submit-for-review body that requests a non-draft target state", async () => {
    await request(app.getHttpServer())
      .post(`/v1/seller/products/${productId}/submit-for-review`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ version: "1.0.0", reviewState: "approved" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(sellerReview.submitForReview).not.toHaveBeenCalled();
  });

  it("delegates submit-for-review to the server-resolved sellerId", async () => {
    sellerReview.submitForReview.mockResolvedValue({
      productId,
      version: "1.0.0",
      reviewState: "in_review",
    });

    await request(app.getHttpServer())
      .post(`/v1/seller/products/${productId}/submit-for-review`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ version: "1.0.0" })
      .expect(HttpStatus.OK);

    expect(sellerReview.submitForReview).toHaveBeenCalledWith(
      sellerId,
      productId,
      { version: "1.0.0" },
    );
  });
});

describe("SellerProductsService boundaries", () => {
  const prisma = {
    product: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    category: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  let service: SellerProductsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SellerProductsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(SellerProductsService);
  });

  it("scopes list queries to the caller's own sellerId", async () => {
    prisma.product.findMany.mockResolvedValue([]);

    await service.list(sellerId, { limit: 20 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sellerId } }),
    );
  });

  it("hides a non-owned product id behind 404 (BOLA)", async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.findOwnedDetail(sellerId, productId),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it("rejects a tampered or malformed list cursor without querying the database", async () => {
    await expect(
      service.list(sellerId, { cursor: "not-a-cursor", limit: 20 }),
    ).rejects.toBeInstanceOf(ZodValidationException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("maps a duplicate slug on create to a 409 conflict", async () => {
    prisma.category.findUnique.mockResolvedValue({ id: "category-id" });
    prisma.product.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(
      service.createDraft(sellerId, {
        slug: validCreateBody.slug,
        category: "ecommerce",
        thumbnailUrl: validCreateBody.thumbnailUrl,
        documentationUrl: validCreateBody.documentationUrl,
        isolatedPreviewUrl: validCreateBody.isolatedPreviewUrl,
      }),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
  });

  it("hides a non-owned product from edit behind 404 before touching the transaction", async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.editDraft(sellerId, productId, {}),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects editing an own product that has left the draft state", async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: productId,
      publicationState: "published",
    });

    await expect(
      service.editDraft(sellerId, productId, {}),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("SellerReviewService boundaries", () => {
  const prisma = {
    product: { findFirst: vi.fn() },
    productVersion: { findUnique: vi.fn(), update: vi.fn() },
  };
  let service: SellerReviewService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SellerReviewService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(SellerReviewService);
  });

  it("hides a non-owned product behind 404", async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.submitForReview(sellerId, productId, { version: "1.0.0" }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(prisma.productVersion.findUnique).not.toHaveBeenCalled();
  });

  it("hides a missing version behind 404", async () => {
    prisma.product.findFirst.mockResolvedValue({ id: productId });
    prisma.productVersion.findUnique.mockResolvedValue(null);

    await expect(
      service.submitForReview(sellerId, productId, { version: "9.9.9" }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it("moves a draft version to in_review", async () => {
    prisma.product.findFirst.mockResolvedValue({ id: productId });
    prisma.productVersion.findUnique.mockResolvedValue({
      reviewState: "draft",
    });
    prisma.productVersion.update.mockResolvedValue({
      reviewState: "in_review",
    });

    const response = await service.submitForReview(sellerId, productId, {
      version: "1.0.0",
    });

    expect(response).toEqual({
      productId,
      version: "1.0.0",
      reviewState: "in_review",
    });
    expect(prisma.productVersion.update).toHaveBeenCalledWith({
      where: { productId_version: { productId, version: "1.0.0" } },
      data: { reviewState: "in_review" },
      select: { reviewState: true },
    });
  });

  it("is idempotent when the version is already in_review", async () => {
    prisma.product.findFirst.mockResolvedValue({ id: productId });
    prisma.productVersion.findUnique.mockResolvedValue({
      reviewState: "in_review",
    });

    const response = await service.submitForReview(sellerId, productId, {
      version: "1.0.0",
    });

    expect(response).toEqual({
      productId,
      version: "1.0.0",
      reviewState: "in_review",
    });
    expect(prisma.productVersion.update).not.toHaveBeenCalled();
  });

  it("rejects submitting an approved version — a seller can never self-publish", async () => {
    prisma.product.findFirst.mockResolvedValue({ id: productId });
    prisma.productVersion.findUnique.mockResolvedValue({
      reviewState: "approved",
    });

    await expect(
      service.submitForReview(sellerId, productId, { version: "1.0.0" }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    expect(prisma.productVersion.update).not.toHaveBeenCalled();
  });
});

describe("SellerVersionsService boundaries", () => {
  const prisma = {
    product: { findFirst: vi.fn() },
    productVersion: { create: vi.fn() },
  };
  const sellerProducts = { findOwnedDetail: vi.fn() };
  let service: SellerVersionsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SellerVersionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SellerProductsService, useValue: sellerProducts },
      ],
    }).compile();
    service = moduleRef.get(SellerVersionsService);
  });

  it("hides a non-owned product behind 404 before creating a version", async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.createVersion(sellerId, productId, {
        version: "1.0.0",
        releasedAt: "2026-08-01T00:00:00.000Z",
        translations: [{ locale: "en", notes: "Initial" }],
      }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(prisma.productVersion.create).not.toHaveBeenCalled();
  });

  it("always creates a new version in the draft review state", async () => {
    prisma.product.findFirst.mockResolvedValue({ id: productId });
    sellerProducts.findOwnedDetail.mockResolvedValue({ id: productId });

    await service.createVersion(sellerId, productId, {
      version: "1.0.0",
      releasedAt: "2026-08-01T00:00:00.000Z",
      translations: [{ locale: "en", notes: "Initial" }],
    });

    expect(prisma.productVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewState: "draft" }),
      }),
    );
  });
});
