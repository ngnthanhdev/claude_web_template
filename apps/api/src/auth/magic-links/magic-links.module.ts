import { Module } from "@nestjs/common";

import { AuthCoreModule } from "../core/auth-core.module.js";
import { EMAIL_DELIVERY_PORT } from "./email-delivery.port.js";
import { MagicLinksController } from "./magic-links.controller.js";
import { MagicLinksService } from "./magic-links.service.js";
import { NullEmailDeliveryAdapter } from "./null-email-delivery.adapter.js";

@Module({
  imports: [AuthCoreModule],
  controllers: [MagicLinksController],
  providers: [
    MagicLinksService,
    NullEmailDeliveryAdapter,
    {
      provide: EMAIL_DELIVERY_PORT,
      useExisting: NullEmailDeliveryAdapter,
    },
  ],
  exports: [EMAIL_DELIVERY_PORT],
})
export class MagicLinksModule {}
