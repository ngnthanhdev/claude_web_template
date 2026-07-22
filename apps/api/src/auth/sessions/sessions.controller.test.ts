import cookie from "@fastify/cookie";
import { HttpStatus, VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import {
  currentSessionResponseSchema,
} from "@marketplace/shared/auth";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiExceptionFilter } from "../../common/filters/api-exception.filter.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { clearSessionCookie, SESSION_COOKIE_NAME } from "../core/auth-cookie.js";
import { AuthCryptoService } from "../core/auth-crypto.service.js";
import {
  AUTH_CLOCK,
  AuthSessionService,
} from "../core/auth-session.service.js";
import { SessionAuthGuard } from "./session-auth.guard.js";
import { SessionCsrfGuard } from "./session-csrf.guard.js";
import { SessionsController } from "./sessions.controller.js";

const rawSessionToken = Buffer.alloc(32, 11).toString("base64url");
const replacementSessionToken = Buffer.alloc(32, 12).toString("base64url");
const csrfToken = Buffer.alloc(32, 13).toString("base64url");
const sessionId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const absoluteExpiresAt = new Date("2026-10-20T00:00:00.000Z");
const idleExpiresAt = new Date("2026-08-21T00:00:00.000Z");

describe("SessionsController", () => {
  let app: NestFastifyApplication;
  const sessions = {
    resolveSession: vi.fn(),
    verifyCsrf: vi.fn(),
    revokeCurrentSession: vi.fn(),
    revokeAllSessions: vi.fn(),
  };
  const crypto = {
    hashSessionToken: vi.fn(),
    deriveCsrfToken: vi.fn(),
  };
  const clock = { now: vi.fn() };
  const prisma = { session: { findUnique: vi.fn() } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        SessionAuthGuard,
        SessionCsrfGuard,
        { provide: AuthSessionService, useValue: sessions },
        { provide: AuthCryptoService, useValue: crypto },
        { provide: AUTH_CLOCK, useValue: clock },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clock.now.mockReturnValue(new Date("2026-07-22T00:00:00.000Z"));
    crypto.hashSessionToken.mockReturnValue("stored-session-hash");
    crypto.deriveCsrfToken.mockReturnValue(csrfToken);
    prisma.session.findUnique.mockResolvedValue({
      id: sessionId,
      userId,
      csrfHash: "stored-csrf-hash",
      idleExpiresAt,
      absoluteExpiresAt,
      lastActivityAt: new Date("2026-07-22T00:00:00.000Z"),
      lastRotatedAt: new Date("2026-07-22T00:00:00.000Z"),
      revokedAt: null,
      rotatedToId: null,
      user: { id: userId, normalizedEmail: "buyer@example.com" },
    });
    sessions.resolveSession.mockResolvedValue({
      sessionId,
      user: { id: userId, email: "buyer@example.com" },
      csrfToken,
      idleExpiresAt,
      absoluteExpiresAt,
      replacementSessionToken: null,
    });
    sessions.verifyCsrf.mockReturnValue(true);
    sessions.revokeCurrentSession.mockResolvedValue(true);
    sessions.revokeAllSessions.mockResolvedValue(2);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the shared 401 envelope when the session cookie is absent", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .expect(HttpStatus.UNAUTHORIZED);

    expect(response.body).toEqual({
      error: {
        code: "SESSION_UNAUTHENTICATED",
        message: "Authentication is required",
      },
    });
    expect(crypto.hashSessionToken).not.toHaveBeenCalled();
  });

  it("rejects unknown and revoked bearer values before a handler runs", async () => {
    sessions.resolveSession.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawSessionToken}`)
      .expect(HttpStatus.UNAUTHORIZED);

    prisma.session.findUnique.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .delete("/v1/sessions/current")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawSessionToken}`)
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it("returns only allowlisted server-resolved state and emits a rotated cookie", async () => {
    sessions.resolveSession.mockResolvedValueOnce({
      sessionId,
      user: { id: userId, email: "buyer@example.com" },
      csrfToken,
      idleExpiresAt,
      absoluteExpiresAt,
      replacementSessionToken,
    });

    const response = await request(app.getHttpServer())
      .get("/v1/sessions/current")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawSessionToken}`)
      .expect(HttpStatus.OK);

    expect(currentSessionResponseSchema.parse(response.body)).toEqual({
      user: { id: userId, email: "buyer@example.com" },
      session: { id: sessionId, expiresAt: idleExpiresAt.toISOString() },
      csrfToken,
    });
    expect(String(response.headers["set-cookie"])).toContain(
      `${SESSION_COOKIE_NAME}=${replacementSessionToken}`,
    );
    expect(crypto.hashSessionToken).not.toHaveBeenCalled();
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("requires the session-bound CSRF token for both DELETE resources", async () => {
    const cookieHeader = `${SESSION_COOKIE_NAME}=${rawSessionToken}`;

    await request(app.getHttpServer())
      .delete("/v1/sessions/current")
      .set("Cookie", cookieHeader)
      .expect(HttpStatus.FORBIDDEN);

    sessions.verifyCsrf.mockReturnValueOnce(false);
    await request(app.getHttpServer())
      .delete("/v1/sessions")
      .set("Cookie", cookieHeader)
      .set("X-CSRF-Token", "wrong-token")
      .expect(HttpStatus.FORBIDDEN);

    expect(sessions.revokeCurrentSession).not.toHaveBeenCalled();
    expect(sessions.revokeAllSessions).not.toHaveBeenCalled();
    expect(sessions.resolveSession).not.toHaveBeenCalled();
  });

  it("revokes only the server-resolved current session and clears the exact host cookie", async () => {
    const response = await request(app.getHttpServer())
      .delete("/v1/sessions/current")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawSessionToken}`)
      .set("X-CSRF-Token", csrfToken)
      .expect(HttpStatus.NO_CONTENT);

    expect(response.text).toBe("");
    expect(sessions.verifyCsrf).toHaveBeenCalledWith(
      rawSessionToken,
      csrfToken,
      "stored-csrf-hash",
    );
    expect(sessions.revokeCurrentSession).toHaveBeenCalledWith(userId, sessionId);
    expect(response.headers["set-cookie"]).toEqual([
      `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
    ]);
  });

  it("revokes all sessions only for the server-resolved user", async () => {
    const response = await request(app.getHttpServer())
      .delete("/v1/sessions")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawSessionToken}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ userId: "90000000-0000-4000-8000-000000000009", role: "admin" })
      .expect(HttpStatus.NO_CONTENT);

    expect(response.text).toBe("");
    expect(sessions.revokeAllSessions).toHaveBeenCalledWith(userId);
    expect(sessions.revokeAllSessions).not.toHaveBeenCalledWith(
      "90000000-0000-4000-8000-000000000009",
    );
  });

  it("keeps the cookie clearing helper structural contract stable", () => {
    expect(typeof clearSessionCookie).toBe("function");
  });
});
