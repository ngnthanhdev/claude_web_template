import cookie from "@fastify/cookie";
import { Module, VersioningType } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import {
  base64Url256BitTokenSchema,
  currentSessionResponseSchema,
} from "@marketplace/shared/auth";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ApiExceptionFilter } from "../../common/filters/api-exception.filter.js";
import type { Env } from "../../config/env.js";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { SESSION_COOKIE_NAME } from "../core/auth-cookie.js";
import { AuthCryptoService } from "../core/auth-crypto.service.js";
import {
  AUTH_CLOCK,
  type AuthClock,
  AuthSessionService,
} from "../core/auth-session.service.js";
import { SessionsModule } from "./sessions.module.js";

const integrationDatabaseUrl = process.env.SESSIONS_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

const DAY = 24 * 60 * 60_000;
const initialTime = new Date("2026-07-22T00:00:00.000Z");
const users = {
  first: {
    id: "70000000-0000-4000-8000-000000000001",
    normalizedEmail: "session-first@example.com",
  },
  second: {
    id: "70000000-0000-4000-8000-000000000002",
    normalizedEmail: "session-second@example.com",
  },
} as const;

const secret = (byte: string): string =>
  Buffer.alloc(32, byte).toString("base64url");

const testEnvironment = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL:
    integrationDatabaseUrl ?? "postgresql://database.invalid/sessions_test",
  CORS_ORIGIN: "https://app.kitvera.test",
  PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
  CATALOGUE_CURSOR_SIGNING_SECRET: secret("a"),
  AUTH_MAGIC_LINK_HASH_SECRET: secret("b"),
  AUTH_SESSION_HASH_SECRET: secret("c"),
  AUTH_CSRF_HASH_SECRET: secret("d"),
  AUTH_SOURCE_IP_HASH_SECRET: secret("e"),
} satisfies Env;

class MutableClock implements AuthClock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(value: Date): void {
    this.current = new Date(value);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => testEnvironment],
    }),
    PrismaModule,
    SessionsModule,
  ],
})
class SessionsIntegrationModule {}

function cookieHeader(rawSessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

function headerValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value;
  }
  return [];
}

