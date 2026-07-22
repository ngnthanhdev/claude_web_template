import {
  Controller,
  Get,
  VersioningType,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  apiErrorSchema,
  healthResponseSchema,
} from "@marketplace/shared/api";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../app.module.js";
import { ApiExceptionFilter } from "../common/filters/api-exception.filter.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("test-errors")
class ThrowingController {
  @Get()
  fail(): never {
    throw new Error("sensitive internal failure");
  }
}

describe("API foundation", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ThrowingController],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: "1",
    });
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves the shared health contract at the unversioned root route", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(healthResponseSchema.parse(JSON.parse(response.text))).toEqual({
      status: "ok",
    });
    await request(app.getHttpServer()).get("/v1/health").expect(404);
  });

  it("prefixes regular resources and safely envelopes unexpected errors", async () => {
    await request(app.getHttpServer()).get("/test-errors").expect(404);
    const response = await request(app.getHttpServer())
      .get("/v1/test-errors")
      .expect(500);
    const body = apiErrorSchema.parse(JSON.parse(response.text));

    expect(body).toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      },
    });
    expect(response.text).not.toContain("sensitive internal failure");
    expect(response.text).not.toContain("stack");
  });
});
