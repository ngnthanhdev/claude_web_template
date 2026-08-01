import { HttpStatus } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
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
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthCryptoService } from "../auth/core/auth-crypto.service.js";
import { AUTH_CLOCK } from "../auth/core/auth-session.service.js";
import { SessionAuthGuard } from "../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../auth/sessions/session-csrf.guard.js";
import { AuthSessionService } from "../auth/core/auth-session.service.js";
import { EntitlementsController } from "./entitlements.controller.js";
import { EntitlementsService } from "./entitlements.service.js";

const rawSessionToken = Buffer.alloc(32, 21).toString("base64url");
const csrfToken = Buffer.alloc(32, 22).toString("base64url");
const sessionId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const productId = "10000000-0000-4000-8000-000000000003";
const entitlementId = "10000000-0000-4000-8000-000000000004";
const idleExpiresAt = new Date("2026-08-21T00:00:00.000Z");
const absoluteExpiresAt = new Date("2026-10-20T00:00:00.000Z");

describe("EntitlementsController", () => {
  let app: NestFastifyApplication;
  const entitlements = {
    listLibrary: vi.fn(),
    issueDownload: vi.fn(),
  };
  const sessions = {
    resolveSession: vi.fn(),
    verifyCsrf: vi.fn(),
  };
  const crypto = {
    hashSessionToken: vi.fn(),
    deriveCsrfToken: vi.fn(),
  };
  const clock = { now: vi.fn() };
  const prisma = { session: { findUnique: vi.fn() } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EntitlementsController],
      providers: [
        { provide: EntitlementsService, useValue: entitlements },
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
    await configureApp(app);
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
    entitlements.listLibrary.mockResolvedValue({
      data: [],
      meta: { nextCursor: null, hasMore: false },
    });
    entitlements.issueDownload.mockResolvedValue({
      url: "/api/v1/downloads/token/opaque",
      expiresAt: "2026-07-22T00:05:00.000Z",
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires a session for the library and never reaches the service", async () => {
    await request(app.getHttpServer())
      .get("/v1/account/library")
      .expect(HttpStatus.UNAUTHORIZED);

    expect(entitlements.listLibrary).not.toHaveBeenCalled();
  });

  it("scopes the library listing to the server-resolved session user", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/account/library")
      .set("Cookie", `__Host-kitvera_session=${rawSessionToken}`)
      .expect(HttpStatus.OK);

    expect(response.body).toEqual({
      data: [],
      meta: { nextCursor: null, hasMore: false },
    });
    expect(entitlements.listLibrary).toHaveBeenCalledWith(userId, {
      limit: 20,
    });
  });

  it("rejects an out-of-range library limit with the shared 422 envelope", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/account/library?limit=999")
      .set("Cookie", `__Host-kitvera_session=${rawSessionToken}`)
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(response.body).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(entitlements.listLibrary).not.toHaveBeenCalled();
  });

  it("requires CSRF for download issuance and never reaches the service", async () => {
    await request(app.getHttpServer())
      .post(`/v1/entitlements/${entitlementId}/download`)
      .set("Cookie", `__Host-kitvera_session=${rawSessionToken}`)
      .send({ productId, version: "1.0.0" })
      .expect(HttpStatus.FORBIDDEN);

    expect(entitlements.issueDownload).not.toHaveBeenCalled();
  });

  it("issues a download only with a valid session, CSRF token, and body", async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/entitlements/${entitlementId}/download`)
      .set("Cookie", `__Host-kitvera_session=${rawSessionToken}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ productId, version: "1.0.0" })
      .expect(HttpStatus.OK);

    expect(response.body).toEqual({
      url: "/api/v1/downloads/token/opaque",
      expiresAt: "2026-07-22T00:05:00.000Z",
    });
    expect(entitlements.issueDownload).toHaveBeenCalledWith(
      userId,
      entitlementId,
      { productId, version: "1.0.0" },
      { ip: expect.any(String) },
    );
  });

  it("rejects a malformed download body before reaching the service", async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/entitlements/${entitlementId}/download`)
      .set("Cookie", `__Host-kitvera_session=${rawSessionToken}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ productId: "not-a-uuid", version: "1.0.0" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(response.body).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(entitlements.issueDownload).not.toHaveBeenCalled();
  });

  it("rejects a malformed entitlement id before reaching the service", async () => {
    await request(app.getHttpServer())
      .post("/v1/entitlements/not-a-uuid/download")
      .set("Cookie", `__Host-kitvera_session=${rawSessionToken}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ productId, version: "1.0.0" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(entitlements.issueDownload).not.toHaveBeenCalled();
  });
});
