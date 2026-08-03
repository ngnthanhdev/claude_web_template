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
  checkoutResponseSchema,
  orderCollectionResponseSchema,
  orderSchema,
} from "@marketplace/shared/commerce";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { configureApp } from "../bootstrap/configure-app.js";
import type { Env } from "../config/env.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SESSION_COOKIE_NAME } from "../auth/core/auth-cookie.js";
import { AuthSessionService } from "../auth/core/auth-session.service.js";
import { CommerceModule } from "./commerce.module.js";

const integrationDatabaseUrl = process.env.COMMERCE_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

const secret = (byte: number): string =>
  Buffer.alloc(32, byte).toString("base64url");

function testEnvironment(nodeEnv: Env["NODE_ENV"]): Env {
  return {
    NODE_ENV: nodeEnv,
    PORT: 3000,
    DATABASE_URL:
      integrationDatabaseUrl ?? "postgresql://database.invalid/commerce_test",
    CORS_ORIGIN: "https://app.kitvera.test",
    PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
    CATALOGUE_CURSOR_SIGNING_SECRET: secret(1),
    AUTH_MAGIC_LINK_HASH_SECRET: secret(2),
    AUTH_SESSION_HASH_SECRET: secret(3),
    AUTH_CSRF_HASH_SECRET: secret(4),
    AUTH_SOURCE_IP_HASH_SECRET: secret(5),
    DOWNLOAD_TOKEN_HMAC_SECRET: secret(6),
    FACTORY_INGEST_HMAC_SECRET: secret(7),
    LOCAL_ARTIFACT_STORAGE_DIR: "/tmp/kitvera-commerce-test-artifacts",
    ADMIN_MFA_SECRET_ENCRYPTION_KEY: secret(8),
  } satisfies Env;
}

function makeIntegrationModule(nodeEnv: Env["NODE_ENV"]) {
  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => testEnvironment(nodeEnv)],
      }),
      PrismaModule,
      CommerceModule,
    ],
  })
  class CommerceIntegrationModule {}
  return CommerceIntegrationModule;
}

const ids = {
  sellerOwner: "e0000000-0000-4000-8000-000000000001",
  seller: "e0000000-0000-4000-8000-000000000002",
  // The approved v1 top-level taxonomy ("wordpress") is catalogue data
  // seeded by the `catalogue_read_model` migration itself, not test sample
  // data — commerce fixtures reuse it rather than inserting an
  // unapproved root (the DB enforces the approved-root check constraint).
  category: "00000000-0000-4000-8000-000000000001",
  buyer: "e0000000-0000-4000-8000-000000000004",
  otherBuyer: "e0000000-0000-4000-8000-000000000005",
  productBoth: "e0000000-0000-4000-8000-000000000006",
  productThird: "e0000000-0000-4000-8000-000000000007",
  productDraft: "e0000000-0000-4000-8000-000000000008",
  productDelisted: "e0000000-0000-4000-8000-000000000009",
  productSecond: "e0000000-0000-4000-8000-00000000000a",
} as const;

const prices = {
  productBothRegular: 500_000,
  productBothExtended: 900_000,
  productSecond: 200_000,
  productThird: 350_000,
} as const;

interface PublishedProductFixture {
  id: string;
  slug: string;
  regularVnd: number;
  extendedVnd: number;
  title: string;
  delist?: boolean;
}

/**
 * The catalogue's own `assert_product_publication_ready` deferred constraint
 * trigger (design-inherited from Layer 2) requires a *complete* public card
 * and detail record before a product may leave `draft`: bilingual product
 * translations, a bilingual version changelog entry, at least one
 * compatibility row, one localized specification, one localized media item,
 * one localized demo page, and both Regular/Extended licences each priced in
 * VND and USD. Commerce fixtures must satisfy the same completeness the
 * catalogue enforces — there is no way to construct a published product that
 * skips any of this.
 */
