import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { CurrentSessionResponse } from "@marketplace/shared/auth";
import type { FastifyReply } from "fastify";

import {
  clearSessionCookie,
  setSessionCookie,
} from "../core/auth-cookie.js";
import { AuthSessionService } from "../core/auth-session.service.js";
import { SessionAuthGuard } from "./session-auth.guard.js";
import { SessionCsrfGuard } from "./session-csrf.guard.js";
import {
  getResolvedSession,
  type SessionRequest,
} from "./session-context.js";

@Controller("sessions")
export class SessionsController {
  constructor(
    @Inject(AuthSessionService) private readonly sessions: AuthSessionService,
  ) {}

  @Get("current")
  @UseGuards(SessionAuthGuard)
  getCurrent(
    @Req() request: SessionRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): CurrentSessionResponse {
    const session = getResolvedSession(request);
    if (session.replacementSessionToken !== null) {
      setSessionCookie(reply, session.replacementSessionToken);
    }
    return {
      user: session.user,
      session: {
        id: session.sessionId,
        expiresAt: new Date(
          Math.min(
            session.idleExpiresAt.getTime(),
            session.absoluteExpiresAt.getTime(),
          ),
        ).toISOString(),
      },
      csrfToken: session.csrfToken,
    };
  }

  @Delete("current")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard, SessionCsrfGuard)
  async revokeCurrent(
    @Req() request: SessionRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const session = getResolvedSession(request);
    await this.sessions.revokeCurrentSession(session.user.id, session.sessionId);
    clearSessionCookie(reply);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard, SessionCsrfGuard)
  async revokeAll(
    @Req() request: SessionRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const session = getResolvedSession(request);
    await this.sessions.revokeAllSessions(session.user.id);
    clearSessionCookie(reply);
  }
}
