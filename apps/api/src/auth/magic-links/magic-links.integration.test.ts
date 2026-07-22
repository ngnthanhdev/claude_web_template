import cookie from "@fastify/cookie";
import { VersioningType } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  magicLinkInitiationResponseSchema,
  magicLinkRedemptionResponseSchema,
} from "@marketplace/shared/auth";
import { PrismaClient } from "@prisma/client";
import { ZodValidationPipe } from "nestjs-zod";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { ApiExceptionFilter } from "../../common/filters/api-exception.filter.js";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuthCryptoService } from "../core/auth-crypto.service.js";
import {
  EMAIL_DELIVERY_PORT,
  type EmailDeliveryOutcome,
  type EmailDeliveryPort,
  type MagicLinkDelivery,
} from "./email-delivery.port.js";
import { MagicLinksModule } from "./magic-links.module.js";
import {
  MAGIC_LINK_INITIATION_RESPONSE_EQUALIZER,
  type MagicLinkInitiationResponseEqualizer,
} from "./magic-links.service.js";

const integrationDatabaseUrl = process.env.MAGIC_LINK_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

class CaptureEmailDelivery implements EmailDeliveryPort {
  readonly deliveries: MagicLinkDelivery[] = [];
  outcome: EmailDeliveryOutcome = { status: "delivered" };
  failure: Error | null = null;

  async sendMagicLink(delivery: MagicLinkDelivery): Promise<EmailDeliveryOutcome> {
    this.deliveries.push(delivery);
    if (this.failure !== null) throw this.failure;
    return this.outcome;
  }

  reset(): void {
    this.deliveries.splice(0);
    this.outcome = { status: "delivered" };
    this.failure = null;
  }
}

class CaptureResponseEqualizer implements MagicLinkInitiationResponseEqualizer {
  readonly startedAtValues: number[] = [];

  async equalize(startedAt: number): Promise<void> {
    this.startedAtValues.push(startedAt);
  }

  reset(): void {
    this.startedAtValues.splice(0);
  }
}

const secrets = {
  CATALOGUE_CURSOR_SIGNING_SECRET: Buffer.alloc(32, 1).toString("base64url"),
  AUTH_MAGIC_LINK_HASH_SECRET: Buffer.alloc(32, 2).toString("base64url"),
  AUTH_SESSION_HASH_SECRET: Buffer.alloc(32, 3).toString("base64url"),
  AUTH_CSRF_HASH_SECRET: Buffer.alloc(32, 4).toString("base64url"),
  AUTH_SOURCE_IP_HASH_SECRET: Buffer.alloc(32, 5).toString("base64url"),
} as const;

function tokenFromLink(link: string): string {
  const url = new URL(link);
  const params = new URLSearchParams(url.hash.slice(1));
  const token = params.get("token");
  if (token === null) throw new Error("Captured link has no fragment token");
  return token;
}

