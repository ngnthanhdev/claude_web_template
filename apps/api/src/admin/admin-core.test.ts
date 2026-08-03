import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { Env } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  attachSessionContext,
  type SessionRequest,
} from "../auth/sessions/session-context.js";
import type { ResolvedSession } from "../auth/core/auth-session.service.js";
import { AdminAuditService } from "./admin-audit.service.js";
import { AdminBootstrapService } from "./admin-bootstrap.service.js";
import {
  AdminMfaEnforcementGuard,
  resolveAdminMfaEnforcement,
} from "./admin-mfa-enforcement.guard.js";
import { getAdminPrincipal, type AdminRequest } from "./admin-principal.js";
import { AdminRolesGuard } from "./admin-roles.guard.js";

const userId = "10000000-0000-4000-8000-000000000001";
const sessionId = "10000000-0000-4000-8000-000000000002";

function resolvedSession(
  overrides: Partial<ResolvedSession> = {},
): ResolvedSession {
  return {
    sessionId,
    user: { id: userId, email: "admin@example.com" },
    csrfToken: "csrf-token",
    idleExpiresAt: new Date("2026-09-01T00:00:00.000Z"),
    absoluteExpiresAt: new Date("2026-10-01T00:00:00.000Z"),
    replacementSessionToken: null,
    ...overrides,
  };
}

function requestWithSession(
  resolved: ResolvedSession = resolvedSession(),
): AdminRequest {
  const request = {} as SessionRequest;
  attachSessionContext(request, resolved);
  return request as AdminRequest;
}

function contextFor(request: AdminRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

/**
 * A duck-typed fake, not a real `ConfigService` — the real class falls back
 * to `process.env` for any key absent from its `internalConfig`, which would
 * make this test's "unset" cases depend on whatever the ambient test-runner
 * environment happens to export (the api `test` script exports
 * `ADMIN_MFA_ENFORCED=false` process-wide for other suites' sake). Only
 * `.get` is exercised by the code under test.
 */
function configWith(overrides: Partial<Env>): ConfigService<Env, true> {
  return {
    get: <K extends keyof Env>(key: K): Env[K] | undefined => overrides[key],
  } as unknown as ConfigService<Env, true>;
}

describe("AdminRolesGuard", () => {
  it("denies a session without the admin role (403)", async () => {
    const prisma = { userRole: { findFirst: vi.fn().mockResolvedValue(null) } };
    const guard = new AdminRolesGuard(prisma as unknown as PrismaService);
    const request = requestWithSession();

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("allows an admin session and attaches the acting admin principal from the session only", async () => {
    const prisma = {
      userRole: {
        findFirst: vi.fn().mockResolvedValue({ id: "role-assignment" }),
      },
    };
    const guard = new AdminRolesGuard(prisma as unknown as PrismaService);
    const request = requestWithSession();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(prisma.userRole.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId }),
      }),
    );
    expect(getAdminPrincipal(request).userId).toBe(userId);
  });
});

describe("resolveAdminMfaEnforcement", () => {
  it("uses the explicit flag when set, regardless of NODE_ENV", () => {
    expect(
      resolveAdminMfaEnforcement(
        configWith({ NODE_ENV: "development", ADMIN_MFA_ENFORCED: true }),
      ),
    ).toBe(true);
    expect(
      resolveAdminMfaEnforcement(
        configWith({ NODE_ENV: "production", ADMIN_MFA_ENFORCED: false }),
      ),
    ).toBe(false);
  });

  it("defaults to NODE_ENV === production when the flag is unset", () => {
    expect(
      resolveAdminMfaEnforcement(configWith({ NODE_ENV: "production" })),
    ).toBe(true);
    expect(resolveAdminMfaEnforcement(configWith({ NODE_ENV: "test" }))).toBe(
      false,
    );
    expect(
      resolveAdminMfaEnforcement(configWith({ NODE_ENV: "development" })),
    ).toBe(false);
  });
});

