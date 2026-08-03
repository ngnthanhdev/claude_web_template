import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import {
  Currency,
  LicenceIdentifier,
  Locale,
  PrismaClient,
  PublicationState,
} from "@prisma/client";
import {
  categoryCollectionResponseSchema,
  productCollectionResponseSchema,
  productDetailResponseSchema,
} from "@marketplace/shared/catalogue";
import {
  currentSessionResponseSchema,
  magicLinkInitiationResponseSchema,
  magicLinkRedemptionResponseSchema,
} from "@marketplace/shared/auth";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE_NAME } from "../src/auth/core/auth-cookie.js";
import { AuthSessionService } from "../src/auth/core/auth-session.service.js";
import {
  EMAIL_DELIVERY_PORT,
  type EmailDeliveryOutcome,
  type EmailDeliveryPort,
  type MagicLinkDelivery,
} from "../src/auth/magic-links/email-delivery.port.js";
import {
  MAGIC_LINK_INITIATION_RESPONSE_EQUALIZER,
  type MagicLinkInitiationResponseEqualizer,
} from "../src/auth/magic-links/magic-links.service.js";
import { configureApp } from "../src/bootstrap/configure-app.js";
import { validateEnv } from "../src/config/env.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

const integrationDatabaseUrl =
  process.env.PUBLIC_RESOURCES_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

// Root categories (and their bilingual translations) are seeded by the
// catalogue read-model migration; "elementor" is one of the ten public roots.
const ELEMENTOR_ROOT_ID = "00000000-0000-4000-8000-000000000002";

const ids = {
  owner: "90000000-0000-4000-8000-000000000001",
  seller: "90000000-0000-4000-8000-000000000002",
  category: "90000000-0000-4000-8000-000000000003",
  product: "90000000-0000-4000-8000-000000000004",
} as const;

const productSlug = "aurora-composed";

/** Captures deliveries in place of any real email vendor (DI is replaceable). */
class CaptureEmailDelivery implements EmailDeliveryPort {
  readonly deliveries: MagicLinkDelivery[] = [];

  async sendMagicLink(
    delivery: MagicLinkDelivery,
  ): Promise<EmailDeliveryOutcome> {
    this.deliveries.push(delivery);
    return { status: "delivered" };
  }

  reset(): void {
    this.deliveries.splice(0);
  }
}

/** No-op equalizer so tests do not pay the real constant-time delay. */
class NoopResponseEqualizer implements MagicLinkInitiationResponseEqualizer {
  async equalize(): Promise<void> {
    // Timing equalization is unit-tested; the composed suite skips the delay.
  }
}

function tokenFromLink(link: string): string {
  const params = new URLSearchParams(new URL(link).hash.slice(1));
  const token = params.get("token");
  if (token === null) throw new Error("Captured link has no fragment token");
  return token;
}

