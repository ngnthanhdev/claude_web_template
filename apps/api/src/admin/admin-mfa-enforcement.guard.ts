import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminMfaFactorType } from "@prisma/client";

import type { Env } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { getResolvedSession } from "../auth/sessions/session-context.js";
import type { AdminRequest } from "./admin-principal.js";

/**
 * How recently the current session must have completed an MFA challenge
 * (`AdminMfaSession.verifiedAt`) for enforcement to consider it satisfied —
 * a "step-up" recency window, not the session's own idle/absolute TTL. 15
 * minutes mirrors common privileged-session re-auth windows (e.g. sudo,
 * cloud-console step-up) and is short enough that a stolen session cookie
 * alone cannot reach an MFA-gated action indefinitely (design §6/§8).
 */
export const ADMIN_MFA_SESSION_RECENCY_MS = 15 * 60 * 1000;

/**
 * Effective admin-MFA enforcement (design §6): the explicit
 * `ADMIN_MFA_ENFORCED` flag when set, else `NODE_ENV === "production"` —
 * mirroring {@link SandboxPaymentAdapter}'s `NODE_ENV` gate so production
 * defaults to enforced and dev/test defaults to off without extra
 * configuration. Centralized here so every caller (this guard, and any
 * sensitive-action re-check) computes it identically.
 */
export function resolveAdminMfaEnforcement(
  config: ConfigService<Env, true>,
): boolean {
  const explicitFlag = config.get("ADMIN_MFA_ENFORCED");
  if (explicitFlag !== undefined) {
    return explicitFlag;
  }
  return config.get("NODE_ENV") === "production";
}

/**
 * Requires a recently MFA-verified admin session when enforcement is on
 * (design §6/§8). A pass-through when enforcement is off. Deny-by-default
 * when enforced: no confirmed `AdminMfaFactor`, or no sufficiently recent
 * `AdminMfaSession` marker for the current session, both reject with `403`.
 * Reads the session directly (not the `AdminRolesGuard`-attached principal)
 * so it composes independently of guard ordering on a route.
 */
@Injectable()
export class AdminMfaEnforcementGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!resolveAdminMfaEnforcement(this.config)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const session = getResolvedSession(request);

    const confirmedFactor = await this.prisma.adminMfaFactor.findFirst({
      where: {
        userId: session.user.id,
        type: AdminMfaFactorType.totp,
        confirmedAt: { not: null },
      },
      select: { id: true },
    });
    if (confirmedFactor === null) {
      throw new ForbiddenException("Admin MFA enrollment is required");
    }

    const recentVerification = await this.prisma.adminMfaSession.findFirst({
      where: {
        sessionId: session.sessionId,
        verifiedAt: {
          gte: new Date(Date.now() - ADMIN_MFA_SESSION_RECENCY_MS),
        },
      },
      select: { id: true },
    });
    if (recentVerification === null) {
      throw new ForbiddenException(
        "A recent admin MFA verification is required",
      );
    }

    return true;
  }
}
