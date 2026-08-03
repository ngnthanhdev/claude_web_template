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
  adminMfaEnrollConfirmResponseSchema,
  adminMfaEnrollStartResponseSchema,
  adminMfaRecoveryRegenerateResponseSchema,
  adminMfaVerifyResponseSchema,
} from "@marketplace/shared/admin";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApp } from "../../bootstrap/configure-app.js";
import { SESSION_COOKIE_NAME } from "../../auth/core/auth-cookie.js";
import { AuthSessionService } from "../../auth/core/auth-session.service.js";
import type { Env } from "../../config/env.js";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AdminMfaModule } from "./admin-mfa.module.js";
import {
  base32Decode,
  decryptTotpSecret,
  generateTotpCode,
  hashRecoveryCode,
} from "./totp.js";

const integrationDatabaseUrl = process.env.ADMIN_MFA_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

const secret = (byte: number): string =>
  Buffer.alloc(32, byte).toString("base64url");
const encryptionKey = secret(8);

function testEnvironment(): Env {
  return {
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL:
      integrationDatabaseUrl ?? "postgresql://database.invalid/admin_mfa_test",
    CORS_ORIGIN: "https://app.kitvera.test",
    PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
    CATALOGUE_CURSOR_SIGNING_SECRET: secret(1),
    AUTH_MAGIC_LINK_HASH_SECRET: secret(2),
    AUTH_SESSION_HASH_SECRET: secret(3),
    AUTH_CSRF_HASH_SECRET: secret(4),
    AUTH_SOURCE_IP_HASH_SECRET: secret(5),
    DOWNLOAD_TOKEN_HMAC_SECRET: secret(6),
    FACTORY_INGEST_HMAC_SECRET: secret(7),
    LOCAL_ARTIFACT_STORAGE_DIR: "/tmp/kitvera-admin-mfa-test-artifacts",
    ADMIN_MFA_SECRET_ENCRYPTION_KEY: encryptionKey,
    // Enforced (not the ambient test-script default) so the
    // `recovery-codes` route's `AdminMfaEnforcementGuard` is meaningfully
    // exercised end to end, not a guaranteed pass-through.
    ADMIN_MFA_ENFORCED: true,
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
    AdminMfaModule,
  ],
})
class AdminMfaIntegrationModule {}

const ids = {
  adminUser: "f1000000-0000-4000-8000-000000000001",
  nonAdminUser: "f1000000-0000-4000-8000-000000000002",
  rateLimitedAdmin: "f1000000-0000-4000-8000-000000000003",
  adminRole: "f2000000-0000-4000-8000-000000000001",
};

/**
 * The `admin` `Role` row is already seeded (idempotently) by the
 * `20260803000000_admin_surface` migration on any freshly-migrated database
 * — upsert, never `create`, to avoid colliding with it (the same trap the
 * Layer-8 seller integration seed and the admin-core integration seed both
 * document).
 */
async function seedAdminMfaFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.user.createMany({
    data: [
      { id: ids.adminUser, normalizedEmail: "admin-mfa-happy@example.com" },
      {
        id: ids.nonAdminUser,
        normalizedEmail: "admin-mfa-nonadmin@example.com",
      },
      {
        id: ids.rateLimitedAdmin,
        normalizedEmail: "admin-mfa-ratelimit@example.com",
      },
    ],
  });
  const adminRole = await prisma.role.upsert({
    where: { key: "admin" },
    update: {},
    create: { id: ids.adminRole, key: "admin" },
    select: { id: true },
  });
  await prisma.userRole.createMany({
    data: [
      { userId: ids.adminUser, roleId: adminRole.id },
      { userId: ids.rateLimitedAdmin, roleId: adminRole.id },
    ],
  });
}

