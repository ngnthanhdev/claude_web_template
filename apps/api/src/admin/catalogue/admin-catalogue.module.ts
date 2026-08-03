import { Module } from "@nestjs/common";

import { AuthCoreModule } from "../../auth/core/auth-core.module.js";
import {
  AUTH_CLOCK,
  systemAuthClock,
} from "../../auth/core/auth-session.service.js";
import { SessionAuthGuard } from "../../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../../auth/sessions/session-csrf.guard.js";
import { AdminModule } from "../admin.module.js";
import { AdminReviewController } from "./admin-review.controller.js";
import { AdminReviewService } from "./admin-review.service.js";

/**
 * Admin catalogue review resource (design §5/§6). Imports `AdminModule` for
 * `AdminRolesGuard`/`AdminMfaEnforcementGuard`/`AdminAuditService`, mirroring
 * how `seller.module.ts` imports `AuthCoreModule` for its session guards.
 * Only this task's own controller/provider are registered here; wiring
 * `AdminCatalogueModule` into the composed `AppModule` is a later task
 * (`T-83bd5f`).
 */
@Module({
  imports: [AuthCoreModule, AdminModule],
  controllers: [AdminReviewController],
  providers: [
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
    SessionAuthGuard,
    SessionCsrfGuard,
    AdminReviewService,
  ],
  exports: [AdminReviewService],
})
export class AdminCatalogueModule {}
