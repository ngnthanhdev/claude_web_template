import { Module } from "@nestjs/common";

import { AuthCoreModule } from "../core/auth-core.module.js";
import { EMAIL_DELIVERY_PORT } from "./email-delivery.port.js";
import { MagicLinksController } from "./magic-links.controller.js";
import {
  MAGIC_LINK_INITIATION_RESPONSE_EQUALIZER,
  MagicLinksService,
  SystemMagicLinkInitiationResponseEqualizer,
} from "./magic-links.service.js";
import { NullEmailDeliveryAdapter } from "./null-email-delivery.adapter.js";

@Module({
  imports: [AuthCoreModule],
  controllers: [MagicLinksController],
  providers: [
    MagicLinksService,
    NullEmailDeliveryAdapter,
    SystemMagicLinkInitiationResponseEqualizer,
    {
      provide: EMAIL_DELIVERY_PORT,
      useExisting: NullEmailDeliveryAdapter,
    },
    {
      provide: MAGIC_LINK_INITIATION_RESPONSE_EQUALIZER,
      useExisting: SystemMagicLinkInitiationResponseEqualizer,
    },
  ],
  exports: [EMAIL_DELIVERY_PORT, MAGIC_LINK_INITIATION_RESPONSE_EQUALIZER],
})
export class MagicLinksModule {}
