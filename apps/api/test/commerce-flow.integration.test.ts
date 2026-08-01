import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import {
  checkoutResponseSchema,
  downloadIssueResponseSchema,
  libraryResponseSchema,
  orderSchema,
} from "@marketplace/shared/commerce";
import type { FastifyServerOptions } from "fastify";
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

import type { AuthSessionService as AuthSessionServiceType } from "../src/auth/core/auth-session.service.js";
import { SESSION_COOKIE_NAME } from "../src/auth/core/auth-cookie.js";
import { configureApp } from "../src/bootstrap/configure-app.js";
import { requestLogSerializer } from "../src/common/request-log-serializer.js";

const integrationDatabaseUrl =
  process.env.COMMERCE_FLOW_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

// One of the ten approved top-level category roots the catalogue read-model
// migration seeds — reused directly as `categoryId` the same way the
// module-level commerce/entitlements integration suites do, so this suite
// owns no category fixture of its own.
const APPROVED_ROOT_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";

function uuid(group: number, ordinal: number): string {
  return `${group.toString().padStart(8, "0")}-0000-4000-8000-${ordinal
    .toString()
    .padStart(12, "0")}`;
}

const ids = {
  sellerOwner: uuid(70, 1),
  seller: uuid(70, 2),
  buyer: uuid(70, 3),
  otherBuyer: uuid(70, 4),
  product: uuid(70, 5),
} as const;

const PRODUCT_SLUG = "aurora-commerce-flow";
const PRODUCT_VERSION = "1.0.0";
const REGULAR_PRICE_VND = 500_000;
const EXTENDED_PRICE_VND = 900_000;
const ARTIFACT_CONTENTS = "commerce-flow-fixture-artifact";

function cookieHeader(rawSessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

/**
 * Captures every byte written to a Fastify/pino access log so the suite can
 * assert on the exact JSON emitted for a real request, instead of only on
 * the HTTP response body.
 */
class CapturingLogStream extends Writable {
  private readonly chunks: Buffer[] = [];

  override _write(
    chunk: Buffer | string,
    _encoding: string,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

/**
 * Builds a fully composed `AppModule` instance pinned to a specific
 * `NODE_ENV`. `@nestjs/config`'s `ConfigModule.forRoot({ validate })`
 * resolves and freezes its validated config the moment `AppModule`'s
 * `@Module()` decorator is first evaluated (at import time), not at
 * `TestingModule#compile()`/`#init()` time — so reusing one statically
 * imported `AppModule` for two apps would silently serve the first app's
 * config to both. Setting the desired `process.env` values and dynamically
 * re-importing `AppModule` (and every class used as a DI lookup token
 * against it) after `vi.resetModules()` forces Nest to re-evaluate the whole
 * module graph — and therefore `ConfigModule.forRoot()` — against the
 * environment this call actually wants, so each app genuinely runs its own
 * `NODE_ENV`/`LOCAL_ARTIFACT_STORAGE_DIR`.
 */
async function bootComposedApp(options: {
  readonly nodeEnv: "test" | "production";
  readonly prisma: PrismaClient;
  readonly logger: FastifyServerOptions["logger"];
}): Promise<{
  app: NestFastifyApplication;
  sessions: AuthSessionServiceType;
}> {
  process.env.NODE_ENV = options.nodeEnv;
  vi.resetModules();
  const [
    { AppModule: FreshAppModule },
    { PrismaService: FreshPrismaService },
    { AuthSessionService: FreshAuthSessionService },
  ] = await Promise.all([
    import("../src/app.module.js"),
    import("../src/prisma/prisma.service.js"),
    import("../src/auth/core/auth-session.service.js"),
  ]);

  const moduleRef = await Test.createTestingModule({
    imports: [FreshAppModule],
  })
    .overrideProvider(FreshPrismaService)
    .useValue(options.prisma)
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: options.logger }),
  );
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    sessions: app.get<AuthSessionServiceType>(FreshAuthSessionService),
  };
}

/**
 * Satisfies the catalogue's `assert_product_publication_ready` deferred
 * constraint trigger (design-inherited from Layer 2): a published product
 * needs bilingual translations, a bilingual version changelog entry, a
 * compatibility row, a localized specification, a localized media item, a
 * localized demo page, and both Regular/Extended licences priced in VND and
 * USD.
 */
