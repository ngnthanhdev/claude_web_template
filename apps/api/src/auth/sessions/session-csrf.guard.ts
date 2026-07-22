import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";

import { ApiHttpException } from "../../common/errors/api-http.exception.js";
import { AuthSessionService } from "../core/auth-session.service.js";
import {
  getSessionAuthenticationProof,
  type SessionRequest,
} from "./session-context.js";

@Injectable()
export class SessionCsrfGuard implements CanActivate {
  constructor(
    @Inject(AuthSessionService) private readonly sessions: AuthSessionService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const presentedToken = request.headers["x-csrf-token"];
    const proof = getSessionAuthenticationProof(request);
    if (
      typeof presentedToken !== "string" ||
      !this.sessions.verifyCsrf(
        proof.rawSessionToken,
        presentedToken,
        proof.csrfHash,
      )
    ) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, "CSRF_INVALID");
    }
    return true;
  }
}
