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
import { AuthSessionService } from "../core/auth-session.service.js";
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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const rawSessionToken = request.cookies[SESSION_COOKIE_NAME];
    if (typeof rawSessionToken !== "string" || rawSessionToken.length === 0) {
      throw this.unauthenticated();
    }

    const tokenHash = this.crypto.hashSessionToken(rawSessionToken);
    const verifier = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: { csrfHash: true },
    });
    if (verifier === null) {
      throw this.unauthenticated();
    }

    const resolved = await this.sessions.resolveSession(rawSessionToken);
    if (resolved === null) {
      throw this.unauthenticated();
    }

    attachSessionContext(request, resolved, {
      rawSessionToken,
      csrfHash: verifier.csrfHash,
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