function replacementBearer(setCookieHeader: unknown): string {
  const sessionCookie = headerValues(setCookieHeader).find((value) =>
    value.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  const rawValue = sessionCookie
    ?.slice(`${SESSION_COOKIE_NAME}=`.length)
    .split(";", 1)[0];
  return base64Url256BitTokenSchema.parse(rawValue);
}

describeWithPostgres("Sessions resources with PostgreSQL", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let sessions: AuthSessionService;
  let crypto: AuthCryptoService;
  const clock = new MutableClock(initialTime);

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) {
      throw new Error("SESSIONS_INTEGRATION_DATABASE_URL is required");
    }
    prisma = new PrismaClient({
      datasources: { db: { url: integrationDatabaseUrl } },
    });
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      imports: [SessionsIntegrationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AUTH_CLOCK)
      .useValue(clock)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    sessions = app.get(AuthSessionService);
    crypto = app.get(AuthCryptoService);
  });

  beforeEach(async () => {
    clock.set(initialTime);
    await prisma.authSecurityEvent.deleteMany();
    await prisma.session.deleteMany();
    await prisma.magicLinkToken.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.sellerProfile.deleteMany();
    await prisma.user.deleteMany({
      where: { normalizedEmail: { startsWith: "session-" } },
    });
    await prisma.user.createMany({ data: [users.first, users.second] });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("updates activity, rotates once at 24 hours, preserves the absolute deadline, and rejects replay", async () => {
    const issued = await sessions.createSession(users.first.id);

    const initial = await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(issued.sessionToken))
      .expect(200);
    expect(currentSessionResponseSchema.parse(initial.body).session.expiresAt).toBe(
      issued.absoluteExpiresAt.toISOString(),
    );
    expect(initial.headers["set-cookie"]).toBeUndefined();

    clock.advance(DAY - 1);
    const beforeRotation = await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(issued.sessionToken))
      .expect(200);
    expect(beforeRotation.headers["set-cookie"]).toBeUndefined();

    clock.advance(1);
    const rotation = await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(issued.sessionToken))
      .expect(200);
    const rotatedResponse = currentSessionResponseSchema.parse(rotation.body);
    const replacement = replacementBearer(rotation.headers["set-cookie"]);
    expect(rotatedResponse.session.expiresAt).toBe(
      issued.absoluteExpiresAt.toISOString(),
    );

    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(issued.sessionToken))
      .expect(401);
    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(replacement))
      .expect(200);

    const chain = await prisma.session.findMany({
      where: { userId: users.first.id },
      orderBy: { createdAt: "asc" },
    });
    expect(chain).toHaveLength(2);
    expect(chain[0]?.rotatedToId).toBe(chain[1]?.id);
    expect(chain[0]?.revokedAt).not.toBeNull();
    expect(chain[1]?.absoluteExpiresAt).toEqual(issued.absoluteExpiresAt);
  });

  it("rejects both exact idle and absolute expiry boundaries", async () => {
    const idleSession = await sessions.createSession(users.first.id);
    clock.advance(30 * DAY);
    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(idleSession.sessionToken))
      .expect(401);

    clock.set(initialTime);
    const absoluteToken = Buffer.alloc(32, 88).toString("base64url");
    const absoluteCsrf = crypto.deriveCsrfToken(absoluteToken);
    const absoluteDeadline = new Date(initialTime.getTime() + 90 * DAY);
    const recentActivity = new Date(initialTime.getTime() + 89 * DAY);
    await prisma.session.create({
      data: {
        userId: users.first.id,
        tokenHash: crypto.hashSessionToken(absoluteToken),
        csrfHash: crypto.hashCsrfToken(absoluteCsrf),
        idleExpiresAt: absoluteDeadline,
        absoluteExpiresAt: absoluteDeadline,
        lastActivityAt: recentActivity,
        lastRotatedAt: recentActivity,
        createdAt: initialTime,
      },
    });

    clock.set(absoluteDeadline);
    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(absoluteToken))
      .expect(401);
  });

  it("enforces CSRF, current-only logout, exact clearing, and cross-user isolation", async () => {
    const firstCurrent = await sessions.createSession(users.first.id);
    const firstOther = await sessions.createSession(users.first.id);
    const secondCurrent = await sessions.createSession(users.second.id);

    await request(app.getHttpServer())
      .delete("/v1/sessions/current")
      .set("Cookie", cookieHeader(firstCurrent.sessionToken))
      .expect(403);
    await request(app.getHttpServer())
      .delete("/v1/sessions/current")
      .set("Cookie", cookieHeader(firstCurrent.sessionToken))
      .set("X-CSRF-Token", secondCurrent.csrfToken)
      .expect(403);

    const currentLogout = await request(app.getHttpServer())
      .delete("/v1/sessions/current")
      .set("Cookie", cookieHeader(firstCurrent.sessionToken))
      .set("X-CSRF-Token", firstCurrent.csrfToken)
      .expect(204);
    expect(currentLogout.text).toBe("");
    expect(headerValues(currentLogout.headers["set-cookie"])).toEqual([
      `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
    ]);
    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(firstCurrent.sessionToken))
      .expect(401);
    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(firstOther.sessionToken))
      .expect(200);

    await request(app.getHttpServer())
      .delete("/v1/sessions")
      .set("Cookie", cookieHeader(firstOther.sessionToken))
      .set("X-CSRF-Token", firstOther.csrfToken)
      .send({ userId: users.second.id, role: "admin" })
      .expect(204);
    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(firstOther.sessionToken))
      .expect(401);
    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(secondCurrent.sessionToken))
      .expect(200);
  });

  it("serializes concurrent rotation and revocation without replay or bearer logging", async () => {
    const issued = await sessions.createSession(users.first.id);
    clock.advance(DAY);
    const concurrentRotation = await Promise.all([
      request(app.getHttpServer())
        .get("/v1/sessions/current")
        .set("Cookie", cookieHeader(issued.sessionToken)),
      request(app.getHttpServer())
        .get("/v1/sessions/current")
        .set("Cookie", cookieHeader(issued.sessionToken)),
    ]);
    expect(concurrentRotation.map(({ status }) => status).sort()).toEqual([200, 401]);
    const winner = concurrentRotation.find(({ status }) => status === 200);
    const replacement = replacementBearer(winner?.headers["set-cookie"]);
    const winnerBody = currentSessionResponseSchema.parse(winner?.body);

    const concurrentRevocation = await Promise.all([
      request(app.getHttpServer())
        .delete("/v1/sessions/current")
        .set("Cookie", cookieHeader(replacement))
        .set("X-CSRF-Token", winnerBody.csrfToken),
      request(app.getHttpServer())
        .delete("/v1/sessions")
        .set("Cookie", cookieHeader(replacement))
        .set("X-CSRF-Token", winnerBody.csrfToken),
    ]);
    expect(
      concurrentRevocation.map(({ status }) => status).every((status) =>
        status === 204 || status === 401,
      ),
    ).toBe(true);
    expect(concurrentRevocation.some(({ status }) => status === 204)).toBe(true);
    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", cookieHeader(replacement))
      .expect(401);

    const events = await prisma.authSecurityEvent.findMany({
      where: { userId: users.first.id },
    });
    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).not.toContain(issued.sessionToken);
    expect(serializedEvents).not.toContain(replacement);
    expect(serializedEvents).not.toContain(issued.csrfToken);
    expect(serializedEvents).not.toContain(winnerBody.csrfToken);
  });
});
