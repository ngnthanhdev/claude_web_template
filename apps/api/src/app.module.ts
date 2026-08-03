import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AdminModule } from "./admin/admin.module.js";
import { AdminCatalogueModule } from "./admin/catalogue/admin-catalogue.module.js";
import { AdminMfaModule } from "./admin/mfa/admin-mfa.module.js";
import { AdminPublicationModule } from "./admin/publication/admin-publication.module.js";
import { AdminUsersModule } from "./admin/users/admin-users.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CatalogueModule } from "./catalogue/catalogue.module.js";
import { CommerceModule } from "./commerce/commerce.module.js";
import { validateEnv } from "./config/env.js";
import { EntitlementsModule } from "./entitlements/entitlements.module.js";
import { FactoryIngestModule } from "./factory-ingest/factory-ingest.module.js";
import { HealthModule } from "./health/health.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { SellerModule } from "./seller/seller.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    CatalogueModule,
    AuthModule,
    CommerceModule,
    EntitlementsModule,
    SellerModule,
    FactoryIngestModule,
    // Registered directly (not only transitively via the resource modules
    // below) so its `AdminBootstrapService` provider is instantiated exactly
    // once in the composed graph and its `onApplicationBootstrap` startup
    // grant actually fires. Every admin resource module below re-imports
    // `AdminModule` for its guards/audit service — Nest de-dupes a module
    // imported multiple times across the graph, so this causes no duplicate
    // provider registration.
    AdminModule,
    AdminMfaModule,
    AdminCatalogueModule,
    AdminPublicationModule,
    AdminUsersModule,
  ],
})
export class AppModule {}
