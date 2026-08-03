import { randomUUID } from "node:crypto";

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { apiErrorSchema } from "@marketplace/shared/api";
import {
  adminReviewQueueListResponseSchema,
  approveReviewResponseSchema,
  rejectReviewResponseSchema,
} from "@marketplace/shared/admin";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApp } from "../../bootstrap/configure-app.js";
import type { Env } from "../../config/env.js";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { SESSION_COOKIE_NAME } from "../../auth/core/auth-cookie.js";
import { AuthSessionService } from "../../auth/core/auth-session.service.js";
import { AdminCatalogueModule } from "./admin-catalogue.module.js";

const integrationDatabaseUrl =
  process.env.ADMIN_CATALOGUE_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

const secret = (byte: number): string =>
  Buffer.alloc(32, byte).toString("base64url");

function testEnvironment(): Env {
  return {
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL:
      integrationDatabaseUrl ??
      "postgresql://database.invalid/admin_catalogue_test",
    CORS_ORIGIN: "https://app.kitvera.test",
    PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
    CATALOGUE_CURSOR_SIGNING_SECRET: secret(1),
    AUTH_MAGIC_LINK_HASH_SECRET: secret(2),
    AUTH_SESSION_HASH_SECRET: secret(3),
    AUTH_CSRF_HASH_SECRET: secret(4),
    AUTH_SOURCE_IP_HASH_SECRET: secret(5),
    DOWNLOAD_TOKEN_HMAC_SECRET: secret(6),
    FACTORY_INGEST_HMAC_SECRET: secret(7),
    LOCAL_ARTIFACT_STORAGE_DIR: "/tmp/kitvera-admin-catalogue-test-artifacts",
    ADMIN_MFA_SECRET_ENCRYPTION_KEY: secret(8),
    // Default suite runs with enforcement off — the MFA enforcement guard is
    // a pass-through, so no `AdminMfaFactor`/`AdminMfaSession` seeding is
    // needed for these admin-role-focused tests.
    ADMIN_MFA_ENFORCED: false,
  } satisfies Env;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [testEnvironment],
    }),
    PrismaModule,
    AdminCatalogueModule,
  ],
})
class AdminCatalogueIntegrationModule {}

const ids = {
  adminUser: "f1000000-0000-4000-8000-000000000001",
  nonAdminUser: "f1000000-0000-4000-8000-000000000002",
  sellerOwner: "f1000000-0000-4000-8000-000000000003",
  sellerProfile: "f2000000-0000-4000-8000-000000000001",
  // The approved v1 top-level taxonomy ("wordpress") is catalogue data
  // seeded by the `catalogue_read_model` migration itself, not test sample
  // data — fixtures reuse it rather than inserting an unapproved root.
  category: "00000000-0000-4000-8000-000000000001",
};

function cookieHeader(rawSessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

/**
 * The `admin`/`seller` `Role` rows are already seeded idempotently by the
 * `20260803000000_admin_surface` migration — `upsert`, never `create`, or a
 * fresh CI database collides on the unique `key` (the same trap the Layer-8
 * seller integration seed hit on the insert side).
 */
async function seedAdminReviewFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.user.createMany({
    data: [
      { id: ids.adminUser, normalizedEmail: "admin-reviewer@example.com" },
      { id: ids.nonAdminUser, normalizedEmail: "non-admin@example.com" },
      {
        id: ids.sellerOwner,
        normalizedEmail: "review-seller-owner@example.com",
      },
    ],
  });
  const adminRole = await prisma.role.upsert({
    where: { key: "admin" },
    update: {},
    create: { key: "admin" },
    select: { id: true },
  });
  await prisma.userRole.create({
    data: { userId: ids.adminUser, roleId: adminRole.id },
  });
  await prisma.sellerProfile.create({
    data: {
      id: ids.sellerProfile,
      ownerId: ids.sellerOwner,
      slug: "admin-review-seller",
    },
  });
}

async function createProductVersion(
  prisma: PrismaClient,
  reviewState: "draft" | "in_review" | "approved",
): Promise<{ productId: string; version: string; versionRowId: string }> {
  const productId = randomUUID();
  const version = "1.0.0";
  await prisma.product.create({
    data: {
      id: productId,
      sellerId: ids.sellerProfile,
      categoryId: ids.category,
      slug: `admin-review-target-${productId}`,
      thumbnailUrl: "https://assets.example.com/admin-review/thumbnail.webp",
      documentationUrl: "https://docs.example.com/admin-review-target",
      isolatedPreviewUrl: "https://preview.example.com/admin-review-target",
      versions: {
        create: {
          version,
          releasedAt: new Date(),
          reviewState,
          translations: { create: { locale: "en", notes: "Initial release." } },
        },
      },
    },
  });
  const versionRow = await prisma.productVersion.findUniqueOrThrow({
    where: { productId_version: { productId, version } },
    select: { id: true },
  });
  return { productId, version, versionRowId: versionRow.id };
}