async function seedPublishedProduct(
  prisma: PrismaClient,
  fixture: PublishedProductFixture,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.product.create({
      data: {
        id: fixture.id,
        sellerId: ids.seller,
        categoryId: ids.category,
        slug: fixture.slug,
        thumbnailUrl: `https://assets.example.com/${fixture.slug}/thumbnail.webp`,
        documentationUrl: `https://docs.example.com/${fixture.slug}`,
        isolatedPreviewUrl: `https://preview.example.com/${fixture.slug}`,
        translations: {
          create: [
            {
              locale: "en",
              title: fixture.title,
              summary: `${fixture.title} summary`,
              description: `${fixture.title} description`,
            },
            {
              locale: "vi",
              title: fixture.title,
              summary: `Tóm tắt ${fixture.title}`,
              description: `Mô tả ${fixture.title}`,
            },
          ],
        },
      },
    });
    await tx.productVersion.create({
      data: {
        productId: fixture.id,
        version: "1.0.0",
        releasedAt: new Date(),
        translations: {
          create: [
            { locale: "en", notes: "Initial release" },
            { locale: "vi", notes: "Phát hành đầu tiên" },
          ],
        },
      },
    });
    await tx.productCompatibility.create({
      data: { productId: fixture.id, target: "wordpress", constraint: "6.x" },
    });
    await tx.productSpecification.create({
      data: {
        productId: fixture.id,
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
        productId: fixture.id,
        position: 0,
        kind: "image",
        url: `https://assets.example.com/${fixture.slug}/screen.webp`,
        translations: {
          create: [
            { locale: "en", alt: `${fixture.title} screenshot` },
            { locale: "vi", alt: `Ảnh ${fixture.title}` },
          ],
        },
      },
    });
    await tx.productDemoPage.create({
      data: {
        productId: fixture.id,
        position: 0,
        slug: "home",
        previewUrl: `https://preview.example.com/${fixture.slug}/home`,
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
        productId: fixture.id,
        identifier: "Regular",
        prices: {
          create: [
            { currency: "VND", amount: fixture.regularVnd },
            {
              currency: "USD",
              amount: Math.round(fixture.regularVnd / 25_000),
            },
          ],
        },
      },
    });
    await tx.licenceOption.create({
      data: {
        productId: fixture.id,
        identifier: "Extended",
        prices: {
          create: [
            { currency: "VND", amount: fixture.extendedVnd },
            {
              currency: "USD",
              amount: Math.round(fixture.extendedVnd / 25_000),
            },
          ],
        },
      },
    });
    await tx.product.update({
      where: { id: fixture.id },
      data: {
        currentVersion: "1.0.0",
        publicationState: "published",
        publishedAt: new Date(),
      },
    });
    if (fixture.delist === true) {
      await tx.product.update({
        where: { id: fixture.id },
        data: { publicationState: "delisted" },
      });
    }
  });
}

async function seedCommerceFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.user.createMany({
    data: [
      { id: ids.sellerOwner, normalizedEmail: "commerce-seller@example.com" },
      { id: ids.buyer, normalizedEmail: "commerce-buyer@example.com" },
      {
        id: ids.otherBuyer,
        normalizedEmail: "commerce-other-buyer@example.com",
      },
    ],
  });
  await prisma.sellerProfile.create({
    data: {
      id: ids.seller,
      ownerId: ids.sellerOwner,
      slug: "kitvera-commerce",
    },
  });

  await seedPublishedProduct(prisma, {
    id: ids.productBoth,
    slug: "aurora-commerce",
    regularVnd: prices.productBothRegular,
    extendedVnd: prices.productBothExtended,
    title: "Aurora Landing Template",
  });
  await seedPublishedProduct(prisma, {
    id: ids.productSecond,
    slug: "borealis-commerce",
    regularVnd: prices.productSecond,
    extendedVnd: prices.productSecond * 2,
    title: "Borealis Kit",
  });
  await seedPublishedProduct(prisma, {
    id: ids.productThird,
    slug: "cobalt-commerce",
    regularVnd: prices.productThird,
    extendedVnd: prices.productThird * 2,
    title: "Cobalt Portfolio Template",
  });
  await seedPublishedProduct(prisma, {
    id: ids.productDelisted,
    slug: "retired-commerce",
    regularVnd: 100_000,
    extendedVnd: 200_000,
    title: "Retired Template",
    delist: true,
  });
  await prisma.product.create({
    data: {
      id: ids.productDraft,
      sellerId: ids.seller,
      categoryId: ids.category,
      slug: "draft-commerce",
      thumbnailUrl: "https://assets.example.com/draft-commerce/thumbnail.webp",
      documentationUrl: "https://docs.example.com/draft-commerce",
      isolatedPreviewUrl: "https://preview.example.com/draft-commerce",
    },
  });
}