describe("AdminMfaEnforcementGuard", () => {
  function prismaStub(overrides: {
    factor?: { id: string } | null;
    recentSession?: { id: string } | null;
  }) {
    return {
      adminMfaFactor: {
        findFirst: vi.fn().mockResolvedValue(overrides.factor ?? null),
      },
      adminMfaSession: {
        findFirst: vi.fn().mockResolvedValue(overrides.recentSession ?? null),
      },
    };
  }

  it("is a pass-through when enforcement is off", async () => {
    const prisma = prismaStub({});
    const guard = new AdminMfaEnforcementGuard(
      configWith({ NODE_ENV: "test", ADMIN_MFA_ENFORCED: false }),
      prisma as unknown as PrismaService,
    );

    await expect(
      guard.canActivate(contextFor(requestWithSession())),
    ).resolves.toBe(true);
    expect(prisma.adminMfaFactor.findFirst).not.toHaveBeenCalled();
  });

  it("denies when enforced and the admin has no confirmed MFA factor", async () => {
    const prisma = prismaStub({ factor: null });
    const guard = new AdminMfaEnforcementGuard(
      configWith({ NODE_ENV: "test", ADMIN_MFA_ENFORCED: true }),
      prisma as unknown as PrismaService,
    );

    await expect(
      guard.canActivate(contextFor(requestWithSession())),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("denies when enforced, a factor is confirmed, but there is no recent MFA-verified session marker", async () => {
    const prisma = prismaStub({
      factor: { id: "factor-1" },
      recentSession: null,
    });
    const guard = new AdminMfaEnforcementGuard(
      configWith({ NODE_ENV: "test", ADMIN_MFA_ENFORCED: true }),
      prisma as unknown as PrismaService,
    );

    await expect(
      guard.canActivate(contextFor(requestWithSession())),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows when enforced, a factor is confirmed, and a recent MFA-verified session marker exists", async () => {
    const prisma = prismaStub({
      factor: { id: "factor-1" },
      recentSession: { id: "mfa-session-1" },
    });
    const guard = new AdminMfaEnforcementGuard(
      configWith({ NODE_ENV: "test", ADMIN_MFA_ENFORCED: true }),
      prisma as unknown as PrismaService,
    );

    await expect(
      guard.canActivate(contextFor(requestWithSession())),
    ).resolves.toBe(true);
    expect(prisma.adminMfaSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sessionId }),
      }),
    );
  });
});

describe("AdminAuditService", () => {
  it("writes one row keeping only allowlisted primitive fields, dropping everything else (fail closed)", async () => {
    const create = vi.fn().mockResolvedValue({ id: "audit-row-1" });
    const tx = { adminAuditLog: { create } };
    const service = new AdminAuditService();

    await service.record(tx as never, {
      actingAdminId: userId,
      action: "mfaEnrolled",
      targetType: "adminMfaFactor",
      targetId: "factor-1",
      beforeState: null,
      afterState: {
        factorId: "factor-1", // allowlisted primitive -> kept
        confirmedAt: "2026-08-03T00:00:00.000Z", // allowlisted primitive -> kept
        encryptedSecret: "should-never-be-logged", // known secret -> dropped
        sessionToken: "should-never-be-logged", // NOVEL unlisted key -> dropped (the deny-list gap)
        phone: "+15555550100", // unlisted PII -> dropped
        owner: { email: "leaks@example.com" }, // nested object -> dropped entirely
      },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]?.[0]?.data;
    expect(data.actingAdminId).toBe(userId);
    expect(data.action).toBe("mfaEnrolled");
    expect(data.afterState).toEqual({
      factorId: "factor-1",
      confirmedAt: "2026-08-03T00:00:00.000Z",
    });
    const serialized = JSON.stringify(data.afterState);
    expect(serialized).not.toContain("should-never-be-logged");
    expect(serialized).not.toContain("leaks@example.com");
    expect(serialized).not.toContain("+15555550100");
  });
});

describe("AdminBootstrapService", () => {
  it("is a no-op when the allowlist is empty", async () => {
    const prisma = {
      role: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
    };
    const audit = new AdminAuditService();
    const service = new AdminBootstrapService(
      prisma as unknown as PrismaService,
      configWith({ NODE_ENV: "test" }),
      audit,
    );

    await service.bootstrap();

    expect(prisma.role.findUnique).not.toHaveBeenCalled();
  });

  it("skips an allowlisted email that has no existing user account", async () => {
    const prisma = {
      role: { findUnique: vi.fn().mockResolvedValue({ id: "admin-role-1" }) },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    const audit = new AdminAuditService();
    const service = new AdminBootstrapService(
      prisma as unknown as PrismaService,
      configWith({
        NODE_ENV: "test",
        ADMIN_BOOTSTRAP_EMAILS: "nobody@example.com",
      }),
      audit,
    );

    await service.bootstrap();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("treats a concurrent-grant unique violation (P2002) as already granted rather than failing boot", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`user_id`,`role_id`)",
      { code: "P2002", clientVersion: "test" },
    );
    const prisma = {
      role: { findUnique: vi.fn().mockResolvedValue({ id: "admin-role-1" }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: userId }) },
      $transaction: vi.fn().mockRejectedValue(p2002),
    };
    const audit = new AdminAuditService();
    const service = new AdminBootstrapService(
      prisma as unknown as PrismaService,
      configWith({
        NODE_ENV: "test",
        ADMIN_BOOTSTRAP_EMAILS: "admin@example.com",
      }),
      audit,
    );

    await expect(service.bootstrap()).resolves.toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
