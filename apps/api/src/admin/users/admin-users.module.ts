import { Module } from "@nestjs/common";

import { AuthCoreModule } from "../../auth/core/auth-core.module.js";
import {
  AUTH_CLOCK,
  systemAuthClock,
} from "../../auth/core/auth-session.service.js";
import { SessionAuthGuard } from "../../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../../auth/sessions/session-csrf.guard.js";
import { AdminModule } from "../admin.module.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { AdminUsersService } from "./admin-users.service.js";

/**
 * Admin-scoped user directory + role-provisioning resource (design §4/§8).
 * Only this task's own controller/service is registered here; wiring
 * `AdminUsersModule` into the composed `AppModule` is a later task (`T-83bd5f`).
 */
@Module({
  imports: [AuthCoreModule, AdminModule],
  controllers: [AdminUsersController],
  providers: [
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
    SessionAuthGuard,
    SessionCsrfGuard,
    AdminUsersService,
  ],
  exports: [AdminUsersService],
})
export class AdminUsersModule {}
