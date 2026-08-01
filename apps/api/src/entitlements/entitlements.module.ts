import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { AuthCoreModule } from "../auth/core/auth-core.module.js";
import {
  AUTH_CLOCK,
  systemAuthClock,
} from "../auth/core/auth-session.service.js";
import { SessionAuthGuard } from "../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../auth/sessions/session-csrf.guard.js";
import type { Env } from "../config/env.js";
import { DownloadAuditService } from "./downloads/download-audit.service.js";
import { DownloadTokenController } from "./downloads/download-token.controller.js";
import {
  LocalStorageAdapter,
  resolveStoragePort,
} from "./downloads/local-storage.adapter.js";
import { STORAGE_PORT } from "./downloads/storage.port.js";
import { EntitlementsController } from "./entitlements.controller.js";
import { EntitlementsService } from "./entitlements.service.js";

/**
 * Not registered into `app.module.ts` by this task — `T-7b2d84` wires it
 * alongside the checkout/settle/orders module.
 */
@Module({
  imports: [AuthCoreModule, ConfigModule],
  controllers: [EntitlementsController, DownloadTokenController],
  providers: [
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
    SessionAuthGuard,
    SessionCsrfGuard,
    EntitlementsService,
    DownloadAuditService,
    {
      provide: LocalStorageAdapter,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new LocalStorageAdapter(
          config.getOrThrow<string>("LOCAL_ARTIFACT_STORAGE_DIR"),
          config.getOrThrow<string>("DOWNLOAD_TOKEN_HMAC_SECRET"),
        ),
    },
    {
      provide: STORAGE_PORT,
      inject: [ConfigService, LocalStorageAdapter],
      useFactory: (
        config: ConfigService<Env, true>,
        localAdapter: LocalStorageAdapter,
      ) =>
        resolveStoragePort({
          nodeEnv: config.getOrThrow<Env["NODE_ENV"]>("NODE_ENV"),
          localAdapter,
        }),
    },
  ],
})
export class EntitlementsModule {}
