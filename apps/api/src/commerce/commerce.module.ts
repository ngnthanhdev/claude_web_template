import { Module } from "@nestjs/common";

import { AuthCoreModule } from "../auth/core/auth-core.module.js";
import {
  AUTH_CLOCK,
  systemAuthClock,
} from "../auth/core/auth-session.service.js";
import { SessionAuthGuard } from "../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../auth/sessions/session-csrf.guard.js";
import { CheckoutController } from "./checkout.controller.js";
import { CheckoutService } from "./checkout.service.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";
import { PAYMENT_PORT } from "./payment/payment.port.js";
import { SandboxPaymentAdapter } from "./payment/sandbox-payment.adapter.js";
import { SettleController } from "./settle.controller.js";
import { SettleService } from "./settle.service.js";

/**
 * Wave-1 checkout / sandbox settle / order-read resources (design §5). Only
 * this task's own controllers/providers are registered here; wiring
 * `CommerceModule` into the composed `AppModule` is `T-7b2d84`.
 */
@Module({
  imports: [AuthCoreModule],
  controllers: [CheckoutController, OrdersController, SettleController],
  providers: [
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
    SessionAuthGuard,
    SessionCsrfGuard,
    CheckoutService,
    OrdersService,
    SettleService,
    SandboxPaymentAdapter,
    { provide: PAYMENT_PORT, useExisting: SandboxPaymentAdapter },
  ],
  exports: [CheckoutService, OrdersService, SettleService],
})
export class CommerceModule {}
