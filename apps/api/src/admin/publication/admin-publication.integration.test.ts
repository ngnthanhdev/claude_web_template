import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import {
  delistProductResponseSchema,
  publishProductResponseSchema,
} from "@marketplace/shared/admin";
import { apiErrorSchema } from "@marketplace/shared/api";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApp } from "../../bootstrap/configure-app.js";
import type { Env } from "../../config/env.js";
import { SESSION_COOKIE_NAME } from "../../auth/core/auth-cookie.js";
import { AuthSessionService } from "../../auth/core/auth-session.service.js";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AdminPublicationModule } from "./admin-publication.module.js";

const integrationDatabaseUrl =
  process.env.ADMIN_PUBLICATION_INTEGRATION_DATABASE_URL;
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
      "postgresql://database.invalid/admin_publication_test",
    CORS_ORIGIN: "https://app.kitvera.test",
    PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
    CATALOGUE_CURSOR_SIGNING_SECRET: secret(1),
    AUTH_MAGIC_LINK_HASH_SECRET: secret(2),
    AUTH_SESSION_HASH_SECRET: secret(3),
    AUTH_CSRF_HASH_SECRET: secret(4),
    AUTH_SOURCE_IP_HASH_SECRET: secret(5),
    DOWNLOAD_TOKEN_HMAC_SECRET: secret(6),
    FACTORY_INGEST_HMAC_SECRET: secret(7),
    LOCAL_ARTIFACT_STORAGE_DIR: "/tmp/kitvera-admin-publication-test-artifacts",
    ADMIN_MFA_SECRET_ENCRYPTION_KEY: secret(8),
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
    AdminPublicationModule,
  ],
})
class AdminPublicationIntegrationModule {}

const ids = {
  adminUser: "60000000-0000-4000-8000-000000000001",
  sellerOwner: "60000000-0000-4000-8000-000000000002",
  seller: "60000000-0000-4000-8000-000000000003",
  product: "60000000-0000-4000-8000-000000000004",
  goodVersion: "60000000-0000-4000-8000-000000000005",
  badVersion: "60000000-0000-4000-8000-000000000006",
  nonAdminUser: "60000000-0000-4000-8000-000000000007",
  // The approved v1 top-level taxonomy ("wordpress") is catalogue data
  // seeded by the `catalogue_read_model` migration itself, not test sample
  // data — fixtures reuse it rather than inserting an unapproved root.
  category: "00000000-0000-4000-8000-000000000001",
};

const adminRoleId = "60000000-0000-4000-8000-000000000010";

/**
 * Seeds one draft `Product` with two `approved` `ProductVersion`s: `1.0.0`
 * carries a verified `Artifact` (non-blank checksum/signature) and a
 * `BuildRun` that passed both QA and scan, `2.0.0` carries neither — the
 * "eligible" vs. "ineligible to publish" pair the integration flow exercises
 * (design §5).
 */
