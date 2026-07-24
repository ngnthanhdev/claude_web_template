import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/bootstrap/configure-app.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { ApiClientError, apiClient } from "../../web/src/lib/api-client.js";

describe("API-to-web health boundary", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await app.close();
  });

  function routeWebRequestsThroughApi(): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? `${input.pathname}${input.search}`
              : new URL(input.url).pathname;
        const response = await request(app.getHttpServer()).get(path);
        const contentType = response.headers["content-type"];

        return new Response(response.text, {
          headers: {
            "content-type":
              typeof contentType === "string"
                ? contentType
                : "application/json",
          },
          status: response.status,
          statusText: response.status === 404 ? "Not Found" : "OK",
        });
      }),
    );
  }

  it("lets the web client consume the API health response", async () => {
    routeWebRequestsThroughApi();

    // The web client exposes no dedicated `health()` wrapper (the storefront
    // never calls it, and `/health` is version-neutral so it isn't reachable
    // through the `/v1`-only same-origin proxy); the boundary is exercised via
    // the generic typed `get` against the real health endpoint.
    await expect(
      apiClient.get("/health", z.object({ status: z.literal("ok") })),
    ).resolves.toEqual({ status: "ok" });
  });

  it("maps an API error envelope into the web client's typed error", async () => {
    routeWebRequestsThroughApi();

    const failure: unknown = await apiClient
      .get("/v1/missing", z.unknown())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiClientError);
    expect(failure).toEqual(
      expect.objectContaining({
        code: "NOT_FOUND",
        message: "Cannot GET /v1/missing",
        status: 404,
      }),
    );
  });
});
