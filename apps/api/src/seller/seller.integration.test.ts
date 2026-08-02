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
  sellerProductDetailResponseSchema,
  sellerProductListResponseSchema,
  submitForReviewResponseSchema,
} from "@marketplace/shared/seller";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApp } from "../bootstrap/configure-app.js";
import type { Env } from "../config/env.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SESSION_COOKIE_NAME } from "../auth/core/auth-cookie.js";
import { AuthSessionService } from "../auth/core/auth-session.service.js";
import { SellerModule } from "./seller.module.js";

const integrationDatabaseUrl = process.env.SELLER_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

const secret = (byte: number): string =>
  Buffer.alloc(32, byte).toString("base64url");

function testEnvironment(): Env {
  return {
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL:
      integrationDatabaseUrl ?? "postgresql://database.invalid/seller_test",
    CORS_ORIGIN: "https://app.kitvera.test",
    PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
    CATALOGUE_CURSOR_SIGNING_SECRET: secret(1),
    AUTH_MAGIC_LINK_HASH_SECRET: secret(2),
    AUTH_SESSION_HASH_SECRET: secret(3),
    AUTH_CSRF_HASH_SECRET: secret(4),
    AUTH_SOURCE_IP_HASH_SECRET: secret(5),
    DOWNLOAD_TOKEN_HMAC_SECRET: secret(6),
    FACTORY_INGEST_HMAC_SECRET: secret(7),
    LOCAL_ARTIFACT_STORAGE_DIR: "/tmp/kitvera-seller-test-artifacts",
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
    SellerModule,
  ],
})
class SellerIntegrationModule {}

const ids = {
  sellerAOwner: "e1000000-0000-4000-8000-000000000001",
  sellerBOwner: "e1000000-0000-4000-8000-000000000002",
  nonSellerUser: "e1000000-0000-4000-8000-000000000003",
  unprofiledSellerUser: "e1000000-0000-4000-8000-000000000004",
  sellerA: "e2000000-0000-4000-8000-000000000001",
  sellerB: "e2000000-0000-4000-8000-000000000002",
  sellerRole: "e3000000-0000-4000-8000-000000000001",
  // The approved v1 top-level taxonomy ("wordpress") is catalogue data
  // seeded by the `catalogue_read_model` migration itself, not test sample
  // data — fixtures reuse it rather than inserting an unapproved root.
  category: "00000000-0000-4000-8000-000000000001",
  sellerBProduct: "e4000000-0000-4000-8000-000000000001",
};

async function seedSellerFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.user.createMany({
    data: [
      { id: ids.sellerAOwner, normalizedEmail: "seller-a@example.com" },
      { id: ids.sellerBOwner, normalizedEmail: "seller-b@example.com" },
      { id: ids.nonSellerUser, normalizedEmail: "non-seller@example.com" },
      {
        id: ids.unprofiledSellerUser,
        normalizedEmail: "unprofiled-seller@example.com",
      },
    ],
  });
  await prisma.role.create({
    data: { id: ids.sellerRole, key: "seller" },
  });
  await prisma.userRole.createMany({
    data: [
      { userId: ids.sellerAOwner, roleId: ids.sellerRole },
      { userId: ids.sellerBOwner, roleId: ids.sellerRole },
      { userId: ids.unprofiledSellerUser, roleId: ids.sellerRole },
    ],
  });
  await prisma.sellerProfile.createMany({
    data: [
      { id: ids.sellerA, ownerId: ids.sellerAOwner, slug: "seller-a" },
      { id: ids.sellerB, ownerId: ids.sellerBOwner, slug: "seller-b" },
    ],
  });
  await prisma.product.create({
    data: {
      id: ids.sellerBProduct,
      sellerId: ids.sellerB,
      categoryId: ids.category,
      slug: "seller-b-draft-product",
      thumbnailUrl: "https://assets.example.com/seller-b/thumbnail.webp",
      documentationUrl: "https://docs.example.com/seller-b",
      isolatedPreviewUrl: "https://preview.example.com/seller-b",
      versions: {
        create: {
          version: "1.0.0",
          releasedAt: new Date(),
          translations: { create: { locale: "en", notes: "Initial" } },
        },
      },
    },
  });
}