async function seedPublicationFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.user.createMany({
    data: [
      {
        id: ids.adminUser,
        normalizedEmail: "admin-publication@example.com",
      },
      {
        id: ids.sellerOwner,
        normalizedEmail: "seller-owner-publication@example.com",
      },
      {
        id: ids.nonAdminUser,
        normalizedEmail: "non-admin-publication@example.com",
      },
    ],
  });
  // Upsert (not create): the `admin` role is now idempotently seeded by the
  // admin-surface migration, so a fresh CI database already has it.
  const adminRole = await prisma.role.upsert({
    where: { key: "admin" },
    update: {},
    create: { id: adminRoleId, key: "admin" },
    select: { id: true },
  });
  await prisma.userRole.create({
    data: { userId: ids.adminUser, roleId: adminRole.id },
  });
  await prisma.sellerProfile.create({
    data: {
      id: ids.seller,
      ownerId: ids.sellerOwner,
      slug: "publication-seller",
    },
  });
  // `assert_product_publication_ready` (the catalogue's DB-enforced
  // publish-readiness trigger, design-inherited from Layer 2) requires
  // bilingual product/version/specification/media/demo-page content plus
  // both licence tiers before a product may leave `draft` — every version
  // of the product, not only the one becoming current. Mirrors
  // `test/commerce-flow.integration.test.ts`'s `seedPurchasableProduct`.
  await prisma.$transaction(async (tx) => {
    await tx.product.create({
      data: {
        id: ids.product,
        sellerId: ids.seller,
        categoryId: ids.category,
        slug: "publication-target-product",
        thumbnailUrl: "https://assets.example.com/publication/thumbnail.webp",
        documentationUrl: "https://docs.example.com/publication",
        isolatedPreviewUrl: "https://preview.example.com/publication",
        translations: {
          create: [
            {
              locale: "en",
              title: "Publication Target",
              summary: "Summary",
              description: "Description",
            },
            {
              locale: "vi",
              title: "Publication Target",
              summary: "Tóm tắt",
              description: "Mô tả",
            },
          ],
        },
      },
    });
    await tx.productVersion.create({
      data: {
        id: ids.goodVersion,
        productId: ids.product,
        version: "1.0.0",
        releasedAt: new Date("2026-08-01T00:00:00.000Z"),
        reviewState: "approved",
        translations: {
          create: [
            { locale: "en", notes: "Ready to publish." },
            { locale: "vi", notes: "Sẵn sàng phát hành." },
          ],
        },
      },
    });
    await tx.productVersion.create({
      data: {
        id: ids.badVersion,
        productId: ids.product,
        version: "2.0.0",
        releasedAt: new Date("2026-08-02T00:00:00.000Z"),
        reviewState: "approved",
        translations: {
          create: [
            { locale: "en", notes: "Missing artifact." },
            { locale: "vi", notes: "Thiếu tệp." },
          ],
        },
      },
    });
    await tx.productCompatibility.create({
      data: { productId: ids.product, target: "wordpress", constraint: "6.x" },
    });
    await tx.productSpecification.create({
      data: {
        productId: ids.product,
        key: "framework",
        translations: {
          create: [
            { locale: "en", label: "Framework", value: "wordpress" },
            { locale: "vi", label: "Nền tảng", value: "wordpress" },
          ],
        },
      },
    });
    await tx.productMedia.create({
      data: {
        productId: ids.product,
        position: 0,
        kind: "image",
        url: "https://assets.example.com/publication/screen.webp",
        translations: {
          create: [
            { locale: "en", alt: "Screenshot" },
            { locale: "vi", alt: "Ảnh chụp" },
          ],
        },
      },
    });
    await tx.productDemoPage.create({
      data: {
        productId: ids.product,
        position: 0,
        slug: "home",
        previewUrl: "https://preview.example.com/publication/home",
        translations: {
          create: [
            { locale: "en", title: "Home" },
            { locale: "vi", title: "Trang chủ" },
          ],
        },
      },
    });
    await tx.licenceOption.create({
      data: {
        productId: ids.product,
        identifier: "Regular",
        prices: {
          create: [
            { currency: "VND", amount: 500_000 },
            { currency: "USD", amount: 20 },
          ],
        },
      },
    });
    await tx.licenceOption.create({
      data: {
        productId: ids.product,
        identifier: "Extended",
        prices: {
          create: [
            { currency: "VND", amount: 900_000 },
            { currency: "USD", amount: 36 },
          ],
        },
      },
    });
    const artifact = await tx.artifact.create({
      data: {
        productVersionId: ids.goodVersion,
        storageId: "local://publication/1.0.0.zip",
        checksum: "a".repeat(64),
        signature: "b".repeat(64),
        sizeBytes: 1_048_576n,
        producedAt: new Date("2026-08-01T00:00:00.000Z"),
        factoryRunId: "run-publication-good",
      },
    });
    await tx.buildRun.create({
      data: {
        productVersionId: ids.goodVersion,
        artifactId: artifact.id,
        status: "succeeded",
        startedAt: new Date("2026-08-01T00:00:00.000Z"),
        finishedAt: new Date("2026-08-01T00:05:00.000Z"),
        factoryRunId: "run-publication-good",
        qaVerdict: "passed",
        scanVerdict: "passed",
      },
    });
  });
}

