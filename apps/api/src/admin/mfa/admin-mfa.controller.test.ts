import { HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { apiErrorSchema } from "@marketplace/shared/api";
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

import { configureApp } from "../../bootstrap/configure-app.js";
import { AuthCryptoService } from "../../auth/core/auth-crypto.service.js";
import { AuthRateLimitService } from "../../auth/core/auth-rate-limit.service.js";
import {
  AUTH_CLOCK,
  AuthSessionService,
  type AuthClock,
} from "../../auth/core/auth-session.service.js";
import { SESSION_COOKIE_NAME } from "../../auth/core/auth-cookie.js";
import { SessionAuthGuard } from "../../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../../auth/sessions/session-csrf.guard.js";
import type { Env } from "../../config/env.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AdminAuditService } from "../admin-audit.service.js";
import { AdminMfaEnforcementGuard } from "../admin-mfa-enforcement.guard.js";
import { AdminRolesGuard } from "../admin-roles.guard.js";
import { AdminMfaController } from "./admin-mfa.controller.js";
import { AdminMfaService } from "./admin-mfa.service.js";
import { decryptTotpSecret, generateTotpCode } from "./totp.js";

const rawSessionToken = Buffer.alloc(32, 41).toString("base64url");
const csrfToken = Buffer.alloc(32, 42).toString("base64url");
const sessionId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const factorId = "20000000-0000-4000-8000-000000000001";
const idleExpiresAt = new Date("2026-08-21T00:00:00.000Z");
const absoluteExpiresAt = new Date("2026-10-20T00:00:00.000Z");
const now = new Date("2026-08-03T00:00:00.000Z");
const encryptionKey = Buffer.alloc(32, 8).toString("base64url");

function cookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

function configWith(overrides: Partial<Env>): ConfigService<Env, true> {
  return {
    get: <K extends keyof Env>(key: K): Env[K] | undefined => overrides[key],
    getOrThrow: <K extends keyof Env>(key: K): Env[K] => {
      const value = overrides[key];
      if (value === undefined) throw new Error(`Missing env: ${String(key)}`);
      return value;
    },
  } as unknown as ConfigService<Env, true>;
}

describe("AdminMfaController", () => {
  let app: NestFastifyApplication;
  const mfa = {
    enrollStart: vi.fn(),
    confirm: vi.fn(),
    verify: vi.fn(),
    regenerateRecoveryCodes: vi.fn(),
  };
  const sessions = { resolveSession: vi.fn(), verifyCsrf: vi.fn() };
  const crypto = { hashSessionToken: vi.fn(), deriveCsrfToken: vi.fn() };
  const clock = { now: vi.fn() };
  const prisma = {
    session: { findUnique: vi.fn() },
    userRole: { findFirst: vi.fn() },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminMfaController],
      providers: [
        SessionAuthGuard,
        SessionCsrfGuard,
        AdminRolesGuard,
        AdminMfaEnforcementGuard,
        { provide: AdminMfaService, useValue: mfa },
        { provide: AuthSessionService, useValue: sessions },
        { provide: AuthCryptoService, useValue: crypto },
        { provide: AUTH_CLOCK, useValue: clock },
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: configWith({ NODE_ENV: "test", ADMIN_MFA_ENFORCED: false }),
        },
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
    clock.now.mockReturnValue(now);
    crypto.hashSessionToken.mockReturnValue("stored-session-hash");
    crypto.deriveCsrfToken.mockReturnValue(csrfToken);
    prisma.session.findUnique.mockResolvedValue({
      id: sessionId,
      csrfHash: "stored-csrf-hash",
      idleExpiresAt,
      absoluteExpiresAt,
      revokedAt: null,
      rotatedToId: null,
      user: { id: userId, normalizedEmail: "admin@example.com" },
    });
    sessions.resolveSession.mockResolvedValue({
      sessionId,
      user: { id: userId, email: "admin@example.com" },
      csrfToken,
      idleExpiresAt,
      absoluteExpiresAt,
      replacementSessionToken: null,
    });
    sessions.verifyCsrf.mockReturnValue(true);
    prisma.userRole.findFirst.mockResolvedValue({ id: "role-assignment" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the shared 401 envelope when the session cookie is absent", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/admin/mfa/enroll")
      .send({})
      .expect(HttpStatus.UNAUTHORIZED);
    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "SESSION_UNAUTHENTICATED" },
    });
    expect(mfa.enrollStart).not.toHaveBeenCalled();
  });

  it("rejects a session without the admin role (403) on every route", async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);

    for (const [path, body] of [
      ["/v1/admin/mfa/enroll", {}],
      ["/v1/admin/mfa/confirm", { factorId, code: "123456" }],
      ["/v1/admin/mfa/verify", { code: "123456" }],
      ["/v1/admin/mfa/recovery-codes", {}],
    ] as const) {
      await request(app.getHttpServer())
        .post(path)
        .set("Cookie", cookieHeader())
        .set("X-CSRF-Token", csrfToken)
        .send(body)
        .expect(HttpStatus.FORBIDDEN);
    }
    expect(mfa.enrollStart).not.toHaveBeenCalled();
    expect(mfa.confirm).not.toHaveBeenCalled();
    expect(mfa.verify).not.toHaveBeenCalled();
    expect(mfa.regenerateRecoveryCodes).not.toHaveBeenCalled();
  });

  it("requires the session-bound CSRF token on every mutating route", async () => {
    for (const [path, body] of [
      ["/v1/admin/mfa/enroll", {}],
      ["/v1/admin/mfa/confirm", { factorId, code: "123456" }],
      ["/v1/admin/mfa/verify", { code: "123456" }],
      ["/v1/admin/mfa/recovery-codes", {}],
    ] as const) {
      await request(app.getHttpServer())
        .post(path)
        .set("Cookie", cookieHeader())
        .send(body)
        .expect(HttpStatus.FORBIDDEN);
    }
    expect(mfa.enrollStart).not.toHaveBeenCalled();
  });

  it("delegates enroll to the server-resolved admin id and session email only", async () => {
    mfa.enrollStart.mockResolvedValue({
      factorId,
      type: "totp",
      otpauthUri: "otpauth://totp/Kitvera%20Admin:admin@example.com?secret=ABC",
      secret: "JBSWY3DPEHPK3PXP",
    });

    const response = await request(app.getHttpServer())
      .post("/v1/admin/mfa/enroll")
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(HttpStatus.OK);

    expect(mfa.enrollStart).toHaveBeenCalledWith(
      userId,
      "admin@example.com",
      sessionId,
    );
    expect(JSON.parse(response.text)).not.toHaveProperty("encryptedSecret");
  });

  it("rejects a request that tries to smuggle a factorId/userId into verify's body", async () => {
    await request(app.getHttpServer())
      .post("/v1/admin/mfa/verify")
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ code: "123456", userId: "some-other-user" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(mfa.verify).not.toHaveBeenCalled();
  });

  it("delegates confirm to the server-resolved admin id and the parsed body", async () => {
    mfa.confirm.mockResolvedValue({
      factorId,
      confirmedAt: now.toISOString(),
      recoveryCodes: Array.from(
        { length: 10 },
        (_, index) => `CODE${index}CODE${index}`,
      ),
    });

    await request(app.getHttpServer())
      .post("/v1/admin/mfa/confirm")
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ factorId, code: "123456" })
      .expect(HttpStatus.OK);

    expect(mfa.confirm).toHaveBeenCalledWith(
      userId,
      { factorId, code: "123456" },
      { ip: expect.any(String) },
    );
  });

  it("delegates verify to the server-resolved admin id and the resolved session id", async () => {
    mfa.verify.mockResolvedValue({ verifiedAt: now.toISOString() });

    await request(app.getHttpServer())
      .post("/v1/admin/mfa/verify")
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ code: "123456" })
      .expect(HttpStatus.OK);

    expect(mfa.verify).toHaveBeenCalledWith(
      userId,
      sessionId,
      { code: "123456" },
      { ip: expect.any(String) },
    );
  });

  it("delegates recovery-codes regeneration to the server-resolved admin id", async () => {
    mfa.regenerateRecoveryCodes.mockResolvedValue({
      recoveryCodes: Array.from(
        { length: 10 },
        (_, index) => `CODE${index}CODE${index}`,
      ),
      regeneratedAt: now.toISOString(),
    });

    await request(app.getHttpServer())
      .post("/v1/admin/mfa/recovery-codes")
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(HttpStatus.OK);

    expect(mfa.regenerateRecoveryCodes).toHaveBeenCalledWith(userId);
  });
});

