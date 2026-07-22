import cookie from "@fastify/cookie";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  magicLinkInitiationResponseSchema,
  magicLinkRedemptionResponseSchema,
} from "@marketplace/shared/auth";
import request from "supertest";
import { ZodValidationPipe } from "nestjs-zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiExceptionFilter } from "../../common/filters/api-exception.filter.js";
import { SESSION_COOKIE_NAME } from "../core/auth-cookie.js";
import { MagicLinksController } from "./magic-links.controller.js";
import { MagicLinksService } from "./magic-links.service.js";
import { NullEmailDeliveryAdapter } from "./null-email-delivery.adapter.js";

const redemptionResponse = magicLinkRedemptionResponseSchema.parse({
  user: {
    id: "10000000-0000-4000-8000-000000000001",
    email: "buyer@example.com",
  },
  session: {
    id: "10000000-0000-4000-8000-000000000002",
    expiresAt: "2026-10-20T00:00:00.000Z",
  },
  csrfToken: Buffer.alloc(32, 7).toString("base64url"),
  returnTo: "/vi/account",
});

describe("MagicLinksController", () => {
  let app: NestFastifyApplication;
  const service = {
    initiate: vi.fn(),
    redeem: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MagicLinksController],
      providers: [{ provide: MagicLinksService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service.initiate.mockResolvedValue({ status: "accepted" });
    service.redeem.mockResolvedValue({
      response: redemptionResponse,
      sessionToken: Buffer.alloc(32, 8).toString("base64url"),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("normalizes initiation input and always exposes the shared 202 response", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/auth/magic-links")
      .send({ email: "  BUYER@Example.COM ", locale: "vi" })
      .expect(202);

    expect(magicLinkInitiationResponseSchema.parse(JSON.parse(response.text))).toEqual({
      status: "accepted",
    });
    expect(service.initiate).toHaveBeenCalledWith(
      {
        email: "buyer@example.com",
        locale: "vi",
        returnTo: "/vi/account",
      },
      expect.objectContaining({ ip: expect.any(String) }),
    );
  });

  it("maps malformed initiation and redemption bodies to the shared 422 envelope", async () => {
    const initiation = await request(app.getHttpServer())
      .post("/v1/auth/magic-links")
      .send({ email: "not-an-email", locale: "vi" })
      .expect(422);
    const redemption = await request(app.getHttpServer())
      .post("/v1/auth/magic-link-redemptions")
      .send({ token: "short" })
      .expect(422);

    expect(JSON.parse(initiation.text)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(JSON.parse(redemption.text)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(service.initiate).not.toHaveBeenCalled();
    expect(service.redeem).not.toHaveBeenCalled();
  });

  it("sets the exact host cookie and returns only the shared redemption response", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/auth/magic-link-redemptions")
      .send({ token: Buffer.alloc(32, 6).toString("base64url") })
      .expect(201);

    expect(magicLinkRedemptionResponseSchema.parse(JSON.parse(response.text))).toEqual(
      redemptionResponse,
    );
    expect(response.headers["set-cookie"]?.[0]).toContain(
      `${SESSION_COOKIE_NAME}=`,
    );
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("Secure");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");
    expect(response.headers["set-cookie"]?.[0]).toContain("Path=/");
    expect(response.text).not.toContain("sessionToken");
  });
});

describe("NullEmailDeliveryAdapter", () => {
  it("fails closed without exposing or persisting a delivery", async () => {
    const adapter = new NullEmailDeliveryAdapter();

    await expect(adapter.sendMagicLink({
      email: "buyer@example.com",
      locale: "vi",
      link: "https://app.kitvera.test/vi/auth/magic-link#token=opaque",
    })).resolves.toEqual({ status: "suppressed" });
  });
});
