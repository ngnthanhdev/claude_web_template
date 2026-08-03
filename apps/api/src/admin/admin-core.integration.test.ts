import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Env } from "../config/env.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AdminAuditService } from "./admin-audit.service.js";
import { AdminBootstrapService } from "./admin-bootstrap.service.js";
import { AdminModule } from "./admin.module.js";

const integrationDatabaseUrl = process.env.ADMIN_CORE_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

const secret = (byte: number): string =>
  Buffer.alloc(32, byte).toString("base64url");

const ids = {
  auditActor: "80000000-0000-4000-8000-000000000001",
  bootstrapUser: "80000000-0000-4000-8000-000000000002",
  unlistedUser: "80000000-0000-4000-8000-000000000003",
};

const adminRoleId = "80000000-0000-4000-8000-000000000010";
const bootstrapEmail = "bootstrap-target@example.com";

function testEnvironment(): Env {
  return {
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL:
      integrationDatabaseUrl ?? "postgresql://database.invalid/admin_core_test",
    CORS_ORIGIN: "https://app.kitvera.test",
    PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
    CATALOGUE_CURSOR_SIGNING_SECRET: secret(1),
    AUTH_MAGIC_LINK_HASH_SECRET: secret(2),
    AUTH_SESSION_HASH_SECRET: secret(3),
    AUTH_CSRF_HASH_SECRET: secret(4),
    AUTH_SOURCE_IP_HASH_SECRET: secret(5),
    DOWNLOAD_TOKEN_HMAC_SECRET: secret(6),
    FACTORY_INGEST_HMAC_SECRET: secret(7),
    LOCAL_ARTIFACT_STORAGE_DIR: "/tmp/kitvera-admin-core-test-artifacts",
    ADMIN_MFA_SECRET_ENCRYPTION_KEY: secret(8),
    ADMIN_MFA_ENFORCED: false,
    ADMIN_BOOTSTRAP_EMAILS: bootstrapEmail,
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
    AdminModule,
  ],
})
class AdminCoreIntegrationModule {}

/**
 * The `admin` `Role` this suite exercises. Idempotent (`upsert`) rather than
 * `create`: the admin-surface migration already seeds `admin`/`seller`
 * `Role` rows, so a plain `create` against an already-migrated database
 * would collide on the unique `key` — the same seed-the-whole-guard trap the
 * Layer-8 seller integration seed hit, just on the insert side instead of
 * the assignment side.
 */
async function seedAdminCoreFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.role.upsert({
    where: { key: "admin" },
    update: {},
    create: { id: adminRoleId, key: "admin" },
  });
  await prisma.user.createMany({
    data: [
      { id: ids.auditActor, normalizedEmail: "audit-actor@example.com" },
      { id: ids.bootstrapUser, normalizedEmail: bootstrapEmail },
      { id: ids.unlistedUser, normalizedEmail: "unlisted@example.com" },
    ],
  });
}

describeWithPostgres("Admin core PostgreSQL integration", () => {
  let prisma: PrismaClient;
  let audit: AdminAuditService;
  let bootstrap: AdminBootstrapService;
  // The admin-surface migration already seeds an `admin` `Role` row (its own
  // id), so `seedAdminCoreFixtures`'s upsert may resolve to that pre-existing
  // id rather than the `adminRoleId` constant above — read back whichever id
  // actually won rather than assuming the constant.
  let seededAdminRoleId: string;

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) {
      throw new Error("ADMIN_CORE_INTEGRATION_DATABASE_URL is required");
    }
    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();
    await seedAdminCoreFixtures(prisma);
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { key: "admin" },
      select: { id: true },
    });
    seededAdminRoleId = adminRole.id;

    const moduleRef = await Test.createTestingModule({
      imports: [AdminCoreIntegrationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    audit = moduleRef.get(AdminAuditService);
    bootstrap = moduleRef.get(AdminBootstrapService);
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rolls back the audit write when its surrounding transaction fails (no orphan row)", async () => {
    const targetId = "admin-audit-rollback-target";

    await expect(
      prisma.$transaction(async (tx) => {
        await audit.record(tx, {
          actingAdminId: ids.auditActor,
          action: "roleGranted",
          targetType: "userRole",
          targetId,
          afterState: { role: "admin" },
        });
        throw new Error("simulated failure after the audit write");
      }),
    ).rejects.toThrow("simulated failure after the audit write");

    const orphanRows = await prisma.adminAuditLog.findMany({
      where: { targetType: "userRole", targetId },
    });
    expect(orphanRows).toHaveLength(0);
  });

  it("commits the audit write when its surrounding transaction succeeds", async () => {
    const targetId = "admin-audit-commit-target";

    await prisma.$transaction(async (tx) => {
      await audit.record(tx, {
        actingAdminId: ids.auditActor,
        action: "roleGranted",
        targetType: "userRole",
        targetId,
        afterState: { role: "admin" },
      });
    });

    const rows = await prisma.adminAuditLog.findMany({
      where: { targetType: "userRole", targetId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actingAdminId).toBe(ids.auditActor);
  });

  it("grants the bootstrap allowlist and audits it idempotently across repeated runs", async () => {
    await bootstrap.bootstrap();

    const rolesAfterFirstRun = await prisma.userRole.findMany({
      where: { userId: ids.bootstrapUser, roleId: seededAdminRoleId },
    });
    expect(rolesAfterFirstRun).toHaveLength(1);

    const auditRowsAfterFirstRun = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "userRole",
        targetId: ids.bootstrapUser,
        action: "roleGranted",
      },
    });
    expect(auditRowsAfterFirstRun).toHaveLength(1);

    // Second run is a no-op: still exactly one role assignment, still
    // exactly one audit row (not a second one).
    await bootstrap.bootstrap();

    const rolesAfterSecondRun = await prisma.userRole.findMany({
      where: { userId: ids.bootstrapUser, roleId: seededAdminRoleId },
    });
    expect(rolesAfterSecondRun).toHaveLength(1);

    const auditRowsAfterSecondRun = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "userRole",
        targetId: ids.bootstrapUser,
        action: "roleGranted",
      },
    });
    expect(auditRowsAfterSecondRun).toHaveLength(1);

    // The user never mentioned in ADMIN_BOOTSTRAP_EMAILS is untouched.
    const unlistedRoles = await prisma.userRole.findMany({
      where: { userId: ids.unlistedUser },
    });
    expect(unlistedRoles).toHaveLength(0);
  });
});
