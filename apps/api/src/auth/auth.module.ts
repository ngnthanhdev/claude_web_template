import { Module } from "@nestjs/common";

import { AuthCoreModule } from "./core/auth-core.module.js";
import { MagicLinksModule } from "./magic-links/magic-links.module.js";
import { SessionsModule } from "./sessions/sessions.module.js";

/**
 * Aggregates the passwordless auth surface. The core security services live in
 * {@link AuthCoreModule}; both feature modules import it themselves, so this
 * module only has to compose the two HTTP-facing feature modules. Nest
 * de-duplicates the shared {@link AuthCoreModule} import, so no provider is
 * instantiated twice.
 */
@Module({
  imports: [AuthCoreModule, MagicLinksModule, SessionsModule],
})
export class AuthModule {}
