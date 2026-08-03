import { Module } from "@nestjs/common";

import { AuthCoreModule } from "../../auth/core/auth-core.module.js";
import {
  AUTH_CLOCK,
  systemAuthClock,
} from "../../auth/core/auth-session.service.js";
import { SessionAuthGuard } from "../../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../../auth/sessions/session-csrf.guard.js";
import { AdminModule } from "../admin.module.js";
import { AdminPublicationController } from "./admin-publication.controller.js";
import { AdminPublicationService } from "./admin-publication.service.js";

/**
 * The admin publish/delist resource (design §5/§8): guarded
 * `draft -> published` and `published -> delisted` `Product.publicationState`
 * transitions. Imports `AdminModule` for its exported `AdminRolesGuard`/
 * `AdminMfaEnforcementGuard`/`AdminAuditService` rather than redeclaring
 * them. Registers no providers into the composed `AppModule` — that wiring
 * is a later task.
 */
@Module({
  imports: [AuthCoreModule, AdminModule],
  controllers: [AdminPublicationController],
  providers: [
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
    SessionAuthGuard,
    SessionCsrfGuard,
    AdminPublicationService,
  ],
  exports: [AdminPublicationService],
})
export class AdminPublicationModule {}
