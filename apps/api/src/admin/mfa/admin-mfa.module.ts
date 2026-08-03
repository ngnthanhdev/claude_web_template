import { Module } from "@nestjs/common";

import { AuthCoreModule } from "../../auth/core/auth-core.module.js";
import {
  AUTH_CLOCK,
  systemAuthClock,
} from "../../auth/core/auth-session.service.js";
import { SessionAuthGuard } from "../../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../../auth/sessions/session-csrf.guard.js";
import { AdminModule } from "../admin.module.js";
import { AdminMfaController } from "./admin-mfa.controller.js";
import { AdminMfaService } from "./admin-mfa.service.js";

/**
 * Admin TOTP enrollment/verification (design §6/§8). Imports `AdminModule`
 * for `AdminRolesGuard`/`AdminMfaEnforcementGuard`/`AdminAuditService`
 * rather than redeclaring them (they are that module's providers). Mirrors
 * `SellerModule`'s wiring: `AuthCoreModule` does not export the `AUTH_CLOCK`
 * token, so every importing module re-provides it locally for its own
 * guards. Registers no providers into the composed `AppModule` — that
 * wiring is a later task.
 */
@Module({
  imports: [AuthCoreModule, AdminModule],
  controllers: [AdminMfaController],
  providers: [
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
    SessionAuthGuard,
    SessionCsrfGuard,
    AdminMfaService,
  ],
  exports: [AdminMfaService],
})
export class AdminMfaModule {}