async function seedPurchasableProduct(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.product.create({
      data: {
        id: ids.product,
        sellerId: ids.seller,
        categoryId: APPROVED_ROOT_CATEGORY_ID,
        slug: PRODUCT_SLUG,
        thumbnailUrl: `https://assets.example.com/${PRODUCT_SLUG}/thumbnail.webp`,
        documentationUrl: `https://docs.example.com/${PRODUCT_SLUG}`,
        isolatedPreviewUrl: `https://preview.example.com/${PRODUCT_SLUG}`,
        translations: {
          create: [
            {
              locale: "en",
              title: "Aurora Commerce Flow",
              summary: "Template summary",
              description: "Template description",
            },
            {
              locale: "vi",
              title: "Aurora Commerce Flow",
              summary: "Tóm tắt mẫu",
              description: "Mô tả mẫu",
            },
          ],
        },
      },
    });
    await tx.productVersion.create({
      data: {
        productId: ids.product,
        version: PRODUCT_VERSION,
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
        url: `https://assets.example.com/${PRODUCT_SLUG}/screen.webp`,
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
        previewUrl: `https://preview.example.com/${PRODUCT_SLUG}/home`,
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
            { currency: "VND", amount: REGULAR_PRICE_VND },
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
            { currency: "VND", amount: EXTENDED_PRICE_VND },
            { currency: "USD", amount: 36 },
          ],
        },
      },
    });
    await tx.product.update({
      where: { id: ids.product },
      data: {
        currentVersion: PRODUCT_VERSION,
        publicationState: "published",
        publishedAt: new Date(),
      },
    });
  });
}

