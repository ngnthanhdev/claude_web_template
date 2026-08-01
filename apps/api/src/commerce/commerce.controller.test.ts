import { ForbiddenException, HttpStatus } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { apiErrorSchema } from "@marketplace/shared/api";
import {
  checkoutResponseSchema,
  orderSchema,
} from "@marketplace/shared/commerce";
import { ZodValidationException } from "nestjs-zod";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { configureApp } from "../bootstrap/configure-app.js";
import { AuthCryptoService } from "../auth/core/auth-crypto.service.js";
import { AUTH_CLOCK } from "../auth/core/auth-session.service.js";
import { AuthSessionService } from "../auth/core/auth-session.service.js";
import { SessionAuthGuard } from "../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../auth/sessions/session-csrf.guard.js";
import { SESSION_COOKIE_NAME } from "../auth/core/auth-cookie.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { CheckoutController } from "./checkout.controller.js";
import { CheckoutService } from "./checkout.service.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService, mapOrderToDto } from "./orders.service.js";
import { SandboxPaymentAdapter } from "./payment/sandbox-payment.adapter.js";
import { SettleController } from "./settle.controller.js";
import { SettleService } from "./settle.service.js";

const rawSessionToken = Buffer.alloc(32, 21).toString("base64url");
const csrfToken = Buffer.alloc(32, 22).toString("base64url");
const sessionId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const otherUserId = "10000000-0000-4000-8000-000000000099";
const productId = "20000000-0000-4000-8000-000000000001";
const idempotencyKey = "30000000-0000-4000-8000-000000000001";
const paymentAttemptId = "40000000-0000-4000-8000-000000000001";
const idleExpiresAt = new Date("2026-08-21T00:00:00.000Z");
const absoluteExpiresAt = new Date("2026-10-20T00:00:00.000Z");
const now = new Date("2026-07-22T00:00:00.000Z");

function cookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