describe("AdminMfaService", () => {
  const prisma = {
    adminMfaFactor: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    adminMfaRecoveryCode: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    adminMfaSession: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  const rateLimit = { checkAdminMfaVerification: vi.fn() };
  const audit = { record: vi.fn() };
  const clock: AuthClock = { now: () => now };
  const config = configWith({
    NODE_ENV: "test",
    ADMIN_MFA_SECRET_ENCRYPTION_KEY: encryptionKey,
  });
  let service: AdminMfaService;

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.checkAdminMfaVerification.mockResolvedValue({
      allowed: true,
      sourceIpDigest: "ip-digest",
    });
    audit.record.mockResolvedValue({ id: "audit-row" });
    prisma.$transaction.mockImplementation(
      async (operation: (tx: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    service = new AdminMfaService(
      prisma as never,
      config,
      rateLimit as unknown as AuthRateLimitService,
      audit as unknown as AdminAuditService,
      clock,
    );
  });

  it("runs enroll -> confirm -> verify end to end, never leaking the encrypted-at-rest secret", async () => {
    prisma.adminMfaFactor.upsert.mockImplementation(
      (args: { create: { encryptedSecret: string } }) =>
        Promise.resolve({
          id: factorId,
          encryptedSecret: args.create.encryptedSecret,
        }),
    );

    const enrolled = await service.enrollStart(
      userId,
      "admin@example.com",
      sessionId,
    );
    expect(enrolled.factorId).toBe(factorId);
    expect(JSON.stringify(enrolled)).not.toContain(
      prisma.adminMfaFactor.upsert.mock.calls[0]?.[0]?.create?.encryptedSecret,
    );

    const encryptedSecret =
      prisma.adminMfaFactor.upsert.mock.calls[0]?.[0]?.create?.encryptedSecret;
    const rawSecret = decryptTotpSecret(
      Buffer.from(encryptionKey, "base64url"),
      encryptedSecret,
    );
    const validCode = generateTotpCode(rawSecret, now);

    prisma.adminMfaFactor.findFirst.mockResolvedValue({
      id: factorId,
      encryptedSecret,
    });

    const confirmed = await service.confirm(
      userId,
      { factorId, code: validCode },
      { ip: "127.0.0.1" },
    );
    expect(confirmed.recoveryCodes).toHaveLength(10);
    expect(JSON.stringify(confirmed)).not.toContain(encryptedSecret);
    expect(audit.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: "mfaEnrolled",
        targetType: "adminMfaFactor",
        targetId: factorId,
      }),
    );

    // Verify (TOTP branch) — the factor is now confirmed.
    const verified = await service.verify(
      userId,
      sessionId,
      { code: validCode },
      { ip: "127.0.0.1" },
    );
    expect(verified).toEqual({ verifiedAt: now.toISOString() });
    expect(prisma.adminMfaSession.create).toHaveBeenCalledWith({
      data: { sessionId, verifiedAt: now },
    });
  });

  it("rejects verify with a generic error when the rate limit denies the attempt", async () => {
    rateLimit.checkAdminMfaVerification.mockResolvedValue({
      allowed: false,
      sourceIpDigest: "ip-digest",
    });

    await expect(
      service.verify(
        userId,
        sessionId,
        { code: "000000" },
        { ip: "127.0.0.1" },
      ),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(prisma.adminMfaFactor.findFirst).not.toHaveBeenCalled();
  });

  it("hides a missing confirmed factor behind the same generic verify error", async () => {
    prisma.adminMfaFactor.findFirst.mockResolvedValue(null);

    await expect(
      service.verify(
        userId,
        sessionId,
        { code: "000000" },
        { ip: "127.0.0.1" },
      ),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it("consumes a recovery code exactly once", async () => {
    prisma.adminMfaFactor.findFirst.mockResolvedValue({
      id: factorId,
      encryptedSecret: "irrelevant-for-recovery-branch",
    });
    prisma.adminMfaRecoveryCode.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      service.verify(
        userId,
        sessionId,
        { code: "abcdefgh-abcdefgh" },
        { ip: "127.0.0.1" },
      ),
    ).resolves.toEqual({ verifiedAt: now.toISOString() });
    expect(prisma.adminMfaSession.create).toHaveBeenCalledTimes(1);

    prisma.adminMfaRecoveryCode.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.verify(
        userId,
        sessionId,
        { code: "abcdefgh-abcdefgh" },
        { ip: "127.0.0.1" },
      ),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(prisma.adminMfaSession.create).toHaveBeenCalledTimes(1);
  });

  it("regenerates recovery codes for a confirmed factor and audits the action", async () => {
    prisma.adminMfaFactor.findFirst.mockResolvedValue({ id: factorId });

    const regenerated = await service.regenerateRecoveryCodes(userId);

    expect(regenerated.recoveryCodes).toHaveLength(10);
    expect(prisma.adminMfaRecoveryCode.deleteMany).toHaveBeenCalledWith({
      where: { factorId },
    });
    expect(audit.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: "mfaRecoveryRegenerated",
        targetType: "adminMfaFactor",
        targetId: factorId,
      }),
    );
  });

  it("refuses to regenerate recovery codes without a confirmed factor", async () => {
    prisma.adminMfaFactor.findFirst.mockResolvedValue(null);

    await expect(service.regenerateRecoveryCodes(userId)).rejects.toMatchObject(
      {
        status: HttpStatus.NOT_FOUND,
      },
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe("re-enrollment step-up (design §6/§8)", () => {
    const enforcedConfig = configWith({
      NODE_ENV: "production",
      ADMIN_MFA_SECRET_ENCRYPTION_KEY: encryptionKey,
    });
    function enforcedService(): AdminMfaService {
      return new AdminMfaService(
        prisma as never,
        enforcedConfig,
        rateLimit as unknown as AuthRateLimitService,
        audit as unknown as AdminAuditService,
        clock,
      );
    }

    it("blocks re-enrolling over a confirmed factor without a recent step-up when enforced", async () => {
      prisma.adminMfaFactor.findUnique.mockResolvedValue({ confirmedAt: now });
      prisma.adminMfaSession.findFirst.mockResolvedValue(null);

      await expect(
        enforcedService().enrollStart(userId, "admin@example.com", sessionId),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      expect(prisma.adminMfaFactor.upsert).not.toHaveBeenCalled();
    });

    it("allows first-time enrollment (no confirmed factor) even when enforced", async () => {
      prisma.adminMfaFactor.findUnique.mockResolvedValue(null);
      prisma.adminMfaFactor.upsert.mockResolvedValue({ id: factorId });

      const enrolled = await enforcedService().enrollStart(
        userId,
        "admin@example.com",
        sessionId,
      );

      expect(enrolled.factorId).toBe(factorId);
      expect(prisma.adminMfaFactor.upsert).toHaveBeenCalledTimes(1);
    });

    it("allows re-enrollment when a recent step-up marker exists", async () => {
      prisma.adminMfaFactor.findUnique.mockResolvedValue({ confirmedAt: now });
      prisma.adminMfaSession.findFirst.mockResolvedValue({ sessionId });
      prisma.adminMfaFactor.upsert.mockResolvedValue({ id: factorId });

      const enrolled = await enforcedService().enrollStart(
        userId,
        "admin@example.com",
        sessionId,
      );

      expect(enrolled.factorId).toBe(factorId);
      expect(prisma.adminMfaFactor.upsert).toHaveBeenCalledTimes(1);
    });
  });
});
