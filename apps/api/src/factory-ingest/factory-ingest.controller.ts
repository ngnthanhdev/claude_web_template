import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import {
  factoryArtifactIngestRequestSchema,
  type FactoryArtifactIngestResponse,
} from "@marketplace/shared/seller";
import { ZodValidationException } from "nestjs-zod";
import { ZodError } from "zod";

import { FactoryIngestService } from "./factory-ingest.service.js";
import { FactorySignatureGuard } from "./factory-signature.guard.js";

function parseRequest<T>(
  schema: { parse(input: unknown): T },
  input: unknown,
): T {
  try {
    return schema.parse(input);
  } catch (error: unknown) {
    if (error instanceof ZodError) throw new ZodValidationException(error);
    throw error;
  }
}

/**
 * Server-to-server factory ingest route (design §2/§4/§6). Deliberately not
 * behind {@link SessionAuthGuard}/session CSRF — this route has no
 * browser-facing caller. {@link FactorySignatureGuard} is the only gate.
 */
@Controller("factory/artifacts")
export class FactoryIngestController {
  constructor(
    @Inject(FactoryIngestService)
    private readonly factoryIngest: FactoryIngestService,
  ) {}

  @Post()
  @UseGuards(FactorySignatureGuard)
  create(@Body() body: unknown): Promise<FactoryArtifactIngestResponse> {
    const parsed = parseRequest(factoryArtifactIngestRequestSchema, body);
    return this.factoryIngest.ingest(parsed);
  }
}