function cookieHeader(rawSessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

describeWithPostgres("Seller PostgreSQL integration", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let sessions: AuthSessionService;

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) {
      throw new Error("SELLER_INTEGRATION_DATABASE_URL is required");
    }
    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();
    await seedSellerFixtures(prisma);

    const moduleRef = await Test.createTestingModule({
      imports: [SellerIntegrationModule],
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

  const draftBody = {
    slug: "aurora-authoring-theme",
    category: "wordpress",
    thumbnailUrl: "https://assets.example.com/aurora/thumbnail.webp",
    documentationUrl: "https://docs.example.com/aurora",
    isolatedPreviewUrl: "https://preview.example.com/aurora",
    tags: ["responsive"],
  };

  it("rejects a session without the seller role", async () => {
    const nonSeller = await issueSession(ids.nonSellerUser);

    const response = await request(app.getHttpServer())
      .get("/v1/seller/products")
      .set("Cookie", nonSeller.cookie)
      .expect(403);
    expect(apiErrorSchema.parse(response.body).error.message).toBeTruthy();
  });

  it("rejects a seller role that has no seller profile (never auto-provisions one)", async () => {
    const unprofiled = await issueSession(ids.unprofiledSellerUser);

    await request(app.getHttpServer())
      .get("/v1/seller/products")
      .set("Cookie", unprofiled.cookie)
      .expect(403);

    const profile = await prisma.sellerProfile.findUnique({
      where: { ownerId: ids.unprofiledSellerUser },
    });
    expect(profile).toBeNull();
  });

  it("creates a draft product owned by the server-resolved seller, ignoring/rejecting smuggled fields", async () => {
    const sellerA = await issueSession(ids.sellerAOwner);

    const rejected = await request(app.getHttpServer())
      .post("/v1/seller/products")
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({
        ...draftBody,
        sellerId: ids.sellerB,
        publicationState: "published",
        isFeatured: true,
      })
      .expect(422);
    expect(apiErrorSchema.parse(rejected.body)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const created = await request(app.getHttpServer())
      .post("/v1/seller/products")
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send(draftBody)
      .expect(201);
    const detail = sellerProductDetailResponseSchema.parse(created.body);
    expect(detail.slug).toBe(draftBody.slug);
    expect(detail.publicationState).toBe("draft");
    expect(detail.tags).toEqual(["responsive"]);

    const row = await prisma.product.findUniqueOrThrow({
      where: { id: detail.id },
    });
    expect(row.sellerId).toBe(ids.sellerA);
    expect(row.publicationState).toBe("draft");
  });

  it("edits an own draft product, attaching translations/media/compatibility/specs/demo pages", async () => {
    const sellerA = await issueSession(ids.sellerAOwner);
    const created = await request(app.getHttpServer())
      .post("/v1/seller/products")
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({ ...draftBody, slug: "aurora-edit-target" })
      .expect(201);
    const productId = sellerProductDetailResponseSchema.parse(created.body).id;

    const rejected = await request(app.getHttpServer())
      .patch(`/v1/seller/products/${productId}`)
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({ publicationState: "published" })
      .expect(422);
    expect(apiErrorSchema.parse(rejected.body)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const edited = await request(app.getHttpServer())
      .patch(`/v1/seller/products/${productId}`)
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({
        translations: [
          {
            locale: "en",
            title: "Aurora",
            summary: "A theme.",
            description: "A full theme description.",
          },
        ],
        media: [
          {
            position: 0,
            kind: "image",
            url: "https://assets.example.com/aurora/screen.webp",
            translations: [{ locale: "en", alt: "Homepage" }],
          },
        ],
        compatibility: [{ target: "wordpress", constraint: "6.x" }],
        specifications: [
          {
            key: "framework",
            translations: [
              { locale: "en", label: "Framework", value: "WordPress" },
            ],
          },
        ],
        demoPages: [
          {
            position: 0,
            slug: "home",
            previewUrl: "https://preview.example.com/aurora/home",
            translations: [{ locale: "en", title: "Home" }],
          },
        ],
        tags: ["responsive", "storefront"],
      })
      .expect(200);
    const detail = sellerProductDetailResponseSchema.parse(edited.body);
    expect(detail.translations).toHaveLength(1);
    expect(detail.media).toHaveLength(1);
    expect(detail.compatibility).toEqual([
      { target: "wordpress", constraint: "6.x" },
    ]);
    expect(detail.specifications).toHaveLength(1);
    expect(detail.demoPages).toHaveLength(1);
    expect(detail.tags.sort()).toEqual(["responsive", "storefront"]);
  });

  it("hides another seller's product behind 404 for read, edit, version, and submit-for-review", async () => {
    const sellerA = await issueSession(ids.sellerAOwner);

    const readResponse = await request(app.getHttpServer())
      .get(`/v1/seller/products/${ids.sellerBProduct}`)
      .set("Cookie", sellerA.cookie)
      .expect(404);
    expect(apiErrorSchema.parse(readResponse.body)).toMatchObject({
      error: { code: "NOT_FOUND" },
    });

    await request(app.getHttpServer())
      .patch(`/v1/seller/products/${ids.sellerBProduct}`)
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({ tags: [] })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/v1/seller/products/${ids.sellerBProduct}/versions`)
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({
        version: "2.0.0",
        releasedAt: new Date().toISOString(),
        translations: [{ locale: "en", notes: "Second release" }],
      })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/v1/seller/products/${ids.sellerBProduct}/submit-for-review`)
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({ version: "1.0.0" })
      .expect(404);

    const list = await request(app.getHttpServer())
      .get("/v1/seller/products")
      .set("Cookie", sellerA.cookie)
      .expect(200);
    const ownList = sellerProductListResponseSchema.parse(list.body);
    expect(ownList.data.some((entry) => entry.id === ids.sellerBProduct)).toBe(
      false,
    );
  });

  it("creates a version defaulting to the draft review state and submits it for review idempotently", async () => {
    const sellerA = await issueSession(ids.sellerAOwner);
    const created = await request(app.getHttpServer())
      .post("/v1/seller/products")
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({ ...draftBody, slug: "aurora-review-target" })
      .expect(201);
    const productId = sellerProductDetailResponseSchema.parse(created.body).id;

    const rejectedVersion = await request(app.getHttpServer())
      .post(`/v1/seller/products/${productId}/versions`)
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({
        version: "1.0.0",
        releasedAt: new Date().toISOString(),
        translations: [{ locale: "en", notes: "Initial" }],
        reviewState: "approved",
      })
      .expect(422);
    expect(apiErrorSchema.parse(rejectedVersion.body)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const versioned = await request(app.getHttpServer())
      .post(`/v1/seller/products/${productId}/versions`)
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({
        version: "1.0.0",
        releasedAt: new Date().toISOString(),
        translations: [{ locale: "en", notes: "Initial" }],
      })
      .expect(201);
    const detail = sellerProductDetailResponseSchema.parse(versioned.body);
    const version = detail.versions.find((entry) => entry.version === "1.0.0");
    expect(version?.reviewState).toBe("draft");

    const submitted = await request(app.getHttpServer())
      .post(`/v1/seller/products/${productId}/submit-for-review`)
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({ version: "1.0.0" })
      .expect(200);
    expect(submitForReviewResponseSchema.parse(submitted.body)).toEqual({
      productId,
      version: "1.0.0",
      reviewState: "in_review",
    });

    const replay = await request(app.getHttpServer())
      .post(`/v1/seller/products/${productId}/submit-for-review`)
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({ version: "1.0.0" })
      .expect(200);
    expect(submitForReviewResponseSchema.parse(replay.body)).toEqual({
      productId,
      version: "1.0.0",
      reviewState: "in_review",
    });

    await prisma.productVersion.update({
      where: { productId_version: { productId, version: "1.0.0" } },
      data: { reviewState: "approved" },
    });

    const blocked = await request(app.getHttpServer())
      .post(`/v1/seller/products/${productId}/submit-for-review`)
      .set("Cookie", sellerA.cookie)
      .set("X-CSRF-Token", sellerA.csrfToken)
      .send({ version: "1.0.0" })
      .expect(422);
    expect(apiErrorSchema.parse(blocked.body).error.code).toBe(
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("cursor-paginates the caller's own products with a bounded limit", async () => {
    const sellerA = await issueSession(ids.sellerAOwner);
    const slugs = ["aurora-page-one", "aurora-page-two", "aurora-page-three"];
    for (const slug of slugs) {
      await request(app.getHttpServer())
        .post("/v1/seller/products")
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({ ...draftBody, slug })
        .expect(201);
    }

    const firstPage = await request(app.getHttpServer())
      .get("/v1/seller/products?limit=2")
      .set("Cookie", sellerA.cookie)
      .expect(200);
    const first = sellerProductListResponseSchema.parse(firstPage.body);
    expect(first.data).toHaveLength(2);
    expect(first.meta.hasMore).toBe(true);
    expect(first.meta.nextCursor).not.toBeNull();

    const secondPage = await request(app.getHttpServer())
      .get(
        `/v1/seller/products?limit=50&cursor=${encodeURIComponent(first.meta.nextCursor ?? "")}`,
      )
      .set("Cookie", sellerA.cookie)
      .expect(200);
    const second = sellerProductListResponseSchema.parse(secondPage.body);
    expect(
      second.data.every((entry) =>
        entry.slug.startsWith("aurora-") ? true : false,
      ),
    ).toBe(true);
    expect(second.data.some((entry) => entry.id === ids.sellerBProduct)).toBe(
      false,
    );
  });
});