describe("Commerce controllers", () => {
  let app: NestFastifyApplication;
  const checkout = { checkout: vi.fn() };
  const orders = { list: vi.fn(), findOne: vi.fn() };
  const settle = { settle: vi.fn() };
  const sessions = {
    resolveSession: vi.fn(),
    verifyCsrf: vi.fn(),
  };
  const crypto = {
    hashSessionToken: vi.fn(),
    deriveCsrfToken: vi.fn(),
  };
  const clock = { now: vi.fn() };
  const prisma = { session: { findUnique: vi.fn() } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CheckoutController, OrdersController, SettleController],
      providers: [
        SessionAuthGuard,
        SessionCsrfGuard,
        { provide: CheckoutService, useValue: checkout },
        { provide: OrdersService, useValue: orders },
        { provide: SettleService, useValue: settle },
        { provide: AuthSessionService, useValue: sessions },
        { provide: AuthCryptoService, useValue: crypto },
        { provide: AUTH_CLOCK, useValue: clock },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clock.now.mockReturnValue(now);
    crypto.hashSessionToken.mockReturnValue("stored-session-hash");
    crypto.deriveCsrfToken.mockReturnValue(csrfToken);
    prisma.session.findUnique.mockResolvedValue({
      id: sessionId,
      csrfHash: "stored-csrf-hash",
      idleExpiresAt,
      absoluteExpiresAt,
      revokedAt: null,
      rotatedToId: null,
      user: { id: userId, normalizedEmail: "buyer@example.com" },
    });
    sessions.resolveSession.mockResolvedValue({
      sessionId,
      user: { id: userId, email: "buyer@example.com" },
      csrfToken,
      idleExpiresAt,
      absoluteExpiresAt,
      replacementSessionToken: null,
    });
    sessions.verifyCsrf.mockReturnValue(true);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("CheckoutController", () => {
    const validBody = {
      items: [{ productId, licence: "Regular" }],
      idempotencyKey,
    };

    it("returns the shared 401 envelope when the session cookie is absent", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/checkout")
        .send(validBody)
        .expect(HttpStatus.UNAUTHORIZED);
      expect(apiErrorSchema.parse(response.body)).toMatchObject({
        error: { code: "SESSION_UNAUTHENTICATED" },
      });
      expect(checkout.checkout).not.toHaveBeenCalled();
    });

    it("requires the session-bound CSRF token", async () => {
      await request(app.getHttpServer())
        .post("/v1/checkout")
        .set("Cookie", cookieHeader())
        .send(validBody)
        .expect(HttpStatus.FORBIDDEN);
      expect(checkout.checkout).not.toHaveBeenCalled();
    });

    it("returns the shared 422 envelope for a malformed checkout body", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/checkout")
        .set("Cookie", cookieHeader())
        .set("X-CSRF-Token", csrfToken)
        .send({})
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(apiErrorSchema.parse(response.body)).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
      expect(checkout.checkout).not.toHaveBeenCalled();
    });

    it("rejects a checkout body that smuggles a price or owner id", async () => {
      await request(app.getHttpServer())
        .post("/v1/checkout")
        .set("Cookie", cookieHeader())
        .set("X-CSRF-Token", csrfToken)
        .send({
          ...validBody,
          userId: otherUserId,
          totalMinor: 1,
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(checkout.checkout).not.toHaveBeenCalled();
    });

    it("delegates the server-resolved user id and parsed body to the service", async () => {
      const serviceResponse = checkoutResponseSchema.parse({
        orderId: "50000000-0000-4000-8000-000000000001",
        status: "pending",
        paymentAttemptId,
      });
      checkout.checkout.mockResolvedValue(serviceResponse);

      const response = await request(app.getHttpServer())
        .post("/v1/checkout")
        .set("Cookie", cookieHeader())
        .set("X-CSRF-Token", csrfToken)
        .send(validBody)
        .expect(HttpStatus.CREATED);

      expect(checkoutResponseSchema.parse(response.body)).toEqual(
        serviceResponse,
      );
      expect(checkout.checkout).toHaveBeenCalledWith(userId, validBody);
    });
  });

  describe("OrdersController", () => {
    it("returns the shared 401 envelope when the session cookie is absent", async () => {
      await request(app.getHttpServer())
        .get("/v1/orders")
        .expect(HttpStatus.UNAUTHORIZED);
      expect(orders.list).not.toHaveBeenCalled();
    });

    it("delegates the server-resolved user id with default paging", async () => {
      orders.list.mockResolvedValue({
        data: [],
        meta: { nextCursor: null, hasMore: false },
      });

      await request(app.getHttpServer())
        .get("/v1/orders")
        .set("Cookie", cookieHeader())
        .expect(HttpStatus.OK);

      expect(orders.list).toHaveBeenCalledWith(userId, { limit: 20 });
    });

    it("returns the shared 422 envelope for an out-of-range limit", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/orders?limit=500")
        .set("Cookie", cookieHeader())
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(apiErrorSchema.parse(response.body)).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
      expect(orders.list).not.toHaveBeenCalled();
    });

    it("delegates a single-order lookup scoped to the server-resolved user", async () => {
      const orderId = "50000000-0000-4000-8000-000000000002";
      const dto = orderSchema.parse({
        id: orderId,
        status: "pending",
        total: { amount: 500_000, currency: "VND" },
        createdAt: now.toISOString(),
        items: [
          {
            productId,
            version: "1.0.0",
            licenceIdentifier: "Regular",
            titleSnapshot: "Aurora",
            unitPrice: { amount: 500_000, currency: "VND" },
          },
        ],
      });
      orders.findOne.mockResolvedValue(dto);

      const response = await request(app.getHttpServer())
        .get(`/v1/orders/${orderId}`)
        .set("Cookie", cookieHeader())
        .expect(HttpStatus.OK);

      expect(orderSchema.parse(response.body)).toEqual(dto);
      expect(orders.findOne).toHaveBeenCalledWith(userId, orderId);
    });

    it("returns the shared 422 envelope for a malformed order id", async () => {
      await request(app.getHttpServer())
        .get("/v1/orders/not-a-uuid")
        .set("Cookie", cookieHeader())
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(orders.findOne).not.toHaveBeenCalled();
    });
  });

  describe("SettleController", () => {
    it("returns the shared 401 envelope when the session cookie is absent", async () => {
      await request(app.getHttpServer())
        .post(`/v1/payment-attempts/${paymentAttemptId}/settle`)
        .expect(HttpStatus.UNAUTHORIZED);
      expect(settle.settle).not.toHaveBeenCalled();
    });

    it("requires the session-bound CSRF token", async () => {
      await request(app.getHttpServer())
        .post(`/v1/payment-attempts/${paymentAttemptId}/settle`)
        .set("Cookie", cookieHeader())
        .expect(HttpStatus.FORBIDDEN);
      expect(settle.settle).not.toHaveBeenCalled();
    });

    it("delegates the server-resolved user id and payment attempt id", async () => {
      const dto = orderSchema.parse({
        id: "50000000-0000-4000-8000-000000000003",
        status: "settled",
        total: { amount: 500_000, currency: "VND" },
        createdAt: now.toISOString(),
        items: [
          {
            productId,
            version: "1.0.0",
            licenceIdentifier: "Regular",
            titleSnapshot: "Aurora",
            unitPrice: { amount: 500_000, currency: "VND" },
          },
        ],
      });
      settle.settle.mockResolvedValue(dto);

      const response = await request(app.getHttpServer())
        .post(`/v1/payment-attempts/${paymentAttemptId}/settle`)
        .set("Cookie", cookieHeader())
        .set("X-CSRF-Token", csrfToken)
        .expect(HttpStatus.OK);

      expect(orderSchema.parse(response.body)).toEqual(dto);
      expect(settle.settle).toHaveBeenCalledWith(userId, paymentAttemptId);
    });
  });
});

