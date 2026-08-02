import { Module } from "@nestjs/common";

import { FactoryIngestController } from "./factory-ingest.controller.js";
import { FactoryIngestService } from "./factory-ingest.service.js";
import { FactorySignatureGuard } from "./factory-signature.guard.js";

/**
 * Factory -> API signed-artifact ingest resource (design §2/§4/§6). Only
 * this task's own controller/providers are registered here; wiring
 * `FactoryIngestModule` into the composed `AppModule` is a later task.
 */
@Module({
  controllers: [FactoryIngestController],
  providers: [FactoryIngestService, FactorySignatureGuard],
  exports: [FactoryIngestService],
})
export class FactoryIngestModule {}
