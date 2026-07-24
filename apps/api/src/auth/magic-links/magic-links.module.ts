import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../config/env.js";
import { AuthCoreModule } from "../core/auth-core.module.js";
import { resolveEmailDeliveryPort } from "./capture-email-delivery.adapter.js";
import { EMAIL_DELIVERY_PORT } from "./email-delivery.port.js";
import { MagicLinksController } from "./magic-links.controller.js";
import {
  MAGIC_LINK_INITIATION_RESPONSE_EQUALIZER,
  MagicLinksService,
  SystemMagicLinkInitiationResponseEqualizer,
} from "./magic-links.service.js";

@Module({
  imports: [AuthCoreModule],
  controllers: [MagicLinksController],
  providers: [
    MagicLinksService,
    SystemMagicLinkInitiationResponseEqualizer,
    {
      provide: EMAIL_DELIVERY_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        resolveEmailDeliveryPort({
          nodeEnv: config.getOrThrow<Env["NODE_ENV"]>("NODE_ENV"),
          captureFilePath: process.env.E2E_MAGIC_LINK_CAPTURE_FILE,
        }),
    },
    {
      provide: MAGIC_LINK_INITIATION_RESPONSE_EQUALIZER,
      useExisting: SystemMagicLinkInitiationResponseEqualizer,
    },
  ],
  exports: [EMAIL_DELIVERY_PORT, MAGIC_LINK_INITIATION_RESPONSE_EQUALIZER],
})
export class MagicLinksModule {}
