import helmet from "@fastify/helmet";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";
import { configureApp } from "./bootstrap/configure-app.js";
import { requestLogSerializer } from "./common/request-log-serializer.js";
import type { Env } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        // The single-use download token is never recorded in the access log
        // (design §9 "Signed download URL / Info disclosure") — only that
        // path segment is masked, every other request field logs as normal.
        serializers: { req: requestLogSerializer },
      },
    }),
  );
  const config = app.get(ConfigService<Env, true>);
  const corsOrigins = config
    .getOrThrow<string>("CORS_ORIGIN")
    .split(",")
    .map((origin) => origin.trim());

  await configureApp(app);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  await app.register(helmet);
  app.enableShutdownHooks();

  await app.listen(config.getOrThrow<number>("PORT"), "0.0.0.0");
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger("Bootstrap");
  logger.error(
    "API failed to start",
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