describe("CheckoutService boundaries", () => {
  const prisma = {
    order: { count: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    product: { findMany: vi.fn() },
  };
  let service: CheckoutService;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.order.count.mockResolvedValue(0);
    prisma.order.findUnique.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(CheckoutService);
  });

  const request = {
    items: [{ productId, licence: "Regular" as const }],
    idempotencyKey,
  };

  it("rejects checkout once the rolling per-user attempt cap is reached", async () => {
    prisma.order.count.mockResolvedValue(20);

    await expect(service.checkout(userId, request)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown or unpublished product with 404", async () => {
    prisma.product.findMany.mockResolvedValue([]);

    await expect(service.checkout(userId, request)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("rejects a licence the product does not offer with 422", async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: productId,
        currentVersion: "1.0.0",
        licenceOptions: [
          {
            identifier: "Extended",
            prices: [{ currency: "VND", amount: 900_000 }],
          },
        ],
        translations: [{ title: "Aurora" }],
      },
    ]);

    await expect(service.checkout(userId, request)).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
    });
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("computes the order total from the catalogue price only, never a client-sent amount", async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: productId,
        currentVersion: "1.0.0",
        licenceOptions: [
          {
            identifier: "Regular",
            prices: [{ currency: "VND", amount: 500_000 }],
          },
        ],
        translations: [{ title: "Aurora" }],
      },
    ]);
    prisma.order.create.mockResolvedValue({
      id: "60000000-0000-4000-8000-000000000001",
      userId,
      status: "pending",
      paymentAttempts: [{ id: paymentAttemptId }],
    });

    const response = await service.checkout(userId, request);

    expect(response).toEqual({
      orderId: "60000000-0000-4000-8000-000000000001",
      status: "pending",
      paymentAttemptId,
    });
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          currency: "VND",
          subtotalMinor: 500_000,
          discountMinor: 0,
          totalMinor: 500_000,
          idempotencyKey,
        }),
      }),
    );
  });

  it("replays the caller's own order on a repeated idempotency key without creating a duplicate", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: "60000000-0000-4000-8000-000000000002",
      userId,
      status: "pending",
      paymentAttempts: [{ id: paymentAttemptId }],
    });

    const response = await service.checkout(userId, request);

    expect(response).toEqual({
      orderId: "60000000-0000-4000-8000-000000000002",
      status: "pending",
      paymentAttemptId,
    });
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("never leaks another user's order when their idempotency key is replayed", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: "60000000-0000-4000-8000-000000000003",
      userId: otherUserId,
      status: "pending",
      paymentAttempts: [{ id: paymentAttemptId }],
    });

    await expect(service.checkout(userId, request)).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("returns the pre-existing order when a concurrent duplicate hits the unique constraint", async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: productId,
        currentVersion: "1.0.0",
        licenceOptions: [
          {
            identifier: "Regular",
            prices: [{ currency: "VND", amount: 500_000 }],
          },
        ],
        translations: [{ title: "Aurora" }],
      },
    ]);
    prisma.order.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    prisma.order.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "60000000-0000-4000-8000-000000000004",
      userId,
      status: "pending",
      paymentAttempts: [{ id: paymentAttemptId }],
    });

    const response = await service.checkout(userId, request);

    expect(response).toEqual({
      orderId: "60000000-0000-4000-8000-000000000004",
      status: "pending",
      paymentAttemptId,
    });
  });
});

