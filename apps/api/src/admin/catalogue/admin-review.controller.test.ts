import { HttpStatus } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { apiErrorSchema } from "@marketplace/shared/api";
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

import { configureApp } from "../../bootstrap/configure-app.js";
import { AuthCryptoService } from "../../auth/core/auth-crypto.service.js";
import {
  AUTH_CLOCK,
  AuthSessionService,
} from "../../auth/core/auth-session.service.js";
import { SESSION_COOKIE_NAME } from "../../auth/core/auth-cookie.js";
import { SessionAuthGuard } from "../../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../../auth/sessions/session-csrf.guard.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AdminAuditService } from "../admin-audit.service.js";
import { AdminMfaEnforcementGuard } from "../admin-mfa-enforcement.guard.js";
import { AdminRolesGuard } from "../admin-roles.guard.js";
import { AdminReviewController } from "./admin-review.controller.js";
import { AdminReviewService } from "./admin-review.service.js";

const rawSessionToken = Buffer.alloc(32, 41).toString("base64url");
const csrfToken = Buffer.alloc(32, 42).toString("base64url");
const sessionId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const productId = "20000000-0000-4000-8000-000000000001";
const version = "1.0.0";
const idleExpiresAt = new Date("2026-08-21T00:00:00.000Z");
const absoluteExpiresAt = new Date("2026-10-20T00:00:00.000Z");
const now = new Date("2026-08-03T00:00:00.000Z");

function cookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

function configWith(overrides: Record<string, unknown>): ConfigService {
  return {
    get: (key: string): unknown => overrides[key],
  } as unknown as ConfigService;
}

