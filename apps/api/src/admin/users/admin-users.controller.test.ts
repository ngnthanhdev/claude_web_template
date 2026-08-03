import { HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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

import { configureApp } from "../../bootstrap/configure-app.js";
import { AuthCryptoService } from "../../auth/core/auth-crypto.service.js";
import {
  AUTH_CLOCK,
  AuthSessionService,
} from "../../auth/core/auth-session.service.js";
import { SESSION_COOKIE_NAME } from "../../auth/core/auth-cookie.js";
import { SessionAuthGuard } from "../../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../../auth/sessions/session-csrf.guard.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AdminAuditService } from "../admin-audit.service.js";
import { AdminMfaEnforcementGuard } from "../admin-mfa-enforcement.guard.js";
import { AdminRolesGuard } from "../admin-roles.guard.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { AdminUsersService } from "./admin-users.service.js";

const rawSessionToken = Buffer.alloc(32, 41).toString("base64url");
const csrfToken = Buffer.alloc(32, 42).toString("base64url");
const sessionId = "30000000-0000-4000-8000-000000000001";
const adminUserId = "30000000-0000-4000-8000-000000000002";
const targetUserId = "30000000-0000-4000-8000-000000000003";
const idleExpiresAt = new Date("2026-09-01T00:00:00.000Z");
const absoluteExpiresAt = new Date("2026-10-01T00:00:00.000Z");
const now = new Date("2026-08-03T00:00:00.000Z");

function cookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

describe("AdminUsersController", () => {
  let app: NestFastifyApplication;
  const adminUsers = {
    list: vi.fn(),
    grantRole: vi.fn(),
    revokeRole: vi.fn(),
  };
  const sessions = { resolveSession: vi.fn(), verifyCsrf: vi.fn() };
  const crypto = { hashSessionToken: vi.fn(), deriveCsrfToken: vi.fn() };
  const clock = { now: vi.fn() };
  const config = { get: vi.fn() };
  const prisma = {
    session: { findUnique: vi.fn() },
    userRole: { findFirst: vi.fn() },
    adminMfaFactor: { findFirst: vi.fn() },
    adminMfaSession: { findFirst: vi.fn() },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        SessionAuthGuard,
        SessionCsrfGuard,
        AdminRolesGuard,
        AdminMfaEnforcementGuard,
        { provide: AdminUsersService, useValue: adminUsers },
        { provide: AuthSessionService, useValue: sessions },
        { provide: AuthCryptoService, useValue: crypto },
        { provide: AUTH_CLOCK, useValue: clock },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
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
      user: { id: adminUserId, normalizedEmail: "admin@example.com" },
    });
    sessions.resolveSession.mockResolvedValue({
      sessionId,
      user: { id: adminUserId, email: "admin@example.com" },
      csrfToken,
      idleExpiresAt,
      absoluteExpiresAt,
      replacementSessionToken: null,
    });
    sessions.verifyCsrf.mockReturnValue(true);
    // Admin role present; MFA enforcement off (default test-suite posture).
    prisma.userRole.findFirst.mockResolvedValue({
      id: "admin-role-assignment",
    });
    config.get.mockImplementation((key: string) =>
      key === "ADMIN_MFA_ENFORCED" ? false : undefined,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it("denies a session without the admin role (403) and never reaches the service", async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get("/v1/admin/users")
      .set("Cookie", cookieHeader())
      .expect(HttpStatus.FORBIDDEN);
    expect(adminUsers.list).not.toHaveBeenCalled();
  });

  it("delegates the parsed list query to the service", async () => {
    adminUsers.list.mockResolvedValue({
      data: [],
      meta: { nextCursor: null, hasMore: false },
    });

    await request(app.getHttpServer())
      .get("/v1/admin/users?limit=10")
      .set("Cookie", cookieHeader())
      .expect(HttpStatus.OK);

    expect(adminUsers.list).toHaveBeenCalledWith({ limit: 10 });
  });

  it("requires the session-bound CSRF token to grant a role", async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/users/${targetUserId}/roles`)
      .set("Cookie", cookieHeader())
      .send({ role: "seller" })
      .expect(HttpStatus.FORBIDDEN);
    expect(adminUsers.grantRole).not.toHaveBeenCalled();
  });

  it("rejects a role key outside seller|admin on grant (422)", async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/users/${targetUserId}/roles`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ role: "owner" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(adminUsers.grantRole).not.toHaveBeenCalled();
  });

  it("rejects a malformed target userId on grant (422)", async () => {
    await request(app.getHttpServer())
      .post("/v1/admin/users/not-a-uuid/roles")
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ role: "seller" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(adminUsers.grantRole).not.toHaveBeenCalled();
  });

  it("rejects a grant body that smuggles an acting-admin id (the request schema is a closed allowlist)", async () => {
    await request(app.getHttpServer())
      .post(`/v1/admin/users/${targetUserId}/roles`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ role: "seller", actingAdminId: "smuggled-id" })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(adminUsers.grantRole).not.toHaveBeenCalled();
  });

  it("delegates a grant to the server-resolved acting admin, never a client-supplied one", async () => {
    adminUsers.grantRole.mockResolvedValue({
      id: targetUserId,
      email: "target@example.com",
      roles: ["seller"],
    });

    await request(app.getHttpServer())
      .post(`/v1/admin/users/${targetUserId}/roles`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .send({ role: "seller" })
      .expect(HttpStatus.OK);

    expect(adminUsers.grantRole).toHaveBeenCalledWith(
      adminUserId,
      targetUserId,
      "seller",
    );
  });

  it("requires the session-bound CSRF token to revoke a role", async () => {
    await request(app.getHttpServer())
      .delete(`/v1/admin/users/${targetUserId}/roles/seller`)
      .set("Cookie", cookieHeader())
      .expect(HttpStatus.FORBIDDEN);
    expect(adminUsers.revokeRole).not.toHaveBeenCalled();
  });

  it("rejects a role key outside seller|admin on revoke (422)", async () => {
    await request(app.getHttpServer())
      .delete(`/v1/admin/users/${targetUserId}/roles/owner`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(adminUsers.revokeRole).not.toHaveBeenCalled();
  });

  it("delegates a revoke to the server-resolved acting admin, never a client-supplied one", async () => {
    adminUsers.revokeRole.mockResolvedValue({
      id: targetUserId,
      email: "target@example.com",
      roles: [],
    });

    await request(app.getHttpServer())
      .delete(`/v1/admin/users/${targetUserId}/roles/seller`)
      .set("Cookie", cookieHeader())
      .set("X-CSRF-Token", csrfToken)
      .expect(HttpStatus.OK);

    expect(adminUsers.revokeRole).toHaveBeenCalledWith(
      adminUserId,
      targetUserId,
      "seller",
    );
  });
});