describe("SandboxPaymentAdapter", () => {
  it("disables settlement in production and allows it otherwise", () => {
    const config = { get: vi.fn() };
    const adapter = new SandboxPaymentAdapter(
      config as unknown as ConstructorParameters<
        typeof SandboxPaymentAdapter
      >[0],
    );

    config.get.mockReturnValue("production");
    expect(() => adapter.assertSettlementAllowed()).toThrow(ForbiddenException);

    config.get.mockReturnValue("test");
    expect(() => adapter.assertSettlementAllowed()).not.toThrow();
  });

  it("confirms settlement with a timestamp", async () => {
    const config = { get: vi.fn().mockReturnValue("test") };
    const adapter = new SandboxPaymentAdapter(
      config as unknown as ConstructorParameters<
        typeof SandboxPaymentAdapter
      >[0],
    );

    const outcome = await adapter.confirmSettlement({ paymentAttemptId });
    expect(outcome.settledAt).toBeInstanceOf(Date);
  });
});

describe("SettleService boundaries", () => {
  const prisma = {
    paymentAttempt: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  const paymentPort = {
    provider: "sandbox" as const,
    assertSettlementAllowed: vi.fn(),
    confirmSettlement: vi.fn(),
  };
  let service: SettleService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettleService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: (await import("./payment/payment.port.js")).PAYMENT_PORT,
          useValue: paymentPort,
        },
      ],
    }).compile();
    service = moduleRef.get(SettleService);
  });

  it("checks the environment gate before touching the database", async () => {
    paymentPort.assertSettlementAllowed.mockImplementation(() => {
      throw new ForbiddenException("disabled");
    });

    await expect(
      service.settle(userId, paymentAttemptId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.paymentAttempt.findUnique).not.toHaveBeenCalled();
  });

  it("hides a missing payment attempt behind 404", async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue(null);

    await expect(
      service.settle(userId, paymentAttemptId),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
  });

  it("hides a non-owned payment attempt behind 404 (BOLA)", async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: paymentAttemptId,
      status: "pending",
      order: {
        id: "70000000-0000-4000-8000-000000000001",
        userId: otherUserId,
        status: "pending",
        items: [],
      },
    });

    await expect(
      service.settle(userId, paymentAttemptId),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    expect(paymentPort.confirmSettlement).not.toHaveBeenCalled();
  });

  it("replays an already-settled attempt without re-triggering the payment port or a new transaction", async () => {
    const settledOrder = {
      id: "70000000-0000-4000-8000-000000000002",
      userId,
      status: "settled" as const,
      subtotalMinor: 500_000,
      discountMinor: 0,
      totalMinor: 500_000,
      currency: "VND" as const,
      idempotencyKey,
      createdAt: now,
      settledAt: now,
      items: [
        {
          id: "80000000-0000-4000-8000-000000000001",
          orderId: "70000000-0000-4000-8000-000000000002",
          productId,
          version: "1.0.0",
          licenceIdentifier: "Regular" as const,
          titleSnapshot: "Aurora",
          unitPriceMinor: 500_000,
          currency: "VND" as const,
        },
      ],
    };
    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: paymentAttemptId,
      status: "settled",
      order: settledOrder,
    });

    const response = await service.settle(userId, paymentAttemptId);

    expect(response).toEqual(mapOrderToDto(settledOrder));
    expect(paymentPort.confirmSettlement).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects settling an attempt that is not pending", async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: paymentAttemptId,
      status: "failed",
      order: {
        id: "70000000-0000-4000-8000-000000000003",
        userId,
        status: "pending",
        items: [],
      },
    });

    await expect(
      service.settle(userId, paymentAttemptId),
    ).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
    });
    expect(paymentPort.confirmSettlement).not.toHaveBeenCalled();
  });
});

describe("OrdersService boundaries", () => {
  const prisma = {
    order: { findMany: vi.fn(), findFirst: vi.fn() },
  };
  let service: OrdersService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it("rejects a tampered or malformed cursor without querying the database", async () => {
    await expect(
      service.list(userId, { cursor: "not-a-valid-cursor", limit: 20 }),
    ).rejects.toBeInstanceOf(ZodValidationException);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it("scopes every list query to the caller's own userId", async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await service.list(userId, { limit: 20 });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId } }),
    );
  });

  it("hides a non-owned order id behind 404 (BOLA)", async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(userId, "70000000-0000-4000-8000-000000000009"),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "70000000-0000-4000-8000-000000000009", userId },
      }),
    );
  });
});
