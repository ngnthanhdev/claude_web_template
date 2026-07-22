import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import {
  CATALOGUE_CURSOR_SIGNING_SECRET,
  CatalogueCursor,
} from "./catalogue-cursor.js";
import { CatalogueController } from "./catalogue.controller.js";
import { CatalogueService } from "./catalogue.service.js";

@Module({
  imports: [ConfigModule],
  controllers: [CatalogueController],
  providers: [
    CatalogueCursor,
    CatalogueService,
    {
      provide: CATALOGUE_CURSOR_SIGNING_SECRET,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.getOrThrow<string>("CATALOGUE_CURSOR_SIGNING_SECRET"),
    },
  ],
  exports: [CatalogueService],
})
export class CatalogueModule {}