function cookieHeader(rawSessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

describeWithPostgres("Admin publication PostgreSQL integration", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let sessions: AuthSessionService;

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) {
      throw new Error("ADMIN_PUBLICATION_INTEGRATION_DATABASE_URL is required");
    }
    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();
    await seedPublicationFixtures(prisma);

    const moduleRef = await Test.createTestingModule({
      imports: [AdminPublicationIntegrationModule],
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

  function issueAdminSession() {
    return issueSession(ids.adminUser);
  }

  it("rejects publishing a version with no verified artifact, then publishes an approved+verified version, then delists it", async () => {
    const admin = await issueAdminSession();

    const rejected = await request(app.getHttpServer())
      .post(`/v1/admin/products/${ids.product}/publish`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ version: "2.0.0" })
      .expect(422);
    expect(apiErrorSchema.parse(rejected.body).error.code).toBe(
      "UNPROCESSABLE_ENTITY",
    );
    const untouched = await prisma.product.findUniqueOrThrow({
      where: { id: ids.product },
    });
    expect(untouched.publicationState).toBe("draft");
    expect(untouched.currentVersion).toBeNull();

    const published = await request(app.getHttpServer())
      .post(`/v1/admin/products/${ids.product}/publish`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ version: "1.0.0" })
      .expect(200);
    expect(publishProductResponseSchema.parse(published.body)).toEqual({
      productId: ids.product,
      version: "1.0.0",
      publicationState: "published",
    });

    const publishedRow = await prisma.product.findUniqueOrThrow({
      where: { id: ids.product },
    });
    expect(publishedRow.publicationState).toBe("published");
    expect(publishedRow.currentVersion).toBe("1.0.0");
    expect(publishedRow.publishedAt).not.toBeNull();

    const publishAuditRows = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "product",
        targetId: ids.product,
        action: "productPublished",
      },
    });
    expect(publishAuditRows).toHaveLength(1);
    expect(publishAuditRows[0]?.actingAdminId).toBe(ids.adminUser);
    expect(publishAuditRows[0]?.afterState).toMatchObject({
      publicationState: "published",
      version: "1.0.0",
      checksum: "a".repeat(64),
    });
    const serializedPublishAudit = JSON.stringify(
      publishAuditRows[0]?.afterState,
    );
    expect(serializedPublishAudit).not.toContain("b".repeat(64));

    const delisted = await request(app.getHttpServer())
      .post(`/v1/admin/products/${ids.product}/delist`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({})
      .expect(200);
    expect(delistProductResponseSchema.parse(delisted.body)).toEqual({
      productId: ids.product,
      publicationState: "delisted",
    });

    const delistedRow = await prisma.product.findUniqueOrThrow({
      where: { id: ids.product },
    });
    expect(delistedRow.publicationState).toBe("delisted");

    const delistAuditRows = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "product",
        targetId: ids.product,
        action: "productDelisted",
      },
    });
    expect(delistAuditRows).toHaveLength(1);
    expect(delistAuditRows[0]?.actingAdminId).toBe(ids.adminUser);
  });

  it("rejects a session without the admin role, leaving the product state untouched", async () => {
    const nonAdmin = await issueSession(ids.nonAdminUser);
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: ids.product },
    });

    const response = await request(app.getHttpServer())
      .post(`/v1/admin/products/${ids.product}/publish`)
      .set("Cookie", nonAdmin.cookie)
      .set("X-CSRF-Token", nonAdmin.csrfToken)
      .send({ version: "1.0.0" })
      .expect(403);
    expect(apiErrorSchema.parse(response.body).error.message).toBeTruthy();

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: ids.product },
    });
    expect(after.publicationState).toBe(before.publicationState);
  });
});
