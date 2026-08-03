import { Module } from "@nestjs/common";

import { AdminAuditService } from "./admin-audit.service.js";
import { AdminBootstrapService } from "./admin-bootstrap.service.js";
import { AdminMfaEnforcementGuard } from "./admin-mfa-enforcement.guard.js";
import { AdminRolesGuard } from "./admin-roles.guard.js";

/**
 * The admin security core (design §4/§6/§7): the two admin guards, the
 * append-only audit writer, and the startup bootstrap grant. Every
 * Round-3+ admin resource module imports this module for its guards/audit
 * service rather than redeclaring them. Registers no providers into the
 * composed `AppModule` — that wiring, and `AdminBootstrapService`'s startup
 * hook actually firing, is a later task.
 */
@Module({
  providers: [
    AdminRolesGuard,
    AdminMfaEnforcementGuard,
    AdminAuditService,
    AdminBootstrapService,
  ],
  exports: [
    AdminRolesGuard,
    AdminMfaEnforcementGuard,
    AdminAuditService,
    AdminBootstrapService,
  ],
})
export class AdminModule {}