describeWithPostgres(
  "Composed commerce flow (checkout -> sandbox settle -> entitlement -> library -> download)",
  () => {
    let app: NestFastifyApplication;
    let prodApp: NestFastifyApplication;
    let prisma: PrismaClient;
    let sessions: AuthSessionServiceType;
    let artifactsDir: string;
    let logStream: CapturingLogStream;

    beforeAll(async () => {
      if (integrationDatabaseUrl === undefined) return;
      artifactsDir = await mkdtemp(join(tmpdir(), "kitvera-commerce-flow-"));
      await mkdir(join(artifactsDir, ids.product), { recursive: true });
      await writeFile(
        join(artifactsDir, ids.product, PRODUCT_VERSION),
        ARTIFACT_CONTENTS,
        "utf8",
      );

      // AppModule validates process.env through validateEnv on boot (see
      // public-resources.integration.test.ts); this suite supplies the
      // database/CORS/storage values the shared test-script secrets don't.
      process.env.DATABASE_URL = integrationDatabaseUrl;
      process.env.CORS_ORIGIN ??= "https://app.kitvera.test";
      process.env.LOCAL_ARTIFACT_STORAGE_DIR = artifactsDir;

      prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
      await prisma.$connect();
      await prisma.user.createMany({
        data: [
          {
            id: ids.sellerOwner,
            normalizedEmail: "commerce-flow-seller@example.com",
          },
          { id: ids.buyer, normalizedEmail: "commerce-flow-buyer@example.com" },
          {
            id: ids.otherBuyer,
            normalizedEmail: "commerce-flow-other@example.com",
          },
        ],
      });
      await prisma.sellerProfile.create({
        data: {
          id: ids.seller,
          ownerId: ids.sellerOwner,
          slug: "commerce-flow-seller",
        },
      });
      await seedPurchasableProduct(prisma);

      logStream = new CapturingLogStream();
      const testApp = await bootComposedApp({
        nodeEnv: "test",
        prisma,
        logger: {
          level: "info",
          stream: logStream,
          serializers: { req: requestLogSerializer },
        },
      });
      app = testApp.app;
      sessions = testApp.sessions;

      // A second, fully composed app booted with NODE_ENV=production so the
      // sandbox settle non-prod guard is proven at the real HTTP seam, not
      // just at the service unit level (design §9 "Sandbox settle endpoint /
      // Elevation").
      const productionApp = await bootComposedApp({
        nodeEnv: "production",
        prisma,
        logger: false,
      });
      prodApp = productionApp.app;
    }, 30_000);

    beforeEach(async () => {
      if (integrationDatabaseUrl === undefined) return;
      const buyerIds = [ids.buyer, ids.otherBuyer];
      await prisma.downloadEvent.deleteMany({
        where: { userId: { in: buyerIds } },
      });
      await prisma.entitlement.deleteMany({
        where: { userId: { in: buyerIds } },
      });
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
    });

    afterAll(async () => {
      if (integrationDatabaseUrl === undefined) return;
      if (app !== undefined) await app.close();
      if (prodApp !== undefined) await prodApp.close();
      await prisma.$disconnect();
      if (artifactsDir !== undefined) {
        await rm(artifactsDir, { recursive: true, force: true });
      }
    });

    async function issueSession(userId: string) {
      const issued = await sessions.createSession(userId);
      return {
        cookie: cookieHeader(issued.sessionToken),
        csrfToken: issued.csrfToken,
      };
    }

    async function checkoutRegularItem(buyer: {
      cookie: string;
      csrfToken: string;
    }) {
      const response = await request(app.getHttpServer())
        .post("/v1/checkout")
        .set("Cookie", buyer.cookie)
        .set("X-CSRF-Token", buyer.csrfToken)
        .send({
          items: [{ productId: ids.product, licence: "Regular" }],
          idempotencyKey: randomUUID(),
        })
        .expect(201);
      return checkoutResponseSchema.parse(response.body);
    }

    it("fulfils checkout -> sandbox settle -> entitlement -> library -> download end to end", async () => {
      const buyer = await issueSession(ids.buyer);
      const checkout = await checkoutRegularItem(buyer);
      expect(checkout.status).toBe("pending");

      const settleResponse = await request(app.getHttpServer())
        .post(`/v1/payment-attempts/${checkout.paymentAttemptId}/settle`)
        .set("Cookie", buyer.cookie)
        .set("X-CSRF-Token", buyer.csrfToken)
        .expect(200);
      const settledOrder = orderSchema.parse(settleResponse.body);
      expect(settledOrder.id).toBe(checkout.orderId);
      expect(settledOrder.status).toBe("settled");
      expect(settledOrder.total).toEqual({
        amount: REGULAR_PRICE_VND,
        currency: "VND",
      });

      const orderDetail = await request(app.getHttpServer())
        .get(`/v1/orders/${checkout.orderId}`)
        .set("Cookie", buyer.cookie)
        .expect(200);
      expect(orderSchema.parse(orderDetail.body).status).toBe("settled");

      const library = await request(app.getHttpServer())
        .get("/v1/account/library")
        .set("Cookie", buyer.cookie)
        .expect(200);
      const libraryBody = libraryResponseSchema.parse(library.body);
      expect(libraryBody.data).toHaveLength(1);
      const entitlement = libraryBody.data[0];
      expect(entitlement).toMatchObject({
        productId: ids.product,
        version: PRODUCT_VERSION,
      });

      const issued = await request(app.getHttpServer())
        .post(`/v1/entitlements/${entitlement?.id}/download`)
        .set("Cookie", buyer.cookie)
        .set("X-CSRF-Token", buyer.csrfToken)
        .send({ productId: ids.product, version: PRODUCT_VERSION })
        .expect(200);
      const download = downloadIssueResponseSchema.parse(issued.body);
      expect(download.url).toMatch(/^\/api\/v1\/downloads\/token\/v1\./);

      const tokenPath = download.url.replace("/api", "");
      const fileResponse = await request(app.getHttpServer())
        .get(tokenPath)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect((fileResponse.body as Buffer).toString("utf8")).toBe(
        ARTIFACT_CONTENTS,
      );

      const downloadEvent = await prisma.downloadEvent.findFirstOrThrow({
        where: { userId: ids.buyer },
      });
      expect(downloadEvent).toMatchObject({
        productId: ids.product,
        version: PRODUCT_VERSION,
      });
    });

    it("hides another user's order/entitlement and refuses a download for a non-owned entitlement, all 404", async () => {
      const buyer = await issueSession(ids.buyer);
      const otherBuyer = await issueSession(ids.otherBuyer);
      const checkout = await checkoutRegularItem(buyer);
      await request(app.getHttpServer())
        .post(`/v1/payment-attempts/${checkout.paymentAttemptId}/settle`)
        .set("Cookie", buyer.cookie)
        .set("X-CSRF-Token", buyer.csrfToken)
        .expect(200);

      const library = await request(app.getHttpServer())
        .get("/v1/account/library")
        .set("Cookie", buyer.cookie)
        .expect(200);
      const entitlementId = libraryResponseSchema.parse(library.body).data[0]
        ?.id;
      expect(entitlementId).toBeDefined();

      await request(app.getHttpServer())
        .get(`/v1/orders/${checkout.orderId}`)
        .set("Cookie", otherBuyer.cookie)
        .expect(404);

      const otherLibrary = await request(app.getHttpServer())
        .get("/v1/account/library")
        .set("Cookie", otherBuyer.cookie)
        .expect(200);
      expect(libraryResponseSchema.parse(otherLibrary.body).data).toEqual([]);

      await request(app.getHttpServer())
        .post(`/v1/entitlements/${entitlementId}/download`)
        .set("Cookie", otherBuyer.cookie)
        .set("X-CSRF-Token", otherBuyer.csrfToken)
        .send({ productId: ids.product, version: PRODUCT_VERSION })
        .expect(404);

      expect(
        await prisma.downloadEvent.count({
          where: { userId: ids.otherBuyer },
        }),
      ).toBe(0);
    });

    it("disables the sandbox settle endpoint when the composed app runs with NODE_ENV=production", async () => {
      const buyer = await issueSession(ids.buyer);
      const checkout = await checkoutRegularItem(buyer);

      await request(prodApp.getHttpServer())
        .post(`/v1/payment-attempts/${checkout.paymentAttemptId}/settle`)
        .set("Cookie", buyer.cookie)
        .set("X-CSRF-Token", buyer.csrfToken)
        .expect(403);

      const paymentAttempt = await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: checkout.paymentAttemptId },
      });
      expect(paymentAttempt.status).toBe("pending");
      expect(
        await prisma.entitlement.count({ where: { userId: ids.buyer } }),
      ).toBe(0);
    });

    it("never leaks a payment reference, provider, or download token/URL in a response or the access log", async () => {
      const buyer = await issueSession(ids.buyer);
      const checkout = await checkoutRegularItem(buyer);

      const settleResponse = await request(app.getHttpServer())
        .post(`/v1/payment-attempts/${checkout.paymentAttemptId}/settle`)
        .set("Cookie", buyer.cookie)
        .set("X-CSRF-Token", buyer.csrfToken)
        .expect(200);

      for (const text of [settleResponse.text]) {
        expect(text).not.toContain("idempotencyKey");
        expect(text).not.toContain("provider");
        expect(text).not.toContain("subtotalMinor");
        expect(text).not.toContain("discountMinor");
        expect(text).not.toContain(ids.buyer);
      }

      const library = await request(app.getHttpServer())
        .get("/v1/account/library")
        .set("Cookie", buyer.cookie)
        .expect(200);
      const entitlementId = libraryResponseSchema.parse(library.body).data[0]
        ?.id;

      const issued = await request(app.getHttpServer())
        .post(`/v1/entitlements/${entitlementId}/download`)
        .set("Cookie", buyer.cookie)
        .set("X-CSRF-Token", buyer.csrfToken)
        .send({ productId: ids.product, version: PRODUCT_VERSION })
        .expect(200);
      const download = downloadIssueResponseSchema.parse(issued.body);
      const rawToken = download.url.split("/").pop() ?? "";
      expect(rawToken.length).toBeGreaterThan(0);
      expect(issued.text).not.toContain("provider");

      const tokenPath = download.url.replace("/api", "");
      await request(app.getHttpServer()).get(tokenPath).expect(200);

      // The download-issue request itself, and every earlier request in this
      // test, must have logged their URL with the token path — but never the
      // raw token — proving `main.ts`'s serializer redaction actually runs
      // at the composed seam (design §9 "Signed download URL / Info
      // disclosure").
      const logText = logStream.text();
      expect(logText).not.toContain(rawToken);
      expect(logText).toContain("downloads/token/[redacted]");
      // The token mask must not come at the cost of the observability
      // fields Fastify's own default request serializer would have logged
      // (`logger: true` before this project added the mask).
      expect(logText).toContain('"remoteAddress"');
      expect(logText).toContain('"remotePort"');
    });
  },
);
