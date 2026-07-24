import cookie from "@fastify/cookie";
import { VersioningType } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { ZodValidationPipe } from "nestjs-zod";

import { ApiExceptionFilter } from "../common/filters/api-exception.filter.js";

/**
 * Applies the request-handling wiring shared by the production bootstrap
 * (main.ts) and the integration/e2e suites: URI versioning, the global Zod
 * validation pipe, the shared exception filter, and `@fastify/cookie`.
 *
 * Network binding (CORS, Helmet, `listen`) stays in main.ts because it depends
 * on ConfigService and runtime origins. Keeping this helper the single source
 * of truth means a future global guard/interceptor added here is exercised by
 * every test, not just production.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.register(cookie);
}
