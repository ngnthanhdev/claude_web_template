import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AdminAuditService } from "./admin-audit.service.js";

const ADMIN_ROLE_KEY = "admin";

/**
 * Parses the `ADMIN_BOOTSTRAP_EMAILS` allowlist into a deduplicated set of
 * normalized emails. Mirrors the `.trim().toLowerCase()` normalization every
 * other email comparison in this codebase uses. Malformed/blank entries are
 * dropped rather than rejected — an unmatched entry simply grants nothing
 * (fails safe), since strict validation here would fail the whole app boot
 * over a single typo.
 */
export function parseAdminBootstrapEmails(
  raw: string | undefined,
): readonly string[] {
  if (raw === undefined) return [];

  const normalized = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return [...new Set(normalized)];
}

/**
 * Grants the `admin` role, idempotently, to the env-allowlisted set of
 * already-existing users (design §1/§4) — the only non-self-serve
 * admin-grant path. Never creates a `User`: an allowlisted email only takes
 * effect once that person has an account (e.g. has signed in via magic link
 * at least once); re-running bootstrap on a later restart picks it up. Never
 * opens a public endpoint — this only ever runs as an application startup
 * hook (`onApplicationBootstrap`), but every step is exposed as a plain
 * method so it is directly unit/integration testable without booting a full
 * Nest application.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bootstrap();
  }

  async bootstrap(): Promise<void> {
    const allowlist = parseAdminBootstrapEmails(
      this.config.get("ADMIN_BOOTSTRAP_EMAILS"),
    );
    if (allowlist.length === 0) return;

    const adminRole = await this.prisma.role.findUnique({
      where: { key: ADMIN_ROLE_KEY },
      select: { id: true },
    });
    if (adminRole === null) {
      this.logger.warn(
        "Skipping admin bootstrap: the 'admin' role is not seeded",
      );
      return;
    }

    for (const normalizedEmail of allowlist) {
      await this.grantIfMissing(adminRole.id, normalizedEmail);
    }
  }

  private async grantIfMissing(
    adminRoleId: string,
    normalizedEmail: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      select: { id: true },
    });
    if (user === null) return;

    await this.prisma.$transaction(async (tx) => {
      const existingAssignment = await tx.userRole.findUnique({
        where: { userId_roleId: { userId: user.id, roleId: adminRoleId } },
        select: { id: true },
      });
      if (existingAssignment !== null) return;

      await tx.userRole.create({
        data: { userId: user.id, roleId: adminRoleId },
      });
      // The bootstrap grant has no separate operator session to attribute
      // it to — the newly-admitted user is recorded as both actor and
      // target of their own provisioning.
      await this.audit.record(tx, {
        actingAdminId: user.id,
        action: "roleGranted",
        targetType: "userRole",
        targetId: user.id,
        afterState: { role: ADMIN_ROLE_KEY },
      });
    });
  }
}