function cookieHeader(rawSessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

describeWithPostgres("Admin MFA PostgreSQL integration", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let sessions: AuthSessionService;

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) {
      throw new Error("ADMIN_MFA_INTEGRATION_DATABASE_URL is required");
    }
    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();
    await seedAdminMfaFixtures(prisma);

    const moduleRef = await Test.createTestingModule({
      imports: [AdminMfaIntegrationModule],
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
      sessionId: issued.sessionId,
    };
  }

  it("rejects a non-admin session with 403 before any factor is created", async () => {
    const nonAdmin = await issueSession(ids.nonAdminUser);

    const response = await request(app.getHttpServer())
      .post("/v1/admin/mfa/enroll")
      .set("Cookie", nonAdmin.cookie)
      .set("X-CSRF-Token", nonAdmin.csrfToken)
      .send({})
      .expect(403);
    expect(apiErrorSchema.parse(response.body).error.message).toBeTruthy();
    expect(
      await prisma.adminMfaFactor.count({
        where: { userId: ids.nonAdminUser },
      }),
    ).toBe(0);
  });

  it("enrolls, confirms, and step-up verifies a TOTP factor end to end; recovery codes are hashed at rest, single-use, and gate a post-enrollment sensitive action", async () => {
    const admin = await issueSession(ids.adminUser);

    // Before enrollment there is no confirmed factor at all, so the
    // sensitive recovery-codes action is unreachable.
    await request(app.getHttpServer())
      .post("/v1/admin/mfa/recovery-codes")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({})
      .expect(403);

    const enrollResponse = await request(app.getHttpServer())
      .post("/v1/admin/mfa/enroll")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({})
      .expect(200);
    const enrolled = adminMfaEnrollStartResponseSchema.parse(
      enrollResponse.body,
    );

    const storedFactor = await prisma.adminMfaFactor.findUniqueOrThrow({
      where: { id: enrolled.factorId },
    });
    expect(storedFactor.confirmedAt).toBeNull();
    // The stored form is the AES-GCM envelope, never the plaintext secret in
    // any encoding, anywhere in the row.
    expect(storedFactor.encryptedSecret).not.toBe(enrolled.secret);
    expect(storedFactor.encryptedSecret).not.toContain(enrolled.secret);
    const rawSecret = decryptTotpSecret(
      Buffer.from(encryptionKey, "base64url"),
      storedFactor.encryptedSecret,
    );
    expect(rawSecret).toEqual(base32Decode(enrolled.secret));

    const rejectedConfirm = await request(app.getHttpServer())
      .post("/v1/admin/mfa/confirm")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ factorId: enrolled.factorId, code: "000000" })
      .expect(403);
    expect(
      apiErrorSchema.parse(rejectedConfirm.body).error.message,
    ).toBeTruthy();

    const confirmResponse = await request(app.getHttpServer())
      .post("/v1/admin/mfa/confirm")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ factorId: enrolled.factorId, code: generateTotpCode(rawSecret) })
      .expect(200);
    const confirmed = adminMfaEnrollConfirmResponseSchema.parse(
      confirmResponse.body,
    );
    expect(confirmed.recoveryCodes).toHaveLength(10);

    const recoveryRows = await prisma.adminMfaRecoveryCode.findMany({
      where: { factorId: enrolled.factorId },
    });
    expect(recoveryRows).toHaveLength(10);
    for (const code of confirmed.recoveryCodes) {
      expect(
        recoveryRows.some((row) => row.codeHash === hashRecoveryCode(code)),
      ).toBe(true);
    }
    expect(JSON.stringify(recoveryRows)).not.toContain(
      confirmed.recoveryCodes[0],
    );

    const auditRow = await prisma.adminAuditLog.findFirstOrThrow({
      where: {
        targetType: "adminMfaFactor",
        targetId: enrolled.factorId,
        action: "mfaEnrolled",
      },
    });
    expect(auditRow.actingAdminId).toBe(ids.adminUser);
    expect(JSON.stringify(auditRow)).not.toContain(rawSecret.toString("hex"));

    // Still blocked: confirmed, but no recent step-up verification yet.
    await request(app.getHttpServer())
      .post("/v1/admin/mfa/recovery-codes")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({})
      .expect(403);

    const verifyResponse = await request(app.getHttpServer())
      .post("/v1/admin/mfa/verify")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ code: generateTotpCode(rawSecret) })
      .expect(200);
    adminMfaVerifyResponseSchema.parse(verifyResponse.body);
    expect(
      await prisma.adminMfaSession.count({
        where: { sessionId: admin.sessionId },
      }),
    ).toBeGreaterThan(0);

    const regenerateResponse = await request(app.getHttpServer())
      .post("/v1/admin/mfa/recovery-codes")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({})
      .expect(200);
    const regenerated = adminMfaRecoveryRegenerateResponseSchema.parse(
      regenerateResponse.body,
    );
    expect(regenerated.recoveryCodes).toHaveLength(10);
    expect(regenerated.recoveryCodes).not.toEqual(confirmed.recoveryCodes);

    // The recovery-code batch issued at confirm time is fully replaced by
    // regeneration — none of the old codes work any more.
    await request(app.getHttpServer())
      .post("/v1/admin/mfa/verify")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ code: confirmed.recoveryCodes[0] })
      .expect(403);

    // A freshly-regenerated recovery code works exactly once.
    const newCode = regenerated.recoveryCodes[0] as string;
    await request(app.getHttpServer())
      .post("/v1/admin/mfa/verify")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ code: newCode })
      .expect(200);
    const usedRow = await prisma.adminMfaRecoveryCode.findFirstOrThrow({
      where: { codeHash: hashRecoveryCode(newCode) },
    });
    expect(usedRow.usedAt).not.toBeNull();
    await request(app.getHttpServer())
      .post("/v1/admin/mfa/verify")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ code: newCode })
      .expect(403);
  });

  it("bounds failed admin-MFA-verification attempts to the shared rate-limit window", async () => {
    const admin = await issueSession(ids.rateLimitedAdmin);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app.getHttpServer())
        .post("/v1/admin/mfa/verify")
        .set("Cookie", admin.cookie)
        .set("X-CSRF-Token", admin.csrfToken)
        .send({ code: "000000" })
        .expect(403);
    }

    expect(
      await prisma.authRateEvent.count({
        where: {
          action: "adminMfaVerification",
          normalizedEmail: ids.rateLimitedAdmin,
        },
      }),
    ).toBe(5);
  });
});
