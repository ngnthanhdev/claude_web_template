import { Module } from "@nestjs/common";

import {
  AUTH_RANDOM_SOURCE,
  AuthCryptoService,
  systemAuthRandomSource,
} from "./auth-crypto.service.js";
import { AuthRateLimitService } from "./auth-rate-limit.service.js";
import {
  AUTH_CLOCK,
  AuthSessionService,
  systemAuthClock,
} from "./auth-session.service.js";

@Module({
  providers: [
    { provide: AUTH_RANDOM_SOURCE, useValue: systemAuthRandomSource },
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
    AuthCryptoService,
    AuthRateLimitService,
    AuthSessionService,
  ],
  exports: [AuthCryptoService, AuthRateLimitService, AuthSessionService],
})
export class AuthCoreModule {}
