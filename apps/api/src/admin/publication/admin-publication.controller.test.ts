import { ConfigService } from "@nestjs/config";
import { HttpStatus } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
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
import type { Env } from "../../config/env.js";
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
import { AdminPublicationController } from "./admin-publication.controller.js";
import { AdminPublicationService } from "./admin-publication.service.js";

const rawSessionToken = Buffer.alloc(32, 41).toString("base64url");
const csrfToken = Buffer.alloc(32, 42).toString("base64url");
const sessionId = "30000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000002";
const productId = "40000000-0000-4000-8000-000000000001";
const idleExpiresAt = new Date("2026-08-21T00:00:00.000Z");
const absoluteExpiresAt = new Date("2026-10-20T00:00:00.000Z");
const now = new Date("2026-08-03T00:00:00.000Z");

function cookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

describe("AdminPublicationController", () => {
  let app: NestFastifyApplication;
  const adminPublication = { publish: vi.fn(), delist: vi.fn() };
  const sessions = { resolveSession: vi.fn(), verifyCsrf: vi.fn() };
  const crypto = { hashSessionToken: vi.fn(), deriveCsrfToken: vi.fn() };
  const clock = { now: vi.fn() };
  const prisma = {
    session: { findUnique: vi.fn() },
    userRole: { findFirst: vi.fn() },
  };
  const config = {
    get: vi.fn((key: keyof Env) => {
      if (key === "ADMIN_MFA_ENFORCED") return false;
      if (key === "NODE_ENV") return "test";
      return undefined;
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminPublicationController],
      providers: [
        SessionAuthGuard,
        SessionCsrfGuard,
        AdminRolesGuard,
        AdminMfaEnforcementGuard,
        { provide: AdminPublicationService, useValue: adminPublication },
        { provide: AuthSessionService, useValue: sessions },
        { provide: AuthCryptoService, useValue: crypto },
        { provide: AUTH_CLOCK, useValue: clock },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
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
    sessions.verifyCsrf.mockReturnValue(true);
    prisma.userRole.findFirst.mockResolvedValue({ id: "role-assignment" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the shared 401 envelope when the session cookie is absent", async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/publish`)
      .send({ version: "1.0.0" })
      .expect(HttpStatus.UNAUTHORIZED);
    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "SESSION_UNAUTHENTICATED" },
    });
    expect(adminPublication.publish).not.toHaveBeenCalled();
  });

  it("rejects a session without the admin role (403)", async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/publish`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ version: "1.0.0" })
      .expect(HttpStatus.FORBIDDEN);
    expect(adminPublication.publish).not.toHaveBeenCalled();
  });

  it("requires the session-bound CSRF token to publish", async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/publish`)
      .set("Cookie", cookieHeader())
      .send({ version: "1.0.0" })
      .expect(HttpStatus.FORBIDDEN);
    expect(adminPublication.publish).not.toHaveBeenCalled();
  });

  it("rejects a publish body missing the required version field", async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/publish`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(adminPublication.publish).not.toHaveBeenCalled();
  });

  it("rejects a publish body that smuggles an acting-admin field", async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/publish`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ version: "1.0.0", actingAdminId: "smuggled-id" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(adminPublication.publish).not.toHaveBeenCalled();
  });

  it("delegates publish to the server-resolved acting admin id, never a client-supplied one", async () => {
    adminPublication.publish.mockResolvedValue({
      productId,
      version: "1.0.0",
      publicationState: "published",
    });

    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/publish`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ version: "1.0.0" })
      .expect(HttpStatus.OK);

    expect(adminPublication.publish).toHaveBeenCalledWith(userId, productId, {
      version: "1.0.0",
    });
  });

  it("delegates delist to the server-resolved acting admin id with an empty body", async () => {
    adminPublication.delist.mockResolvedValue({
      productId,
      publicationState: "delisted",
    });

    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/delist`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(HttpStatus.OK);

    expect(adminPublication.delist).toHaveBeenCalledWith(userId, productId);
  });

  it("rejects a delist body that smuggles a publicationState field", async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/delist`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ publicationState: "delisted" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(adminPublication.delist).not.toHaveBeenCalled();
  });
});

describe("AdminPublicationService boundaries", () => {
  const tx = {
    product: { update: vi.fn() },
    adminAuditLog: { create: vi.fn() },
  };
  const prisma = {
    product: { findUnique: vi.fn() },
    productVersion: { findUnique: vi.fn() },
    $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const actingAdminId = "50000000-0000-4000-8000-000000000001";
  let service: AdminPublicationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    tx.product.update.mockResolvedValue({ publicationState: "published" });
    tx.adminAuditLog.create.mockResolvedValue({ id: "audit-row-1" });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminPublicationService,
        AdminAuditService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AdminPublicationService);
  });

  function draftProduct() {
    return { id: productId, publicationState: "draft" };
  }

  function eligibleVersion() {
    return {
      reviewState: "approved",
      artifact: {
        checksum: "checksum-value",
        signature: "signature-value",
        buildRuns: [{ qaVerdict: "passed", scanVerdict: "passed" }],
      },
    };
  }

  it("hides a missing product behind 404", async () => {
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(
      service.publish(actingAdminId, productId, { version: "1.0.0" }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(prisma.productVersion.findUnique).not.toHaveBeenCalled();
  });

  it("hides a missing version behind 404", async () => {
    prisma.product.findUnique.mockResolvedValue(draftProduct());
    prisma.productVersion.findUnique.mockResolvedValue(null);

    await expect(
      service.publish(actingAdminId, productId, { version: "9.9.9" }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it("rejects publishing a product that is not in draft state", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: productId,
      publicationState: "published",
    });
    prisma.productVersion.findUnique.mockResolvedValue(eligibleVersion());

    await expect(
      service.publish(actingAdminId, productId, { version: "1.0.0" }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects publishing an unapproved version", async () => {
    prisma.product.findUnique.mockResolvedValue(draftProduct());
    prisma.productVersion.findUnique.mockResolvedValue({
      ...eligibleVersion(),
      reviewState: "in_review",
    });

    await expect(
      service.publish(actingAdminId, productId, { version: "1.0.0" }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects publishing a version with no artifact", async () => {
    prisma.product.findUnique.mockResolvedValue(draftProduct());
    prisma.productVersion.findUnique.mockResolvedValue({
      reviewState: "approved",
      artifact: null,
    });

    await expect(
      service.publish(actingAdminId, productId, { version: "1.0.0" }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects publishing when the artifact checksum is blank", async () => {
    const version = eligibleVersion();
    version.artifact.checksum = "   ";
    prisma.product.findUnique.mockResolvedValue(draftProduct());
    prisma.productVersion.findUnique.mockResolvedValue(version);

    await expect(
      service.publish(actingAdminId, productId, { version: "1.0.0" }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
  });

  it("rejects publishing when the artifact signature is blank", async () => {
    const version = eligibleVersion();
    version.artifact.signature = "";
    prisma.product.findUnique.mockResolvedValue(draftProduct());
    prisma.productVersion.findUnique.mockResolvedValue(version);

    await expect(
      service.publish(actingAdminId, productId, { version: "1.0.0" }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
  });

  it("rejects publishing when no build run passed both QA and scan", async () => {
    const version = eligibleVersion();
    version.artifact.buildRuns = [
      { qaVerdict: "passed", scanVerdict: "failed" },
    ];
    prisma.product.findUnique.mockResolvedValue(draftProduct());
    prisma.productVersion.findUnique.mockResolvedValue(version);

    await expect(
      service.publish(actingAdminId, productId, { version: "1.0.0" }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
  });

  it("flips draft to published, sets publishedAt/currentVersion, and writes one audit row", async () => {
    prisma.product.findUnique.mockResolvedValue(draftProduct());
    prisma.productVersion.findUnique.mockResolvedValue(eligibleVersion());

    const response = await service.publish(actingAdminId, productId, {
      version: "1.0.0",
    });

    expect(response).toEqual({
      productId,
      version: "1.0.0",
      publicationState: "published",
    });
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: productId },
        data: expect.objectContaining({
          publicationState: "published",
          currentVersion: "1.0.0",
          publishedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.adminAuditLog.create).toHaveBeenCalledTimes(1);
    const auditData = tx.adminAuditLog.create.mock.calls[0]?.[0]?.data;
    expect(auditData).toMatchObject({
      actingAdminId,
      action: "productPublished",
      targetType: "product",
      targetId: productId,
    });
    expect(auditData.afterState).toEqual({
      publicationState: "published",
      version: "1.0.0",
      checksum: "checksum-value",
    });
    const serializedAudit = JSON.stringify(auditData.afterState);
    expect(serializedAudit).not.toContain("signature-value");
  });

  it("hides a missing product behind 404 for delist", async () => {
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(
      service.delist(actingAdminId, productId),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it("rejects delisting a product that is not published", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: productId,
      publicationState: "draft",
      currentVersion: null,
      currentVersionEntry: null,
    });

    await expect(
      service.delist(actingAdminId, productId),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("flips published to delisted and writes one audit row", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: productId,
      publicationState: "published",
      currentVersion: "1.0.0",
      currentVersionEntry: { artifact: { checksum: "checksum-value" } },
    });
    tx.product.update.mockResolvedValue({ publicationState: "delisted" });

    const response = await service.delist(actingAdminId, productId);

    expect(response).toEqual({ productId, publicationState: "delisted" });
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: productId },
        data: { publicationState: "delisted" },
      }),
    );
    expect(tx.adminAuditLog.create).toHaveBeenCalledTimes(1);
    const auditData = tx.adminAuditLog.create.mock.calls[0]?.[0]?.data;
    expect(auditData).toMatchObject({
      actingAdminId,
      action: "productDelisted",
      targetType: "product",
      targetId: productId,
    });
    expect(auditData.afterState).toEqual({
      publicationState: "delisted",
      version: "1.0.0",
      checksum: "checksum-value",
    });
  });
});