function sessionCookie(setCookie: unknown): string {
  const headers = Array.isArray(setCookie)
    ? setCookie
    : typeof setCookie === "string"
      ? [setCookie]
      : [];
  const entry = headers.find((value) =>
    value.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  if (entry === undefined) throw new Error("No session cookie was set");
  return entry;
}

function rawTokenFromSetCookie(setCookie: unknown): string {
  const entry = sessionCookie(setCookie);
  return entry.slice(`${SESSION_COOKIE_NAME}=`.length).split(";", 1)[0] ?? "";
}

async function seedProduct(prisma: PrismaClient): Promise<void> {
  await prisma.user.create({
    data: { id: ids.owner, normalizedEmail: "composed-owner@example.com" },
  });
  await prisma.sellerProfile.create({
    data: { id: ids.seller, ownerId: ids.owner, slug: "composed-seller" },
  });
  await prisma.category.create({
    data: {
      id: ids.category,
      slug: "elementor-kits-composed",
      parentId: ELEMENTOR_ROOT_ID,
    },
  });
  await prisma.product.create({
    data: {
      id: ids.product,
      sellerId: ids.seller,
      categoryId: ids.category,
      slug: productSlug,
      thumbnailUrl: `https://assets.example.com/${productSlug}/thumbnail.webp`,
      documentationUrl: `https://docs.example.com/${productSlug}`,
      isolatedPreviewUrl: `https://preview.example.com/${productSlug}`,
      translations: {
        create: [
          {
            locale: Locale.vi,
            title: "Mẫu Ánh Dương Composed",
            summary: "Tóm tắt mẫu",
            description: "Mô tả chi tiết mẫu Ánh Dương",
          },
          {
            locale: Locale.en,
            title: "Aurora Composed Template",
            summary: "Template summary",
            description: "Detailed description of the Aurora template",
          },
        ],
      },
      versions: {
        create: [
          {
            version: "1.0.0",
            releasedAt: new Date("2026-07-01T00:00:00.000Z"),
            translations: {
              create: [
                { locale: Locale.vi, notes: "Phát hành đầu tiên" },
                { locale: Locale.en, notes: "Initial release" },
              ],
            },
          },
        ],
      },
      compatibility: {
        create: [{ target: "wordpress", constraint: "6.x" }],
      },
      specifications: {
        create: [
          {
            key: "framework",
            translations: {
              create: [
                { locale: Locale.vi, label: "Nền tảng", value: "WordPress" },
                { locale: Locale.en, label: "Framework", value: "WordPress" },
              ],
            },
          },
        ],
      },
      media: {
        create: [
          {
            position: 0,
            kind: "image",
            url: `https://assets.example.com/${productSlug}/screen.webp`,
            translations: {
              create: [
                { locale: Locale.vi, alt: "Ảnh mẫu" },
                { locale: Locale.en, alt: "Template screenshot" },
              ],
            },
          },
        ],
      },
      demoPages: {
        create: [
          {
            position: 0,
            slug: "home",
            previewUrl: `https://preview.example.com/${productSlug}/home`,
            translations: {
              create: [
                { locale: Locale.vi, title: "Trang chủ" },
                { locale: Locale.en, title: "Home" },
              ],
            },
          },
        ],
      },
      licenceOptions: {
        create: [
          {
            identifier: LicenceIdentifier.Regular,
            prices: {
              create: [
                { currency: Currency.VND, amount: 1_000_000 },
                { currency: Currency.USD, amount: 49 },
              ],
            },
          },
          {
            identifier: LicenceIdentifier.Extended,
            prices: {
              create: [
                { currency: Currency.VND, amount: 2_000_000 },
                { currency: Currency.USD, amount: 99 },
              ],
            },
          },
        ],
      },
    },
  });
  await prisma.product.update({
    where: { id: ids.product },
    data: {
      currentVersion: "1.0.0",
      publicationState: PublicationState.published,
      publishedAt: new Date("2026-07-02T00:00:00.000Z"),
    },
  });
}

describeWithPostgres("Composed public API resources", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let sessions: AuthSessionService;
  const email = new CaptureEmailDelivery();

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) return;
    // AppModule validates process.env through validateEnv on boot; the vitest
    // command supplies the secrets and the public origin, we complete the pair.
    process.env.DATABASE_URL = integrationDatabaseUrl;
    process.env.CORS_ORIGIN ??= "https://app.kitvera.test";

    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();
    await seedProduct(prisma);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(EMAIL_DELIVERY_PORT)
      .useValue(email)
      .overrideProvider(MAGIC_LINK_INITIATION_RESPONSE_EQUALIZER)
      .useValue(new NoopResponseEqualizer())
      .compile();

    // Mirror the production bootstrap (main.ts): versioning, Zod pipe, the
    // shared exception filter, and cookie support registered before requests.
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    sessions = app.get(AuthSessionService);
  }, 30_000);

  beforeEach(() => {
    email.reset();
  });

  afterAll(async () => {
    if (integrationDatabaseUrl === undefined) return;
    if (app !== undefined) await app.close();
    await prisma.$disconnect();
  });

  it("serves shared-schema-valid categories, products, and product detail", async () => {
    const categories = await request(app.getHttpServer())
      .get("/v1/categories?locale=vi")
      .expect(200);
    const categoryBody = categoryCollectionResponseSchema.parse(
      JSON.parse(categories.text),
    );
    expect(categoryBody.data.map(({ slug }) => slug)).toContain("elementor");

    const products = await request(app.getHttpServer())
      .get("/v1/products?locale=en&currency=USD&licence=Regular")
      .expect(200);
    const productBody = productCollectionResponseSchema.parse(
      JSON.parse(products.text),
    );
    expect(productBody.data.map(({ slug }) => slug)).toContain(productSlug);

    const detail = await request(app.getHttpServer())
      .get(`/v1/products/${productSlug}`)
      .expect(200);
    const detailBody = productDetailResponseSchema.parse(
      JSON.parse(detail.text),
    );
    expect(detailBody.slug).toBe(productSlug);
    expect(detailBody.category).toBe("elementor");
  });

  it("rejects malformed catalogue queries with the shared 422 envelope", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/products")
      .expect(422);
    expect(JSON.parse(response.text).error.code).toBe("VALIDATION_ERROR");
  });

  it("runs the passwordless lifecycle: initiate, redeem, session, CSRF, logout", async () => {
    const initiate = await request(app.getHttpServer())
      .post("/v1/auth/magic-links")
      .send({
        email: "  Buyer@Composed.Test ",
        locale: "vi",
        returnTo: "/vi/templates/aurora-composed",
      })
      .expect(202);
    expect(
      magicLinkInitiationResponseSchema.parse(JSON.parse(initiate.text)),
    ).toEqual({ status: "accepted" });
    expect(email.deliveries).toHaveLength(1);
    // Generic acceptance must never create or confirm an account.
    expect(
      await prisma.user.count({
        where: { normalizedEmail: "buyer@composed.test" },
      }),
    ).toBe(0);

    const token = tokenFromLink(email.deliveries[0]?.link ?? "");
    const redeem = await request(app.getHttpServer())
      .post("/v1/auth/magic-link-redemptions")
      .send({ token })
      .expect(201);
    const redeemBody = magicLinkRedemptionResponseSchema.parse(
      JSON.parse(redeem.text),
    );
    expect(redeemBody.user.email).toBe("buyer@composed.test");

    const setCookie = redeem.headers["set-cookie"];
    const rawSessionToken = rawTokenFromSetCookie(setCookie);
    const cookieHeader = sessionCookie(setCookie);
    // __Host- prefixed, HttpOnly, Secure, Path=/ — never readable by script.
    expect(cookieHeader).toMatch(/^__Host-kitvera_session=/);
    expect(cookieHeader).toMatch(/HttpOnly/i);
    expect(cookieHeader).toMatch(/Secure/i);
    expect(cookieHeader).toMatch(/Path=\/(;|$)/);
    // The raw bearer lives only in the cookie, never in a response body.
    expect(redeem.text).not.toContain(rawSessionToken);

    const current = await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawSessionToken}`)
      .expect(200);
    const currentBody = currentSessionResponseSchema.parse(
      JSON.parse(current.text),
    );
    expect(currentBody.user.email).toBe("buyer@composed.test");
    expect(current.text).not.toContain(rawSessionToken);
    expect(current.text).not.toContain("tokenHash");
    expect(current.text).not.toContain("csrfHash");

    // CSRF is enforced on the mutating logout: absent header is forbidden.
    const missingCsrf = await request(app.getHttpServer())
      .delete("/v1/sessions/current")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawSessionToken}`)
      .expect(403);
    expect(JSON.parse(missingCsrf.text).error.code).toBe("CSRF_INVALID");

    await request(app.getHttpServer())
      .delete("/v1/sessions/current")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawSessionToken}`)
      .set("x-csrf-token", currentBody.csrfToken)
      .expect(204);

    // The revoked session no longer authenticates.
    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawSessionToken}`)
      .expect(401);
  });

  it("revokes every session for the user on a user-wide logout", async () => {
    const initiate = await request(app.getHttpServer())
      .post("/v1/auth/magic-links")
      .send({ email: "multi@composed.test", locale: "en" })
      .expect(202);
    expect(JSON.parse(initiate.text)).toEqual({ status: "accepted" });

    const token = tokenFromLink(email.deliveries[0]?.link ?? "");
    const redeem = await request(app.getHttpServer())
      .post("/v1/auth/magic-link-redemptions")
      .send({ token })
      .expect(201);
    const firstToken = rawTokenFromSetCookie(redeem.headers["set-cookie"]);
    const redeemBody = magicLinkRedemptionResponseSchema.parse(
      JSON.parse(redeem.text),
    );
    const { csrfToken } = redeemBody;
    const userId = redeemBody.user.id;

    // A second, independent session for the same user.
    const second = await sessions.createSession(userId);

    await request(app.getHttpServer())
      .delete("/v1/sessions")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${firstToken}`)
      .set("x-csrf-token", csrfToken)
      .expect(204);

    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${firstToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${second.sessionToken}`)
      .expect(401);
  });

  it("returns the fixed 401 code for an invalid magic-link redemption", async () => {
    const unknownToken = Buffer.alloc(32, 123).toString("base64url");
    const response = await request(app.getHttpServer())
      .post("/v1/auth/magic-link-redemptions")
      .send({ token: unknownToken })
      .expect(401);
    expect(JSON.parse(response.text).error.code).toBe(
      "MAGIC_LINK_INVALID_OR_EXPIRED",
    );
  });

  it("fails closed when a required signing secret is absent", () => {
    const base = {
      NODE_ENV: "test",
      DATABASE_URL: integrationDatabaseUrl,
      CORS_ORIGIN: "https://app.kitvera.test",
      PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
      CATALOGUE_CURSOR_SIGNING_SECRET: Buffer.alloc(32, 1).toString(
        "base64url",
      ),
      AUTH_MAGIC_LINK_HASH_SECRET: Buffer.alloc(32, 2).toString("base64url"),
      AUTH_SESSION_HASH_SECRET: Buffer.alloc(32, 3).toString("base64url"),
      AUTH_CSRF_HASH_SECRET: Buffer.alloc(32, 4).toString("base64url"),
      AUTH_SOURCE_IP_HASH_SECRET: Buffer.alloc(32, 5).toString("base64url"),
      DOWNLOAD_TOKEN_HMAC_SECRET: Buffer.alloc(32, 6).toString("base64url"),
      FACTORY_INGEST_HMAC_SECRET: Buffer.alloc(32, 7).toString("base64url"),
      LOCAL_ARTIFACT_STORAGE_DIR:
        "/tmp/kitvera-public-resources-test-artifacts",
      ADMIN_MFA_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString(
        "base64url",
      ),
    };
    expect(() => validateEnv(base)).not.toThrow();
    const missingSecret: Record<string, unknown> = { ...base };
    delete missingSecret.AUTH_SESSION_HASH_SECRET;
    expect(() => validateEnv(missingSecret)).toThrow();
  });
});