describeWithPostgres("Admin catalogue review PostgreSQL integration", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let sessions: AuthSessionService;

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) {
      throw new Error("ADMIN_CATALOGUE_INTEGRATION_DATABASE_URL is required");
    }
    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();
    await seedAdminReviewFixtures(prisma);

    const moduleRef = await Test.createTestingModule({
      imports: [AdminCatalogueIntegrationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    sessions = app.get(AuthSessionService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function issueSession(userId: string) {
    const issued = await sessions.createSession(userId);
    return {
      cookie: cookieHeader(issued.sessionToken),
      csrfToken: issued.csrfToken,
    };
  }

  it("rejects a non-admin session from reading the review queue (403)", async () => {
    const nonAdmin = await issueSession(ids.nonAdminUser);

    const response = await request(app.getHttpServer())
      .get("/v1/admin/review")
      .set("Cookie", nonAdmin.cookie)
      .expect(403);
    expect(apiErrorSchema.parse(response.body).error.message).toBeTruthy();
  });

  it("lists an in_review version on the review queue with no PublicationState/buyer field", async () => {
    const admin = await issueSession(ids.adminUser);
    const { productId, version } = await createProductVersion(
      prisma,
      "in_review",
    );

    const response = await request(app.getHttpServer())
      .get("/v1/admin/review")
      .set("Cookie", admin.cookie)
      .expect(200);
    const page = adminReviewQueueListResponseSchema.parse(response.body);
    const entry = page.data.find(
      (item) => item.productId === productId && item.version === version,
    );
    expect(entry).toBeDefined();
    expect(entry?.reviewState).toBe("in_review");
    expect(entry?.latestBuildRun).toBeNull();
  });

  it("approves an in_review version, leaves PublicationState untouched, and writes exactly one audit row", async () => {
    const admin = await issueSession(ids.adminUser);
    const { productId, version, versionRowId } = await createProductVersion(
      prisma,
      "in_review",
    );

    const response = await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/versions/${version}/approve`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({})
      .expect(200);
    expect(approveReviewResponseSchema.parse(response.body)).toEqual({
      productId,
      version,
      reviewState: "approved",
    });

    const versionRow = await prisma.productVersion.findUniqueOrThrow({
      where: { productId_version: { productId, version } },
      select: { reviewState: true },
    });
    expect(versionRow.reviewState).toBe("approved");

    const productRow = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { publicationState: true },
    });
    expect(productRow.publicationState).toBe("draft");

    const auditRows = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "productVersion",
        targetId: versionRowId,
        action: "reviewApproved",
      },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.actingAdminId).toBe(ids.adminUser);
  });

  it("rejects approving a non-in_review version (422) and writes no audit row", async () => {
    const admin = await issueSession(ids.adminUser);
    const { productId, version, versionRowId } = await createProductVersion(
      prisma,
      "approved",
    );

    const response = await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/versions/${version}/approve`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({})
      .expect(422);
    expect(apiErrorSchema.parse(response.body).error.code).toBe(
      "UNPROCESSABLE_ENTITY",
    );

    const auditRows = await prisma.adminAuditLog.findMany({
      where: { targetType: "productVersion", targetId: versionRowId },
    });
    expect(auditRows).toHaveLength(0);
  });

  it("requires a reason to reject, and rejecting an in_review version moves it back to draft with exactly one audit row", async () => {
    const admin = await issueSession(ids.adminUser);
    const { productId, version, versionRowId } = await createProductVersion(
      prisma,
      "in_review",
    );

    const missingReason = await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/versions/${version}/reject`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({})
      .expect(422);
    expect(apiErrorSchema.parse(missingReason.body)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const response = await request(app.getHttpServer())
      .post(`/v1/admin/products/${productId}/versions/${version}/reject`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ reason: "Missing changelog entry for this version." })
      .expect(200);
    expect(rejectReviewResponseSchema.parse(response.body)).toEqual({
      productId,
      version,
      reviewState: "draft",
    });

    const versionRow = await prisma.productVersion.findUniqueOrThrow({
      where: { productId_version: { productId, version } },
      select: { reviewState: true },
    });
    expect(versionRow.reviewState).toBe("draft");

    const productRow = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { publicationState: true },
    });
    expect(productRow.publicationState).toBe("draft");

    const auditRows = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "productVersion",
        targetId: versionRowId,
        action: "reviewRejected",
      },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.afterState).toMatchObject({
      reason: "Missing changelog entry for this version.",
    });
  });
});
