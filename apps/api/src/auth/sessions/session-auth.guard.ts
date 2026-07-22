import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";

import { ApiHttpException } from "../../common/errors/api-http.exception.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { SESSION_COOKIE_NAME } from "../core/auth-cookie.js";
import { AuthCryptoService } from "../core/auth-crypto.service.js";
import {
  AUTH_CLOCK,
  type AuthClock,
  type ResolvedSession,
  AuthSessionService,
} from "../core/auth-session.service.js";
import {
  attachSessionContext,
  type SessionRequest,
} from "./session-context.js";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthCryptoService) private readonly crypto: AuthCryptoService,
    @Inject(AuthSessionService) private readonly sessions: AuthSessionService,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const rawSessionToken = request.cookies[SESSION_COOKIE_NAME];
    if (typeof rawSessionToken !== "string" || rawSessionToken.length === 0) {
      throw this.unauthenticated();
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const resolved = await this.sessions.resolveSession(rawSessionToken);
      if (resolved === null) {
        throw this.unauthenticated();
      }
      attachSessionContext(request, resolved);
      return true;
    }

    const tokenHash = this.crypto.hashSessionToken(rawSessionToken);
    const stored = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        csrfHash: true,
        idleExpiresAt: true,
        absoluteExpiresAt: true,
        revokedAt: true,
        rotatedToId: true,
        user: { select: { id: true, normalizedEmail: true } },
      },
    });
    const now = this.clock.now();
    if (
      stored === null ||
      stored.revokedAt !== null ||
      stored.rotatedToId !== null ||
      stored.idleExpiresAt.getTime() <= now.getTime() ||
      stored.absoluteExpiresAt.getTime() <= now.getTime()
    ) {
      throw this.unauthenticated();
    }

    const resolved = {
      sessionId: stored.id,
      user: { id: stored.user.id, email: stored.user.normalizedEmail },
      csrfToken: this.crypto.deriveCsrfToken(rawSessionToken),
      idleExpiresAt: stored.idleExpiresAt,
      absoluteExpiresAt: stored.absoluteExpiresAt,
      replacementSessionToken: null,
    } satisfies ResolvedSession;
    attachSessionContext(request, resolved, {
      rawSessionToken,
      csrfHash: stored.csrfHash,
    });
    return true;
  }

  private unauthenticated(): ApiHttpException {
    return new ApiHttpException(
      HttpStatus.UNAUTHORIZED,
      "SESSION_UNAUTHENTICATED",
    );
  }
}
