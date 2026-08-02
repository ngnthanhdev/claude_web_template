import { Module } from "@nestjs/common";

import { AuthCoreModule } from "../auth/core/auth-core.module.js";
import {
  AUTH_CLOCK,
  systemAuthClock,
} from "../auth/core/auth-session.service.js";
import { SessionAuthGuard } from "../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../auth/sessions/session-csrf.guard.js";
import { SellerGuard } from "./seller.guard.js";
import { SellerProductsController } from "./seller-products.controller.js";
import { SellerProductsService } from "./seller-products.service.js";
import { SellerReviewController } from "./seller-review.controller.js";
import { SellerReviewService } from "./seller-review.service.js";
import { SellerVersionsController } from "./seller-versions.controller.js";
import { SellerVersionsService } from "./seller-versions.service.js";

/**
 * Seller-scoped authoring resources (design §5/§6). Only this task's own
 * controllers/providers are registered here; wiring `SellerModule` into the
 * composed `AppModule` is a later task.
 */
@Module({
  imports: [AuthCoreModule],
  controllers: [
    SellerProductsController,
    SellerVersionsController,
    SellerReviewController,
  ],
  providers: [
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
    SessionAuthGuard,
    SessionCsrfGuard,
    SellerGuard,
    SellerProductsService,
    SellerVersionsService,
    SellerReviewService,
  ],
  exports: [SellerProductsService, SellerVersionsService, SellerReviewService],
})
export class SellerModule {}