describe("AdminReviewController", () => {
  let app: NestFastifyApplication;
  const adminReview = {
    list: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  };
  const sessions = { resolveSession: vi.fn(), verifyCsrf: vi.fn() };
  const crypto = { hashSessionToken: vi.fn(), deriveCsrfToken: vi.fn() };
  const clock = { now: vi.fn() };
  const prisma = {
    session: { findUnique: vi.fn() },
    userRole: { findFirst: vi.fn() },
    adminMfaFactor: { findFirst: vi.fn() },
    adminMfaSession: { findFirst: vi.fn() },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminReviewController],
      providers: [
        SessionAuthGuard,
        SessionCsrfGuard,
        AdminRolesGuard,
        AdminMfaEnforcementGuard,
        { provide: AdminReviewService, useValue: adminReview },
        { provide: AuthSessionService, useValue: sessions },
        { provide: AuthCryptoService, useValue: crypto },
        { provide: AUTH_CLOCK, useValue: clock },
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: configWith({ NODE_ENV: "test", ADMIN_MFA_ENFORCED: false }),
        },
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
      user: { id: userId, normalizedEmail: "admin@example.com" },
    });
    sessions.resolveSession.mockResolvedValue({
      sessionId,
      user: { id: userId, email: "admin@example.com" },
      csrfToken,
      idleExpiresAt,
      absoluteExpiresAt,
      replacementSessionToken: null,
    });
    sessions.verifyCsrf.mockReturnValue(true);
    prisma.userRole.findFirst.mockResolvedValue({ id: "role-assignment" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the shared 401 envelope when the session cookie is absent", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/admin/review")
      .expect(HttpStatus.UNAUTHORIZED);
    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "SESSION_UNAUTHENTICATED" },
    });
    expect(adminReview.list).not.toHaveBeenCalled();
  });

  it("rejects a session without the admin role (403)", async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get("/v1/admin/review")
      .set("Cookie", cookieHeader())
      .expect(HttpStatus.FORBIDDEN);
    expect(adminReview.list).not.toHaveBeenCalled();
  });

  it("delegates the parsed query to the review-queue list for an admin session", async () => {
    adminReview.list.mockResolvedValue({
      data: [],
      meta: { nextCursor: null, hasMore: false },
    });

    await request(app.getHttpServer())
      .get("/v1/admin/review")
      .set("Cookie", cookieHeader())
      .expect(HttpStatus.OK);

    expect(adminReview.list).toHaveBeenCalledWith({ limit: 20 });
  });

  it("returns the shared 422 envelope for an unknown review-queue query field", async () => {
    await request(app.getHttpServer())
      .get("/v1/admin/review?sellerId=some-other-id")
      .set("Cookie", cookieHeader())
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(adminReview.list).not.toHaveBeenCalled();
  });

  it("requires the session-bound CSRF token to approve a version", async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/versions/${version}/approve`)
      .set("Cookie", cookieHeader())
      .send({})
      .expect(HttpStatus.FORBIDDEN);
    expect(adminReview.approve).not.toHaveBeenCalled();
  });

  it("rejects a non-admin session from approving (403)", async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/versions/${version}/approve`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(HttpStatus.FORBIDDEN);
    expect(adminReview.approve).not.toHaveBeenCalled();
  });

  it("rejects an approve body that smuggles reviewState/publicationState", async () => {
    for (const smuggled of [
      { reviewState: "approved" },
      { publicationState: "published" },
      { productId, version },
    ]) {
      await request(app.getHttpServer())
        .post(`/v1/admin/products/${productId}/versions/${version}/approve`)
        .set("Cookie", cookieHeader())
        .set("X-CSRF-Token", csrfToken)
        .send(smuggled)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    }
    expect(adminReview.approve).not.toHaveBeenCalled();
  });

  it("delegates approve to the server-resolved admin id, never a client-supplied one", async () => {
    adminReview.approve.mockResolvedValue({
      productId,
      version,
      reviewState: "approved",
    });

    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/versions/${version}/approve`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(HttpStatus.OK);

    expect(adminReview.approve).toHaveBeenCalledWith(
      productId,
      version,
      userId,
    );
  });

  it("requires the session-bound CSRF token to reject a version", async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/versions/${version}/reject`)
      .set("Cookie", cookieHeader())
      .send({ reason: "Missing changelog entry." })
      .expect(HttpStatus.FORBIDDEN);
    expect(adminReview.reject).not.toHaveBeenCalled();
  });

  it("rejects a reject request missing its reason", async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/versions/${version}/reject`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(adminReview.reject).not.toHaveBeenCalled();
  });

  it("rejects a reject request with an empty/whitespace-only reason", async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/versions/${version}/reject`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ reason: "   " })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(adminReview.reject).not.toHaveBeenCalled();
  });

  it("delegates reject with the parsed reason and server-resolved admin id", async () => {
    adminReview.reject.mockResolvedValue({
      productId,
      version,
      reviewState: "draft",
    });

    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/versions/${version}/reject`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ reason: "Missing changelog entry." })
      .expect(HttpStatus.OK);

    expect(adminReview.reject).toHaveBeenCalledWith(
      productId,
      version,
      userId,
      "Missing changelog entry.",
    );
  });
});

describe("AdminReviewService boundaries", () => {
  const tx = {
    productVersion: { findUnique: vi.fn(), update: vi.fn() },
  };
  const prisma = {
    productVersion: { findMany: vi.fn() },
    $transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };
  const audit = { record: vi.fn() };
  let service: AdminReviewService;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminReviewService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminAuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AdminReviewService);
  });

  it("lists only in_review versions ordered by releasedAt,id — admin sees all, no seller filter", async () => {
    prisma.productVersion.findMany.mockResolvedValue([]);

    await service.list({ limit: 20 });

    expect(prisma.productVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reviewState: "in_review" },
        orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
      }),
    );
  });

  it("rejects a malformed list cursor without querying the database", async () => {
    await expect(
      service.list({ cursor: "not-a-cursor", limit: 20 }),
    ).rejects.toThrow();
    expect(prisma.productVersion.findMany).not.toHaveBeenCalled();
  });

  it("hides a missing version behind 404 and writes no audit row", async () => {
    tx.productVersion.findUnique.mockResolvedValue(null);

    await expect(
      service.approve(productId, version, userId),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(tx.productVersion.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects approving a non-in_review version (422) and writes no audit row", async () => {
    tx.productVersion.findUnique.mockResolvedValue({
      id: "version-row-1",
      reviewState: "approved",
    });

    await expect(
      service.approve(productId, version, userId),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    expect(tx.productVersion.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("approves an in_review version, flips only reviewState, and writes exactly one audit row", async () => {
    tx.productVersion.findUnique.mockResolvedValue({
      id: "version-row-1",
      reviewState: "in_review",
    });
    tx.productVersion.update.mockResolvedValue({ reviewState: "approved" });

    const response = await service.approve(productId, version, userId);

    expect(response).toEqual({ productId, version, reviewState: "approved" });
    expect(tx.productVersion.update).toHaveBeenCalledWith({
      where: { productId_version: { productId, version } },
      data: { reviewState: "approved" },
      select: { reviewState: true },
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actingAdminId: userId,
        action: "reviewApproved",
        targetType: "productVersion",
        targetId: "version-row-1",
      }),
    );
  });

  it("rejects rejecting a non-in_review version (422) and writes no audit row", async () => {
    tx.productVersion.findUnique.mockResolvedValue({
      id: "version-row-1",
      reviewState: "draft",
    });

    await expect(
      service.reject(productId, version, userId, "Missing changelog entry."),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    expect(tx.productVersion.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects an in_review version back to draft, recording the reason, with exactly one audit row", async () => {
    tx.productVersion.findUnique.mockResolvedValue({
      id: "version-row-1",
      reviewState: "in_review",
    });
    tx.productVersion.update.mockResolvedValue({ reviewState: "draft" });

    const response = await service.reject(
      productId,
      version,
      userId,
      "Missing changelog entry.",
    );

    expect(response).toEqual({ productId, version, reviewState: "draft" });
    expect(tx.productVersion.update).toHaveBeenCalledWith({
      where: { productId_version: { productId, version } },
      data: { reviewState: "draft" },
      select: { reviewState: true },
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actingAdminId: userId,
        action: "reviewRejected",
        targetType: "productVersion",
        targetId: "version-row-1",
        afterState: expect.objectContaining({
          reviewState: "draft",
          reason: "Missing changelog entry.",
        }),
      }),
    );
  });
});