describeWithPostgres("Magic links PostgreSQL integration", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let crypto: AuthCryptoService;
  const email = new CaptureEmailDelivery();
  const equalizer = new CaptureResponseEqualizer();

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) return;
    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({
            NODE_ENV: "test",
            DATABASE_URL: integrationDatabaseUrl,
            CORS_ORIGIN: "https://app.kitvera.test",
            PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
            ...secrets,
          })],
        }),
        PrismaModule,
        MagicLinksModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(EMAIL_DELIVERY_PORT)
      .useValue(email)
      .overrideProvider(MAGIC_LINK_INITIATION_RESPONSE_EQUALIZER)
      .useValue(equalizer)
      .compile();

    crypto = moduleRef.get(AuthCryptoService);
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 30_000);

  beforeEach(async () => {
    if (integrationDatabaseUrl === undefined) return;
    email.reset();
    equalizer.reset();
    await prisma.authSecurityEvent.deleteMany();
    await prisma.session.deleteMany();
    await prisma.magicLinkToken.deleteMany();
    await prisma.authRateEvent.deleteMany();
    await prisma.userRole.deleteMany({
      where: { user: { normalizedEmail: { endsWith: ".magic.test" } } },
    });
    await prisma.user.deleteMany({
      where: { normalizedEmail: { endsWith: ".magic.test" } },
    });
  });

  afterAll(async () => {
    if (integrationDatabaseUrl === undefined) return;
    if (app !== undefined) await app.close();
    await prisma.$disconnect();
  });

  it("issues only hashed, expiring tokens and revokes older live links", async () => {
    for (let index = 0; index < 2; index += 1) {
      const response = await request(app.getHttpServer())
        .post("/v1/auth/magic-links")
        .send({
          email: "  Buyer@Flow.Magic.Test ",
          locale: "vi",
          returnTo: "/vi/templates/aurora",
        })
        .expect(202);
      expect(magicLinkInitiationResponseSchema.parse(JSON.parse(response.text))).toEqual({
        status: "accepted",
      });
    }

    expect(await prisma.user.count()).toBe(0);
    expect(email.deliveries).toHaveLength(2);
    const firstToken = tokenFromLink(email.deliveries[0]?.link ?? "");
    const secondToken = tokenFromLink(email.deliveries[1]?.link ?? "");
    expect(email.deliveries[1]).toMatchObject({
      email: "buyer@flow.magic.test",
      locale: "vi",
    });
    expect(email.deliveries[1]?.link).toMatch(
      /^https:\/\/app\.kitvera\.test\/vi\/auth\/magic-link#token=[A-Za-z0-9_-]{43}$/,
    );

    const rows = await prisma.magicLinkToken.findMany({
      where: { normalizedEmail: "buyer@flow.magic.test" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.tokenHash).toBe(crypto.hashMagicLinkToken(firstToken));
    expect(rows[1]?.tokenHash).toBe(crypto.hashMagicLinkToken(secondToken));
    expect(JSON.stringify(rows)).not.toContain(firstToken);
    expect(JSON.stringify(rows)).not.toContain(secondToken);
    expect(rows[0]?.revokedAt).not.toBeNull();
    expect(rows[1]?.revokedAt).toBeNull();
    expect((rows[1]?.expiresAt.getTime() ?? 0) - (rows[1]?.createdAt.getTime() ?? 0))
      .toBe(15 * 60_000);
    expect(JSON.stringify(await prisma.authSecurityEvent.findMany()))
      .not.toContain(firstToken);
    expect(JSON.stringify(await prisma.authSecurityEvent.findMany()))
      .not.toContain(secondToken);
  });

  it("keeps existing-account initiation indistinguishable and pending", async () => {
    await prisma.user.create({
      data: { normalizedEmail: "existing@account.magic.test" },
    });

    const response = await request(app.getHttpServer())
      .post("/v1/auth/magic-links")
      .send({ email: "existing@account.magic.test", locale: "vi" })
      .expect(202);

    expect(JSON.parse(response.text)).toEqual({ status: "accepted" });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.magicLinkToken.findFirstOrThrow()).toMatchObject({
      normalizedEmail: "existing@account.magic.test",
      userId: null,
    });
  });

  it("enforces exact email limits under concurrency while preserving generic 202", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app.getHttpServer())
          .post("/v1/auth/magic-links")
          .send({ email: "concurrent@email.magic.test", locale: "en" }),
      ),
    );

    expect(attempts.map(({ status }) => status)).toEqual([202, 202, 202, 202]);
    expect(email.deliveries).toHaveLength(3);
    expect(await prisma.authRateEvent.count()).toBe(4);
    expect(await prisma.magicLinkToken.count()).toBe(3);

    email.reset();
    await prisma.authSecurityEvent.deleteMany();
    await prisma.magicLinkToken.deleteMany();
    await prisma.authRateEvent.deleteMany();
    for (let attempt = 0; attempt < 11; attempt += 1) {
      if (attempt === 3 || attempt === 6 || attempt === 9) {
        await prisma.authRateEvent.updateMany({
          where: {
            normalizedEmail: "daily@email.magic.test",
            occurredAt: { gt: new Date(Date.now() - 15 * 60_000) },
          },
          data: { occurredAt: new Date(Date.now() - 16 * 60_000) },
        });
      }
      await request(app.getHttpServer())
        .post("/v1/auth/magic-links")
        .send({ email: "daily@email.magic.test", locale: "en" })
        .expect(202);
    }
    expect(email.deliveries).toHaveLength(10);
    expect(await prisma.magicLinkToken.count()).toBe(10);
  });

  it("enforces the exact source-IP initiation window under concurrency", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 21 }, (_, index) =>
        request(app.getHttpServer())
          .post("/v1/auth/magic-links")
          .send({ email: `ip-${index}@source.magic.test`, locale: "vi" }),
      ),
    );

    expect(attempts.every(({ status }) => status === 202)).toBe(true);
    expect(email.deliveries).toHaveLength(20);
    expect(await prisma.authRateEvent.count()).toBe(21);
    expect(await prisma.magicLinkToken.count()).toBe(20);
  });

  it("equalizes delivered, suppressed, failed, and limited generic responses", async () => {
    const outcomes = [];
    outcomes.push(await request(app.getHttpServer())
      .post("/v1/auth/magic-links")
      .send({ email: "equalized@delivery.magic.test", locale: "vi" }));

    email.outcome = { status: "suppressed" };
    outcomes.push(await request(app.getHttpServer())
      .post("/v1/auth/magic-links")
      .send({ email: "equalized@delivery.magic.test", locale: "vi" }));

    email.failure = new Error("provider unavailable");
    outcomes.push(await request(app.getHttpServer())
      .post("/v1/auth/magic-links")
      .send({ email: "equalized@delivery.magic.test", locale: "vi" }));
    outcomes.push(await request(app.getHttpServer())
      .post("/v1/auth/magic-links")
      .send({ email: "equalized@delivery.magic.test", locale: "vi" }));

    expect(outcomes.map(({ status, body }) => ({ status, body }))).toEqual(
      Array.from({ length: 4 }, () => ({
        status: 202,
        body: { status: "accepted" },
      })),
    );
    expect(equalizer.startedAtValues).toHaveLength(4);
    expect(email.deliveries).toHaveLength(3);

    const live = await prisma.magicLinkToken.count({ where: { revokedAt: null } });
    expect(live).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.authSecurityEvent.count({
      where: { kind: "magicLinkIssueFailed" },
    })).toBe(2);
  });

  it("creates the customer and secure session only on successful redemption", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/magic-links")
      .send({
        email: "first@redeem.magic.test",
        locale: "en",
        returnTo: "/en/wishlist",
      })
      .expect(202);
    expect(await prisma.user.count()).toBe(0);

    const token = tokenFromLink(email.deliveries[0]?.link ?? "");
    const response = await request(app.getHttpServer())
      .post("/v1/auth/magic-link-redemptions")
      .send({ token })
      .expect(201);
    const body = magicLinkRedemptionResponseSchema.parse(JSON.parse(response.text));

    expect(body).toMatchObject({
      user: { email: "first@redeem.magic.test" },
      returnTo: "/en/wishlist",
    });
    expect(response.headers["set-cookie"]?.[0]).toMatch(
      /^__Host-kitvera_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
    );
    const user = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: "first@redeem.magic.test" },
      include: { roleAssignments: true, sellerProfile: true },
    });
    expect(user.roleAssignments).toEqual([]);
    expect(user.sellerProfile).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.magicLinkToken.findFirstOrThrow()).toMatchObject({
      userId: user.id,
      consumedAt: expect.any(Date),
    });
    expect(response.text).not.toContain(token);
  });

  it("returns one fixed 401 for unknown, expired, revoked, and consumed links", async () => {
    const cases = ["expired", "revoked", "consumed"] as const;
    const tokens: string[] = [];
    for (const state of cases) {
      await prisma.authRateEvent.deleteMany();
      email.reset();
      await request(app.getHttpServer())
        .post("/v1/auth/magic-links")
        .send({ email: `${state}@invalid.magic.test`, locale: "vi" })
        .expect(202);
      const token = tokenFromLink(email.deliveries[0]?.link ?? "");
      tokens.push(token);
      await prisma.magicLinkToken.update({
        where: { tokenHash: crypto.hashMagicLinkToken(token) },
        data:
          state === "expired"
            ? { expiresAt: new Date(Date.now() - 1_000) }
            : state === "revoked"
              ? { revokedAt: new Date() }
              : { consumedAt: new Date() },
      });
    }
    tokens.push(Buffer.alloc(32, 99).toString("base64url"));

    for (const token of tokens) {
      const response = await request(app.getHttpServer())
        .post("/v1/auth/magic-link-redemptions")
        .send({ token })
        .expect(401);
      expect(JSON.parse(response.text)).toEqual({
        error: {
          code: "MAGIC_LINK_INVALID_OR_EXPIRED",
          message: "Magic link is invalid or expired",
        },
      });
    }
  });

  it("allows exactly ten concurrent redemptions per source-IP window", async () => {
    const tokens: string[] = [];
    for (let index = 0; index < 11; index += 1) {
      await request(app.getHttpServer())
        .post("/v1/auth/magic-links")
        .send({ email: `redeem-rate-${index}@ip.magic.test`, locale: "en" })
        .expect(202);
      tokens.push(tokenFromLink(email.deliveries[index]?.link ?? ""));
    }

    const responses = await Promise.all(
      tokens.map((token) =>
        request(app.getHttpServer())
          .post("/v1/auth/magic-link-redemptions")
          .send({ token }),
      ),
    );
    expect(responses.filter(({ status }) => status === 201)).toHaveLength(10);
    expect(responses.filter(({ status }) => status === 401)).toHaveLength(1);
    expect(await prisma.user.count()).toBe(10);
    expect(await prisma.session.count()).toBe(10);
    expect(await prisma.authRateEvent.count({
      where: { action: "magicLinkRedemption" },
    })).toBe(11);
  });

  it("atomically converges a concurrent double redemption to one user and session", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/magic-links")
      .send({ email: "race@redeem.magic.test", locale: "vi" })
      .expect(202);
    const token = tokenFromLink(email.deliveries[0]?.link ?? "");

    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post("/v1/auth/magic-link-redemptions")
          .send({ token }),
      ),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 401]);
    expect(await prisma.user.count({
      where: { normalizedEmail: "race@redeem.magic.test" },
    })).toBe(1);
    expect(await prisma.session.count()).toBe(1);
  });
});
