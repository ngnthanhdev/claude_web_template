import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import { getResolvedSession } from "../auth/sessions/session-context.js";
import { attachAdminPrincipal, type AdminRequest } from "./admin-principal.js";

/**
 * Required-role allowlist for admin access (design §1/§4): a single-element
 * array today ("one server-enforced `admin` role guards every admin
 * action"), written as a set so a later finer editor/publisher/support role
 * split is an additive entry here, not a rewrite of the guard.
 */
const ADMIN_ROLE_KEYS = ["admin"] as const;

/**
 * Runs after `SessionAuthGuard` (design §4/§8): requires the authenticated
 * user to hold one of {@link ADMIN_ROLE_KEYS}. Deny-by-default — a controller
 * without this guard is simply not admin-gated, and a session lacking every
 * allowlisted role is rejected with `403`. The resolved admin principal is
 * attached to the request via `admin-principal`; every downstream
 * service/guard reads the acting admin id from there (ultimately the
 * session), never from a request body or query string.
 */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const session = getResolvedSession(request);

    const roleAssignment = await this.prisma.userRole.findFirst({
      where: {
        userId: session.user.id,
        role: { key: { in: [...ADMIN_ROLE_KEYS] } },
      },
      select: { id: true },
    });
    if (roleAssignment === null) {
      throw new ForbiddenException("Admin role is required");
    }

    attachAdminPrincipal(request, { userId: session.user.id });
    return true;
  }
}
