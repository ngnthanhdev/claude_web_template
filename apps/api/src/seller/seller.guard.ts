import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import { getResolvedSession } from "../auth/sessions/session-context.js";
import {
  attachSellerPrincipal,
  type SellerRequest,
} from "./seller-principal.js";

const SELLER_ROLE_KEY = "seller";

/**
 * Runs after `SessionAuthGuard` (design §5/§8): requires the authenticated
 * user to hold the `seller` role AND already own a `SellerProfile` — a
 * `seller` role without a profile is rejected rather than auto-provisioned,
 * since profile creation is its own onboarding flow, not an implicit side
 * effect of the first authoring request. The resolved `sellerId` is attached
 * to the request via `seller-principal`; every downstream service reads it
 * from there, never from a request body or query string.
 */
@Injectable()
export class SellerGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SellerRequest>();
    const session = getResolvedSession(request);

    const roleAssignment = await this.prisma.userRole.findFirst({
      where: { userId: session.user.id, role: { key: SELLER_ROLE_KEY } },
      select: { id: true },
    });
    if (roleAssignment === null) {
      throw new ForbiddenException("Seller role is required");
    }

    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { ownerId: session.user.id },
      select: { id: true },
    });
    if (sellerProfile === null) {
      throw new ForbiddenException("Seller profile is required");
    }

    attachSellerPrincipal(request, { sellerId: sellerProfile.id });
    return true;
  }
}
