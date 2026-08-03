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
  adminGrantRoleResponseSchema,
  adminRevokeRoleResponseSchema,
} from "@marketplace/shared/admin";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApp } from "../../bootstrap/configure-app.js";
import type { Env } from "../../config/env.js";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { SESSION_COOKIE_NAME } from "../../auth/core/auth-cookie.js";
import { AuthSessionService } from "../../auth/core/auth-session.service.js";
import { AdminUsersModule } from "./admin-users.module.js";

const integrationDatabaseUrl = process.env.ADMIN_USERS_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

const secret = (byte: number): string =>
  Buffer.alloc(32, byte).toString("base64url");

function testEnvironment(): Env {
  return {
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL:
      integrationDatabaseUrl ??
      "postgresql://database.invalid/admin_users_test",
    CORS_ORIGIN: "https://app.kitvera.test",
    PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
    CATALOGUE_CURSOR_SIGNING_SECRET: secret(1),
    AUTH_MAGIC_LINK_HASH_SECRET: secret(2),
    AUTH_SESSION_HASH_SECRET: secret(3),
    AUTH_CSRF_HASH_SECRET: secret(4),
    AUTH_SOURCE_IP_HASH_SECRET: secret(5),
    DOWNLOAD_TOKEN_HMAC_SECRET: secret(6),
    FACTORY_INGEST_HMAC_SECRET: secret(7),
    LOCAL_ARTIFACT_STORAGE_DIR: "/tmp/kitvera-admin-users-test-artifacts",
    ADMIN_MFA_SECRET_ENCRYPTION_KEY: secret(8),
    ADMIN_MFA_ENFORCED: false,
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
    AdminUsersModule,
  ],
})
class AdminUsersIntegrationModule {}

const ids = {
  admin: "f1000000-0000-4000-8000-000000000001",
  plainUser: "f1000000-0000-4000-8000-000000000002",
  granteeIdempotent: "f1000000-0000-4000-8000-000000000003",
  granteeRevoke: "f1000000-0000-4000-8000-000000000004",
};

/**
 * `admin`/`seller` `Role` rows are already seeded idempotently by the
 * `20260803000000_admin_surface` migration — upsert (never `create`) so this
 * seed replays cleanly against an already-migrated database.
 */
async function seedAdminUsersFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.user.createMany({
    data: [
      { id: ids.admin, normalizedEmail: "admin-user@example.com" },
      { id: ids.plainUser, normalizedEmail: "plain-user@example.com" },
      {
        id: ids.granteeIdempotent,
        normalizedEmail: "idempotent-grantee@example.com",
      },
      { id: ids.granteeRevoke, normalizedEmail: "revoke-grantee@example.com" },
    ],
  });
  const adminRole = await prisma.role.upsert({
    where: { key: "admin" },
    update: {},
    create: { key: "admin" },
    select: { id: true },
  });
  await prisma.role.upsert({
    where: { key: "seller" },
    update: {},
    create: { key: "seller" },
  });
  await prisma.userRole.create({
    data: { userId: ids.admin, roleId: adminRole.id },
  });
}

function cookieHeader(rawSessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

describeWithPostgres("Admin users PostgreSQL integration", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let sessions: AuthSessionService;

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) {
      throw new Error("ADMIN_USERS_INTEGRATION_DATABASE_URL is required");
    }
    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();
    await seedAdminUsersFixtures(prisma);

    const moduleRef = await Test.createTestingModule({
      imports: [AdminUsersIntegrationModule],
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
    };
  }

  it("rejects a session without the admin role", async () => {
    const plain = await issueSession(ids.plainUser);

    const response = await request(app.getHttpServer())
      .get("/v1/admin/users")
      .set("Cookie", plain.cookie)
      .expect(403);
    expect(apiErrorSchema.parse(response.body).error.message).toBeTruthy();
  });

  it("grants seller: creates the UserRole and a minimal SellerProfile, writing exactly one audit row, idempotently", async () => {
    const admin = await issueSession(ids.admin);

    const response = await request(app.getHttpServer())
      .post(`/v1/admin/users/${ids.granteeIdempotent}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ role: "seller" })
      .expect(200);
    const summary = adminGrantRoleResponseSchema.parse(response.body);
    expect(summary.roles).toEqual(["seller"]);

    const userRole = await prisma.userRole.findFirst({
      where: { userId: ids.granteeIdempotent, role: { key: "seller" } },
    });
    expect(userRole).not.toBeNull();

    const profile = await prisma.sellerProfile.findUnique({
      where: { ownerId: ids.granteeIdempotent },
    });
    expect(profile).not.toBeNull();

    const auditRows = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "userRole",
        targetId: ids.granteeIdempotent,
        action: "roleGranted",
      },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.actingAdminId).toBe(ids.admin);

    // Idempotent retry: no second UserRole/SellerProfile/audit row.
    await request(app.getHttpServer())
      .post(`/v1/admin/users/${ids.granteeIdempotent}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ role: "seller" })
      .expect(200);

    const auditRowsAfterRetry = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "userRole",
        targetId: ids.granteeIdempotent,
        action: "roleGranted",
      },
    });
    expect(auditRowsAfterRetry).toHaveLength(1);

    const profilesAfterRetry = await prisma.sellerProfile.findMany({
      where: { ownerId: ids.granteeIdempotent },
    });
    expect(profilesAfterRetry).toHaveLength(1);
  });

  it("revokes seller: removes the UserRole but preserves the SellerProfile", async () => {
    const admin = await issueSession(ids.admin);

    await request(app.getHttpServer())
      .post(`/v1/admin/users/${ids.granteeRevoke}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({ role: "seller" })
      .expect(200);
    const profileBefore = await prisma.sellerProfile.findUniqueOrThrow({
      where: { ownerId: ids.granteeRevoke },
    });

    const response = await request(app.getHttpServer())
      .delete(`/v1/admin/users/${ids.granteeRevoke}/roles/seller`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .expect(200);
    const summary = adminRevokeRoleResponseSchema.parse(response.body);
    expect(summary.roles).toEqual([]);

    const userRole = await prisma.userRole.findFirst({
      where: { userId: ids.granteeRevoke, role: { key: "seller" } },
    });
    expect(userRole).toBeNull();

    const profileAfter = await prisma.sellerProfile.findUnique({
      where: { ownerId: ids.granteeRevoke },
    });
    expect(profileAfter).not.toBeNull();
    expect(profileAfter?.id).toBe(profileBefore.id);

    const auditRows = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "userRole",
        targetId: ids.granteeRevoke,
        action: "roleRevoked",
      },
    });
    expect(auditRows).toHaveLength(1);
  });

  it("blocks an admin from revoking their own last admin role (422), leaving the grant intact", async () => {
    const admin = await issueSession(ids.admin);

    const response = await request(app.getHttpServer())
      .delete(`/v1/admin/users/${ids.admin}/roles/admin`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .expect(422);
    expect(apiErrorSchema.parse(response.body).error.message).toBeTruthy();

    const stillAdmin = await prisma.userRole.findFirst({
      where: { userId: ids.admin, role: { key: "admin" } },
    });
    expect(stillAdmin).not.toBeNull();
  });
});
