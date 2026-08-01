import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  downloadIssueResponseSchema,
  libraryResponseSchema,
} from "@marketplace/shared/commerce";
import { PrismaClient } from "@prisma/client";
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
import type { Env } from "../config/env.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SESSION_COOKIE_NAME } from "../auth/core/auth-cookie.js";
import { AuthSessionService } from "../auth/core/auth-session.service.js";
import { EntitlementsModule } from "./entitlements.module.js";

const integrationDatabaseUrl =
  process.env.ENTITLEMENTS_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

const secret = (byte: number): string =>
  Buffer.alloc(32, byte).toString("base64url");

function uuid(group: number, ordinal: number): string {
  return `${group.toString().padStart(8, "0")}-0000-4000-8000-${ordinal
    .toString()
    .padStart(12, "0")}`;
}

// The migration seeds ten approved top-level category roots that can never
// be inserted, deleted, or reparented by application code (see
// `enforce_approved_category_root` in the catalogue migration). Reusing the
// "html" root's fixed id avoids fighting that invariant with per-test
// category fixtures this suite has no reason to own.
const APPROVED_ROOT_CATEGORY_ID = "00000000-0000-4000-8000-000000000003";

const ids = {
  buyer: uuid(60, 1),
  otherUser: uuid(60, 2),
  seller: uuid(60, 3),
  sellerProfile: uuid(60, 4),
  product: uuid(60, 6),
  order: uuid(60, 7),
  entitlement: uuid(60, 8),
};

