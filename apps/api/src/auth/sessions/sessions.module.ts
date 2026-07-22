import { Module } from "@nestjs/common";

import { AuthCoreModule } from "../core/auth-core.module.js";
import {
  AUTH_CLOCK,
  systemAuthClock,
} from "../core/auth-session.service.js";
import { SessionAuthGuard } from "./session-auth.guard.js";
import { SessionCsrfGuard } from "./session-csrf.guard.js";
import { SessionsController } from "./sessions.controller.js";

@Module({
  imports: [AuthCoreModule],
  controllers: [SessionsController],
  providers: [
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
    SessionAuthGuard,
    SessionCsrfGuard,
  ],
})
export class SessionsModule {}