async function resetBuyerState(prisma: PrismaClient): Promise<void> {
  const buyerIds = [ids.buyer, ids.otherBuyer];
  await prisma.downloadEvent.deleteMany({
    where: { userId: { in: buyerIds } },
  });
  await prisma.entitlement.deleteMany({ where: { userId: { in: buyerIds } } });
  await prisma.paymentAttempt.deleteMany({
    where: { order: { userId: { in: buyerIds } } },
  });
  await prisma.orderItemSnapshot.deleteMany({
    where: { order: { userId: { in: buyerIds } } },
  });
  await prisma.order.deleteMany({ where: { userId: { in: buyerIds } } });
  await prisma.authSecurityEvent.deleteMany({
    where: { userId: { in: buyerIds } },
  });
  await prisma.session.deleteMany({ where: { userId: { in: buyerIds } } });
}

function cookieHeader(rawSessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

describeWithPostgres("Commerce PostgreSQL integration", () => {
  let app: NestFastifyApplication;
  let prodApp: NestFastifyApplication;
  let prisma: PrismaClient;
  let sessions: AuthSessionService;

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) {
      throw new Error("COMMERCE_INTEGRATION_DATABASE_URL is required");
    }
    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();
    await seedCommerceFixtures(prisma);

    const testModuleRef = await Test.createTestingModule({
      imports: [makeIntegrationModule("test")],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = testModuleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    sessions = app.get(AuthSessionService);

    const productionModuleRef = await Test.createTestingModule({
      imports: [makeIntegrationModule("production")],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    prodApp = productionModuleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApp(prodApp);
    await prodApp.init();
    await prodApp.getHttpAdapter().getInstance().ready();
  }, 30_000);

  beforeEach(async () => {
    await resetBuyerState(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prodApp.close();
    await prisma.$disconnect();
  });

  async function issueSession(userId: string) {
    const issued = await sessions.createSession(userId);
    return {
      cookie: cookieHeader(issued.sessionToken),
      csrfToken: issued.csrfToken,
    };
  }

  it("computes the order total from the live catalogue price and grants no entitlement before settle", async () => {
    const buyer = await issueSession(ids.buyer);

    const response = await request(app.getHttpServer())
      .post("/v1/checkout")
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .send({
        items: [{ productId: ids.productBoth, licence: "Regular" }],
        idempotencyKey: "10000000-0000-4000-8000-000000000001",
      })
      .expect(201);

    const body = checkoutResponseSchema.parse(response.body);
    expect(body.status).toBe("pending");

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: body.orderId },
      include: { items: true, paymentAttempts: true },
    });
    expect(order.userId).toBe(ids.buyer);
    expect(order.currency).toBe("VND");
    expect(order.subtotalMinor).toBe(prices.productBothRegular);
    expect(order.discountMinor).toBe(0);
    expect(order.totalMinor).toBe(prices.productBothRegular);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.unitPriceMinor).toBe(prices.productBothRegular);
    expect(order.paymentAttempts).toHaveLength(1);
    expect(order.paymentAttempts[0]?.status).toBe("pending");
    expect(order.paymentAttempts[0]?.id).toBe(body.paymentAttemptId);

    const entitlementCount = await prisma.entitlement.count({
      where: { userId: ids.buyer },
    });
    expect(entitlementCount).toBe(0);
  });

  it.each([
    ["an unknown product id", "10000000-0000-4000-8000-00000000ffff"],
    ["a draft product", ids.productDraft],
    ["a delisted product", ids.productDelisted],
  ])(
    "rejects checkout of %s with the shared 404 envelope",
    async (_label, productId) => {
      const buyer = await issueSession(ids.buyer);

      const response = await request(app.getHttpServer())
        .post("/v1/checkout")
        .set("Cookie", buyer.cookie)
        .set("X-CSRF-Token", buyer.csrfToken)
        .send({
          items: [{ productId, licence: "Regular" }],
          idempotencyKey: "10000000-0000-4000-8000-000000000002",
        })
        .expect(404);
      expect(apiErrorSchema.parse(response.body)).toMatchObject({
        error: { code: "NOT_FOUND" },
      });
    },
  );

  // The "unavailable licence" 422 path is exercised at the unit level
  // (`commerce.controller.test.ts`) rather than here: the catalogue's own
  // `assert_product_publication_ready` constraint trigger requires every
  // published product to carry both Regular and Extended licences with
  // VND/USD prices, so a real database can never hold a published product
  // missing a licence for checkout to reject.

  it("keeps a purchased order's item snapshot immutable after a later catalogue price change", async () => {
    const buyer = await issueSession(ids.buyer);

    const checkoutResponse = await request(app.getHttpServer())
      .post("/v1/checkout")
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .send({
        items: [{ productId: ids.productBoth, licence: "Regular" }],
        idempotencyKey: "10000000-0000-4000-8000-000000000004",
      })
      .expect(201);
    const { orderId } = checkoutResponseSchema.parse(checkoutResponse.body);

    await prisma.price.updateMany({
      where: {
        currency: "VND",
        licenceOption: { productId: ids.productBoth, identifier: "Regular" },
      },
      data: { amount: 999_999 },
    });

    const orderResponse = await request(app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set("Cookie", buyer.cookie)
      .expect(200);
    const order = orderSchema.parse(orderResponse.body);
    expect(order.total.amount).toBe(prices.productBothRegular);
    expect(order.items[0]?.unitPrice.amount).toBe(prices.productBothRegular);
  });

  it("replays the caller's original order on a repeated idempotency key instead of creating a duplicate", async () => {
    const buyer = await issueSession(ids.buyer);
    const body = {
      items: [{ productId: ids.productBoth, licence: "Regular" as const }],
      idempotencyKey: "10000000-0000-4000-8000-000000000005",
    };

    const first = await request(app.getHttpServer())
      .post("/v1/checkout")
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .send(body)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post("/v1/checkout")
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .send(body)
      .expect(201);

    expect(checkoutResponseSchema.parse(second.body)).toEqual(
      checkoutResponseSchema.parse(first.body),
    );
    const orderCount = await prisma.order.count({
      where: { idempotencyKey: body.idempotencyKey },
    });
    expect(orderCount).toBe(1);
  });

  it("hides another buyer's order behind 404 and never lists it", async () => {
    const buyer = await issueSession(ids.buyer);
    const otherBuyer = await issueSession(ids.otherBuyer);

    const checkoutResponse = await request(app.getHttpServer())
      .post("/v1/checkout")
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .send({
        items: [{ productId: ids.productBoth, licence: "Regular" }],
        idempotencyKey: "10000000-0000-4000-8000-000000000006",
      })
      .expect(201);
    const { orderId } = checkoutResponseSchema.parse(checkoutResponse.body);

    const forbiddenRead = await request(app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set("Cookie", otherBuyer.cookie)
      .expect(404);
    expect(apiErrorSchema.parse(forbiddenRead.body)).toMatchObject({
      error: { code: "NOT_FOUND" },
    });

    const otherList = await request(app.getHttpServer())
      .get("/v1/orders")
      .set("Cookie", otherBuyer.cookie)
      .expect(200);
    expect(orderCollectionResponseSchema.parse(otherList.body).data).toEqual(
      [],
    );
  });

  it("settles a pending payment attempt atomically, granting exactly one entitlement per item", async () => {
    const buyer = await issueSession(ids.buyer);

    const checkoutResponse = await request(app.getHttpServer())
      .post("/v1/checkout")
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .send({
        items: [
          { productId: ids.productBoth, licence: "Regular" },
          { productId: ids.productSecond, licence: "Regular" },
        ],
        idempotencyKey: "10000000-0000-4000-8000-000000000007",
      })
      .expect(201);
    const checkout = checkoutResponseSchema.parse(checkoutResponse.body);

    const settleResponse = await request(app.getHttpServer())
      .post(`/v1/payment-attempts/${checkout.paymentAttemptId}/settle`)
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .expect(200);
    const settledOrder = orderSchema.parse(settleResponse.body);
    expect(settledOrder.id).toBe(checkout.orderId);
    expect(settledOrder.status).toBe("settled");

    const paymentAttempt = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: checkout.paymentAttemptId },
    });
    expect(paymentAttempt.status).toBe("settled");
    expect(paymentAttempt.settledAt).not.toBeNull();

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: checkout.orderId },
    });
    expect(order.status).toBe("settled");
    expect(order.settledAt).not.toBeNull();

    const entitlements = await prisma.entitlement.findMany({
      where: { userId: ids.buyer },
      orderBy: { productId: "asc" },
    });
    expect(entitlements).toHaveLength(2);
    expect(
      entitlements.map((entitlement) => entitlement.productId).sort(),
    ).toEqual([ids.productBoth, ids.productSecond].sort());
    expect(
      entitlements.every((entitlement) => entitlement.orderId === order.id),
    ).toBe(true);
  });

  it("hides a non-owned payment attempt behind 404 and settles nothing", async () => {
    const buyer = await issueSession(ids.buyer);
    const otherBuyer = await issueSession(ids.otherBuyer);

    const checkoutResponse = await request(app.getHttpServer())
      .post("/v1/checkout")
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .send({
        items: [{ productId: ids.productBoth, licence: "Regular" }],
        idempotencyKey: "10000000-0000-4000-8000-000000000008",
      })
      .expect(201);
    const checkout = checkoutResponseSchema.parse(checkoutResponse.body);

    const response = await request(app.getHttpServer())
      .post(`/v1/payment-attempts/${checkout.paymentAttemptId}/settle`)
      .set("Cookie", otherBuyer.cookie)
      .set("X-CSRF-Token", otherBuyer.csrfToken)
      .expect(404);
    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "NOT_FOUND" },
    });

    const paymentAttempt = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: checkout.paymentAttemptId },
    });
    expect(paymentAttempt.status).toBe("pending");
    const entitlementCount = await prisma.entitlement.count({
      where: { userId: ids.otherBuyer },
    });
    expect(entitlementCount).toBe(0);
  });

  it("replays an already-settled attempt without granting a duplicate entitlement", async () => {
    const buyer = await issueSession(ids.buyer);

    const checkoutResponse = await request(app.getHttpServer())
      .post("/v1/checkout")
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .send({
        items: [{ productId: ids.productBoth, licence: "Regular" }],
        idempotencyKey: "10000000-0000-4000-8000-000000000009",
      })
      .expect(201);
    const checkout = checkoutResponseSchema.parse(checkoutResponse.body);

    await request(app.getHttpServer())
      .post(`/v1/payment-attempts/${checkout.paymentAttemptId}/settle`)
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .expect(200);
    const replay = await request(app.getHttpServer())
      .post(`/v1/payment-attempts/${checkout.paymentAttemptId}/settle`)
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .expect(200);
    expect(orderSchema.parse(replay.body).status).toBe("settled");

    const entitlementCount = await prisma.entitlement.count({
      where: { userId: ids.buyer, productId: ids.productBoth },
    });
    expect(entitlementCount).toBe(1);
  });

  it("disables sandbox settlement outside non-production environments", async () => {
    const buyer = await issueSession(ids.buyer);

    const checkoutResponse = await request(app.getHttpServer())
      .post("/v1/checkout")
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .send({
        items: [{ productId: ids.productBoth, licence: "Regular" }],
        idempotencyKey: "10000000-0000-4000-8000-00000000000a",
      })
      .expect(201);
    const checkout = checkoutResponseSchema.parse(checkoutResponse.body);

    await request(prodApp.getHttpServer())
      .post(`/v1/payment-attempts/${checkout.paymentAttemptId}/settle`)
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .expect(403);

    const paymentAttempt = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: checkout.paymentAttemptId },
    });
    expect(paymentAttempt.status).toBe("pending");
    const entitlementCount = await prisma.entitlement.count({
      where: { userId: ids.buyer },
    });
    expect(entitlementCount).toBe(0);
  });

  it("cursor-paginates the caller's own orders with a bounded limit", async () => {
    const buyer = await issueSession(ids.buyer);
    const checkoutBodies = [
      {
        items: [{ productId: ids.productBoth, licence: "Regular" as const }],
        idempotencyKey: "10000000-0000-4000-8000-00000000000b",
      },
      {
        items: [{ productId: ids.productThird, licence: "Regular" as const }],
        idempotencyKey: "10000000-0000-4000-8000-00000000000c",
      },
      {
        items: [{ productId: ids.productSecond, licence: "Regular" as const }],
        idempotencyKey: "10000000-0000-4000-8000-00000000000d",
      },
    ];
    const createdOrderIds: string[] = [];
    for (const body of checkoutBodies) {
      const response = await request(app.getHttpServer())
        .post("/v1/checkout")
        .set("Cookie", buyer.cookie)
        .set("X-CSRF-Token", buyer.csrfToken)
        .send(body)
        .expect(201);
      createdOrderIds.push(checkoutResponseSchema.parse(response.body).orderId);
    }

    const firstPage = await request(app.getHttpServer())
      .get("/v1/orders?limit=2")
      .set("Cookie", buyer.cookie)
      .expect(200);
    const first = orderCollectionResponseSchema.parse(firstPage.body);
    expect(first.data).toHaveLength(2);
    expect(first.meta.hasMore).toBe(true);
    expect(first.meta.nextCursor).not.toBeNull();

    const secondPage = await request(app.getHttpServer())
      .get(
        `/v1/orders?limit=2&cursor=${encodeURIComponent(first.meta.nextCursor ?? "")}`,
      )
      .set("Cookie", buyer.cookie)
      .expect(200);
    const second = orderCollectionResponseSchema.parse(secondPage.body);
    expect(second.data).toHaveLength(1);
    expect(second.meta.hasMore).toBe(false);

    const seenIds = [...first.data, ...second.data]
      .map((order) => order.id)
      .sort();
    expect(seenIds).toEqual([...createdOrderIds].sort());
  });

  it("returns the shared 422 envelope for a tampered orders cursor", async () => {
    const buyer = await issueSession(ids.buyer);
    const response = await request(app.getHttpServer())
      .get("/v1/orders?cursor=not-a-real-cursor")
      .set("Cookie", buyer.cookie)
      .expect(422);
    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects checkout once the rolling per-user attempt cap is reached", async () => {
    const buyer = await issueSession(ids.buyer);
    const recent = new Date();
    await prisma.order.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        id: `f0000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
        userId: ids.buyer,
        currency: "VND" as const,
        subtotalMinor: 1,
        discountMinor: 0,
        totalMinor: 1,
        idempotencyKey: `f0000000-0000-4000-9000-${index.toString().padStart(12, "0")}`,
        createdAt: recent,
      })),
    });

    const response = await request(app.getHttpServer())
      .post("/v1/checkout")
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .send({
        items: [{ productId: ids.productBoth, licence: "Regular" }],
        idempotencyKey: "10000000-0000-4000-8000-00000000000e",
      })
      .expect(429);
    expect(apiErrorSchema.parse(response.body).error.code).toBe(
      "TOO_MANY_REQUESTS",
    );
  });

  it("never leaks a payment reference, provider, idempotency key, or owner id", async () => {
    const buyer = await issueSession(ids.buyer);
    const body = {
      items: [{ productId: ids.productBoth, licence: "Regular" as const }],
      idempotencyKey: "10000000-0000-4000-8000-00000000000f",
    };

    const checkoutResponse = await request(app.getHttpServer())
      .post("/v1/checkout")
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .send(body)
      .expect(201);
    expect(checkoutResponse.text).not.toContain(body.idempotencyKey);
    expect(checkoutResponse.text).not.toContain(ids.buyer);

    const checkout = checkoutResponseSchema.parse(checkoutResponse.body);
    const settleResponse = await request(app.getHttpServer())
      .post(`/v1/payment-attempts/${checkout.paymentAttemptId}/settle`)
      .set("Cookie", buyer.cookie)
      .set("X-CSRF-Token", buyer.csrfToken)
      .expect(200);

    for (const responseText of [checkoutResponse.text, settleResponse.text]) {
      expect(responseText).not.toContain("idempotencyKey");
      expect(responseText).not.toContain("provider");
      expect(responseText).not.toContain("subtotalMinor");
      expect(responseText).not.toContain("discountMinor");
      expect(responseText).not.toContain(ids.buyer);
    }
  });
});