function cookieHeader(rawSessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

describeWithPostgres("Entitlements resources with PostgreSQL", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let sessions: AuthSessionService;
  let artifactsDir: string;
  let testEnvironment: Env;

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) return;
    artifactsDir = await mkdtemp(join(tmpdir(), "kitvera-entitlements-"));

    testEnvironment = {
      NODE_ENV: "test",
      PORT: 3000,
      DATABASE_URL: integrationDatabaseUrl,
      CORS_ORIGIN: "https://app.kitvera.test",
      PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
      CATALOGUE_CURSOR_SIGNING_SECRET: secret(1),
      AUTH_MAGIC_LINK_HASH_SECRET: secret(2),
      AUTH_SESSION_HASH_SECRET: secret(3),
      AUTH_CSRF_HASH_SECRET: secret(4),
      AUTH_SOURCE_IP_HASH_SECRET: secret(5),
      DOWNLOAD_TOKEN_HMAC_SECRET: secret(6),
      LOCAL_ARTIFACT_STORAGE_DIR: artifactsDir,
    } satisfies Env;

    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();

    @Module({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => testEnvironment],
        }),
        PrismaModule,
        EntitlementsModule,
      ],
    })
    class EntitlementsIntegrationModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [EntitlementsIntegrationModule],
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

  beforeEach(async () => {
    if (integrationDatabaseUrl === undefined) return;

    await prisma.downloadEvent.deleteMany();
    await prisma.entitlement.deleteMany();
    await prisma.orderItemSnapshot.deleteMany();
    await prisma.paymentAttempt.deleteMany();
    await prisma.order.deleteMany();
    await prisma.productVersion.deleteMany();
    await prisma.product.deleteMany();
    await prisma.sellerProfile.deleteMany();
    await prisma.authSecurityEvent.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();

    await prisma.user.createMany({
      data: [
        { id: ids.buyer, normalizedEmail: "buyer@entitlements.test" },
        { id: ids.otherUser, normalizedEmail: "other@entitlements.test" },
        { id: ids.seller, normalizedEmail: "seller@entitlements.test" },
      ],
    });
    await prisma.sellerProfile.create({
      data: {
        id: ids.sellerProfile,
        ownerId: ids.seller,
        slug: "entitlements-seller",
      },
    });
    await prisma.product.create({
      data: {
        id: ids.product,
        sellerId: ids.sellerProfile,
        categoryId: APPROVED_ROOT_CATEGORY_ID,
        slug: "entitlements-product",
        thumbnailUrl: "https://assets.example.com/thumbnail.webp",
        documentationUrl: "https://docs.example.com/product",
        isolatedPreviewUrl: "https://preview.example.com/product",
        publishedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
    await prisma.productVersion.create({
      data: {
        productId: ids.product,
        version: "1.0.0",
        releasedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
    await prisma.order.create({
      data: {
        id: ids.order,
        userId: ids.buyer,
        currency: "USD",
        subtotalMinor: 1000,
        discountMinor: 0,
        totalMinor: 1000,
        status: "settled",
        idempotencyKey: uuid(61, 1),
        settledAt: new Date("2026-07-02T00:00:00.000Z"),
      },
    });
    await prisma.entitlement.create({
      data: {
        id: ids.entitlement,
        userId: ids.buyer,
        productId: ids.product,
        version: "1.0.0",
        orderId: ids.order,
        createdAt: new Date("2026-07-02T00:00:00.000Z"),
      },
    });

    await rm(artifactsDir, { recursive: true, force: true });
    await mkdir(join(artifactsDir, ids.product), { recursive: true });
    await writeFile(
      join(artifactsDir, ids.product, "1.0.0"),
      "fixture-artifact-bytes",
      "utf8",
    );
  });

  afterAll(async () => {
    if (integrationDatabaseUrl === undefined) return;
    if (app !== undefined) await app.close();
    await prisma.$disconnect();
    if (artifactsDir !== undefined) {
      await rm(artifactsDir, { recursive: true, force: true });
    }
  });

  it("scopes the library to the caller and never exposes another user's entitlement", async () => {
    const buyerSession = await sessions.createSession(ids.buyer);
    const otherSession = await sessions.createSession(ids.otherUser);

    const buyerLibrary = await request(app.getHttpServer())
      .get("/v1/account/library")
      .set("Cookie", cookieHeader(buyerSession.sessionToken))
      .expect(200);
    const parsedBuyerLibrary = libraryResponseSchema.parse(buyerLibrary.body);
    expect(parsedBuyerLibrary.data).toEqual([
      {
        id: ids.entitlement,
        productId: ids.product,
        version: "1.0.0",
        createdAt: "2026-07-02T00:00:00.000Z",
      },
    ]);

    const otherLibrary = await request(app.getHttpServer())
      .get("/v1/account/library")
      .set("Cookie", cookieHeader(otherSession.sessionToken))
      .expect(200);
    expect(libraryResponseSchema.parse(otherLibrary.body).data).toEqual([]);
  });

  it("rejects an unauthenticated library read", async () => {
    await request(app.getHttpServer()).get("/v1/account/library").expect(401);
  });

  it("cursor-paginates the library newest-first with a schema-bounded limit", async () => {
    const buyerSession = await sessions.createSession(ids.buyer);
    // `Entitlement` is `@@unique([userId, productId])` — a second entitlement
    // for the same buyer needs its own product.
    const secondProductId = uuid(60, 11);
    const secondEntitlementId = uuid(60, 10);
    await prisma.product.create({
      data: {
        id: secondProductId,
        sellerId: ids.sellerProfile,
        categoryId: APPROVED_ROOT_CATEGORY_ID,
        slug: "entitlements-product-2",
        thumbnailUrl: "https://assets.example.com/thumbnail-2.webp",
        documentationUrl: "https://docs.example.com/product-2",
        isolatedPreviewUrl: "https://preview.example.com/product-2",
        publishedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
    await prisma.productVersion.create({
      data: {
        productId: secondProductId,
        version: "1.0.0",
        releasedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
    await prisma.entitlement.create({
      data: {
        id: secondEntitlementId,
        userId: ids.buyer,
        productId: secondProductId,
        version: "1.0.0",
        orderId: ids.order,
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
      },
    });

    const firstPage = await request(app.getHttpServer())
      .get("/v1/account/library?limit=1")
      .set("Cookie", cookieHeader(buyerSession.sessionToken))
      .expect(200);
    const parsedFirstPage = libraryResponseSchema.parse(firstPage.body);
    expect(parsedFirstPage.data).toEqual([
      expect.objectContaining({ id: secondEntitlementId }),
    ]);
    expect(parsedFirstPage.meta.hasMore).toBe(true);
    expect(parsedFirstPage.meta.nextCursor).not.toBeNull();

    const secondPage = await request(app.getHttpServer())
      .get(
        `/v1/account/library?limit=1&cursor=${encodeURIComponent(
          parsedFirstPage.meta.nextCursor ?? "",
        )}`,
      )
      .set("Cookie", cookieHeader(buyerSession.sessionToken))
      .expect(200);
    const parsedSecondPage = libraryResponseSchema.parse(secondPage.body);
    expect(parsedSecondPage.data).toEqual([
      expect.objectContaining({ id: ids.entitlement }),
    ]);
    expect(parsedSecondPage.meta.hasMore).toBe(false);
    expect(parsedSecondPage.meta.nextCursor).toBeNull();

    await request(app.getHttpServer())
      .get("/v1/account/library?limit=51")
      .set("Cookie", cookieHeader(buyerSession.sessionToken))
      .expect(422);
  });

  it("issues a working single-use download only for the owned, exact (product, version)", async () => {
    const buyerSession = await sessions.createSession(ids.buyer);

    const issued = await request(app.getHttpServer())
      .post(`/v1/entitlements/${ids.entitlement}/download`)
      .set("Cookie", cookieHeader(buyerSession.sessionToken))
      .set("X-CSRF-Token", buyerSession.csrfToken)
      .send({ productId: ids.product, version: "1.0.0" })
      .expect(200);
    const parsed = downloadIssueResponseSchema.parse(issued.body);
    expect(parsed.url).toMatch(/^\/api\/v1\/downloads\/token\/v1\./);

    const tokenPath = parsed.url.replace("/api", "");
    const download = await request(app.getHttpServer())
      .get(tokenPath)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((download.body as Buffer).toString("utf8")).toBe(
      "fixture-artifact-bytes",
    );
    expect(download.headers["content-disposition"]).toBe("attachment");

    // Single-use: the same token cannot be redeemed twice.
    await request(app.getHttpServer()).get(tokenPath).expect(404);

    expect(await prisma.downloadEvent.count()).toBe(1);
    const event = await prisma.downloadEvent.findFirstOrThrow();
    expect(event).toMatchObject({
      entitlementId: ids.entitlement,
      userId: ids.buyer,
      productId: ids.product,
      version: "1.0.0",
    });
    expect(event.sourceIpDigest).not.toBe(""); // keyed HMAC digest, never the raw IP
    expect(JSON.stringify(event)).not.toContain("127.0.0.1");
  });

  it("rejects a non-owned entitlement and tampered productId/version with the same 404", async () => {
    const otherSession = await sessions.createSession(ids.otherUser);
    const buyerSession = await sessions.createSession(ids.buyer);

    await request(app.getHttpServer())
      .post(`/v1/entitlements/${ids.entitlement}/download`)
      .set("Cookie", cookieHeader(otherSession.sessionToken))
      .set("X-CSRF-Token", otherSession.csrfToken)
      .send({ productId: ids.product, version: "1.0.0" })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/v1/entitlements/${ids.entitlement}/download`)
      .set("Cookie", cookieHeader(buyerSession.sessionToken))
      .set("X-CSRF-Token", buyerSession.csrfToken)
      .send({ productId: uuid(62, 1), version: "1.0.0" })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/v1/entitlements/${ids.entitlement}/download`)
      .set("Cookie", cookieHeader(buyerSession.sessionToken))
      .set("X-CSRF-Token", buyerSession.csrfToken)
      .send({ productId: ids.product, version: "9.9.9" })
      .expect(404);

    expect(await prisma.downloadEvent.count()).toBe(0);
  });

  it("requires CSRF for download issuance", async () => {
    const buyerSession = await sessions.createSession(ids.buyer);

    await request(app.getHttpServer())
      .post(`/v1/entitlements/${ids.entitlement}/download`)
      .set("Cookie", cookieHeader(buyerSession.sessionToken))
      .send({ productId: ids.product, version: "1.0.0" })
      .expect(403);

    expect(await prisma.downloadEvent.count()).toBe(0);
  });

  it("rejects an expired download token", async () => {
    const buyerSession = await sessions.createSession(ids.buyer);
    vi.useFakeTimers();
    try {
      const issued = await request(app.getHttpServer())
        .post(`/v1/entitlements/${ids.entitlement}/download`)
        .set("Cookie", cookieHeader(buyerSession.sessionToken))
        .set("X-CSRF-Token", buyerSession.csrfToken)
        .send({ productId: ids.product, version: "1.0.0" })
        .expect(200);
      const parsed = downloadIssueResponseSchema.parse(issued.body);
      const tokenPath = parsed.url.replace("/api", "");

      vi.setSystemTime(new Date(Date.now() + 6 * 60_000));
      await request(app.getHttpServer()).get(tokenPath).expect(404);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns exactly one DownloadEvent per successfully issued URL", async () => {
    const buyerSession = await sessions.createSession(ids.buyer);

    await request(app.getHttpServer())
      .post(`/v1/entitlements/${ids.entitlement}/download`)
      .set("Cookie", cookieHeader(buyerSession.sessionToken))
      .set("X-CSRF-Token", buyerSession.csrfToken)
      .send({ productId: ids.product, version: "1.0.0" })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/entitlements/${ids.entitlement}/download`)
      .set("Cookie", cookieHeader(buyerSession.sessionToken))
      .set("X-CSRF-Token", buyerSession.csrfToken)
      .send({ productId: ids.product, version: "1.0.0" })
      .expect(200);

    expect(await prisma.downloadEvent.count()).toBe(2);
  });

  it("enforces the per-entitlement download-issuance window", async () => {
    const buyerSession = await sessions.createSession(ids.buyer);

    const responses = [];
    for (let index = 0; index < 21; index += 1) {
      responses.push(
        await request(app.getHttpServer())
          .post(`/v1/entitlements/${ids.entitlement}/download`)
          .set("Cookie", cookieHeader(buyerSession.sessionToken))
          .set("X-CSRF-Token", buyerSession.csrfToken)
          .send({ productId: ids.product, version: "1.0.0" }),
      );
    }

    expect(responses.filter(({ status }) => status === 200)).toHaveLength(20);
    expect(responses.filter(({ status }) => status === 429)).toHaveLength(1);
    expect(await prisma.downloadEvent.count()).toBe(20);
  });

  it("never logs the raw download token or signed URL", async () => {
    const buyerSession = await sessions.createSession(ids.buyer);
    const logSpy = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    try {
      const issued = await request(app.getHttpServer())
        .post(`/v1/entitlements/${ids.entitlement}/download`)
        .set("Cookie", cookieHeader(buyerSession.sessionToken))
        .set("X-CSRF-Token", buyerSession.csrfToken)
        .send({ productId: ids.product, version: "1.0.0" })
        .expect(200);
      const parsed = downloadIssueResponseSchema.parse(issued.body);
      const rawToken = parsed.url.split("/").pop() ?? "";
      expect(rawToken.length).toBeGreaterThan(0);

      const tokenPath = parsed.url.replace("/api", "");
      await request(app.getHttpServer()).get(tokenPath).expect(200);

      const allLoggedText = JSON.stringify([
        ...logSpy.mock.calls,
        ...errorSpy.mock.calls,
        ...warnSpy.mock.calls,
      ]);
      expect(allLoggedText).not.toContain(rawToken);

      const events = await prisma.downloadEvent.findMany();
      expect(JSON.stringify(events)).not.toContain(rawToken);
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