describe("AdminUsersService boundaries", () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    role: { findUnique: vi.fn() },
    userRole: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    sellerProfile: { findUnique: vi.fn(), create: vi.fn() },
    adminAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };

  function runTransaction<T>(
    callback: (tx: typeof prisma) => Promise<T> | T,
  ): Promise<T> {
    return Promise.resolve(callback(prisma));
  }

  const audit = new AdminAuditService();
  const service = new AdminUsersService(
    prisma as unknown as PrismaService,
    audit,
  );

  const adminRoleRow = { id: "40000000-0000-4000-8000-000000000001" };
  const sellerRoleRow = { id: "40000000-0000-4000-8000-000000000002" };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(runTransaction);
    prisma.user.findUnique.mockResolvedValue({ id: targetUserId });
  });

  it("PII-minimizes the list response to id/email/role keys only", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: targetUserId,
        normalizedEmail: "leak-test@example.com",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        roleAssignments: [{ role: { key: "seller" } }],
        // Fields a broader select would never actually include, proving the
        // mapper — not just the DB select — is what enforces minimization.
        sessions: [{ id: "session-should-never-leak" }],
      },
    ]);

    const response = await service.list({ limit: 20 });

    expect(response.data).toEqual([
      { id: targetUserId, email: "leak-test@example.com", roles: ["seller"] },
    ]);
  });

  it("grants a role once, auditing exactly once, and is idempotent on retry", async () => {
    prisma.role.findUnique.mockResolvedValue(adminRoleRow);
    prisma.userRole.findUnique.mockResolvedValueOnce(null);
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: targetUserId,
      normalizedEmail: "target@example.com",
      roleAssignments: [{ role: { key: "admin" } }],
    });

    const first = await service.grantRole(adminUserId, targetUserId, "admin");
    expect(first).toEqual({
      id: targetUserId,
      email: "target@example.com",
      roles: ["admin"],
    });
    expect(prisma.userRole.create).toHaveBeenCalledTimes(1);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actingAdminId: adminUserId,
          action: "roleGranted",
          targetType: "userRole",
          targetId: targetUserId,
        }),
      }),
    );

    // Idempotent retry: the assignment already exists now.
    prisma.userRole.findUnique.mockResolvedValueOnce({ id: "existing" });
    const second = await service.grantRole(adminUserId, targetUserId, "admin");
    expect(second).toEqual(first);
    expect(prisma.userRole.create).toHaveBeenCalledTimes(1);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it("creates a minimal SellerProfile when granting seller and none exists yet", async () => {
    prisma.role.findUnique.mockResolvedValue(sellerRoleRow);
    prisma.userRole.findUnique.mockResolvedValue(null);
    prisma.sellerProfile.findUnique.mockResolvedValueOnce(null); // ensureSellerProfile check
    prisma.user.findUniqueOrThrow
      .mockResolvedValueOnce({ normalizedEmail: "new.seller@example.com" }) // ensureSellerProfile owner lookup
      .mockResolvedValueOnce({
        id: targetUserId,
        normalizedEmail: "new.seller@example.com",
        roleAssignments: [{ role: { key: "seller" } }],
      });
    prisma.sellerProfile.findUnique.mockResolvedValueOnce(null); // slug uniqueness check

    await service.grantRole(adminUserId, targetUserId, "seller");

    expect(prisma.sellerProfile.create).toHaveBeenCalledWith({
      data: { ownerId: targetUserId, slug: "new-seller" },
    });
  });

  it("does not recreate a SellerProfile that already exists (grant is a no-op for the profile)", async () => {
    prisma.role.findUnique.mockResolvedValue(sellerRoleRow);
    prisma.userRole.findUnique.mockResolvedValue({ id: "existing" });
    prisma.sellerProfile.findUnique.mockResolvedValue({
      id: "existing-profile",
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: targetUserId,
      normalizedEmail: "target@example.com",
      roleAssignments: [{ role: { key: "seller" } }],
    });

    await service.grantRole(adminUserId, targetUserId, "seller");

    expect(prisma.sellerProfile.create).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("revokes an assigned role, audits exactly once, and preserves the SellerProfile", async () => {
    prisma.role.findUnique.mockResolvedValue(sellerRoleRow);
    prisma.userRole.findUnique.mockResolvedValueOnce({ id: "assignment-1" });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: targetUserId,
      normalizedEmail: "target@example.com",
      roleAssignments: [],
    });

    const first = await service.revokeRole(adminUserId, targetUserId, "seller");
    expect(first).toEqual({
      id: targetUserId,
      email: "target@example.com",
      roles: [],
    });
    expect(prisma.userRole.delete).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
    });
    expect(prisma.sellerProfile.create).not.toHaveBeenCalled();
    expect(prisma.sellerProfile.findUnique).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);

    // Idempotent retry: the assignment is already gone.
    prisma.userRole.findUnique.mockResolvedValueOnce(null);
    const second = await service.revokeRole(
      adminUserId,
      targetUserId,
      "seller",
    );
    expect(second).toEqual(first);
    expect(prisma.userRole.delete).toHaveBeenCalledTimes(1);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it("blocks an admin from revoking their own last admin role (422)", async () => {
    prisma.role.findUnique.mockResolvedValue(adminRoleRow);
    prisma.userRole.findUnique.mockResolvedValue({ id: "self-assignment" });
    prisma.userRole.count.mockResolvedValue(1);

    await expect(
      service.revokeRole(adminUserId, adminUserId, "admin"),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    expect(prisma.userRole.delete).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("allows an admin to revoke their own admin role when another admin remains", async () => {
    prisma.role.findUnique.mockResolvedValue(adminRoleRow);
    prisma.userRole.findUnique.mockResolvedValue({ id: "self-assignment" });
    prisma.userRole.count.mockResolvedValue(2);
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: adminUserId,
      normalizedEmail: "admin@example.com",
      roleAssignments: [],
    });

    await service.revokeRole(adminUserId, adminUserId, "admin");

    expect(prisma.userRole.delete).toHaveBeenCalledWith({
      where: { id: "self-assignment" },
    });
  });

  it("allows revoking another admin's last admin role (the guard is self-revoke-only)", async () => {
    prisma.role.findUnique.mockResolvedValue(adminRoleRow);
    prisma.userRole.findUnique.mockResolvedValue({ id: "other-assignment" });
    prisma.userRole.count.mockResolvedValue(1);
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: targetUserId,
      normalizedEmail: "target@example.com",
      roleAssignments: [],
    });

    await service.revokeRole(adminUserId, targetUserId, "admin");

    expect(prisma.userRole.delete).toHaveBeenCalledWith({
      where: { id: "other-assignment" },
    });
  });
});
