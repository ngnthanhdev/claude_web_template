import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  createCheckout,
  getOrderById,
  issueDownload,
  listLibrary,
  listOrders,
  settlePaymentAttempt,
} from "./commerce-client";

const PRODUCT_ID = "2a80d74e-6f18-48a6-9034-7b79a8af93e9";
const ORDER_ID = "00000000-0000-4000-8000-000000000010";
const PAYMENT_ATTEMPT_ID = "00000000-0000-4000-8000-000000000011";
const ENTITLEMENT_ID = "00000000-0000-4000-8000-000000000012";
const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000099";
const CSRF_TOKEN = "csrf-token-value";

const orderItemSnapshot = {
  productId: PRODUCT_ID,
  version: "1.4.0",
  licenceIdentifier: "Regular",
  titleSnapshot: "Lotus Commerce",
  unitPrice: { amount: 1_290_000, currency: "VND" },
};

const orderBody = {
  id: ORDER_ID,
  status: "settled",
  total: { amount: 1_290_000, currency: "VND" },
  createdAt: "2026-08-01T00:00:00.000Z",
  items: [orderItemSnapshot],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetchOnce(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function calledInit(fetchMock: ReturnType<typeof stubFetchOnce>): RequestInit {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return init;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCheckout", () => {
  const checkoutInput = {
    items: [{ productId: PRODUCT_ID, licence: "Regular" as const }],
    idempotencyKey: IDEMPOTENCY_KEY,
  };

  it("posts a request built only from the shared checkout schema and validates the response", async () => {
    const fetchMock = stubFetchOnce(
      jsonResponse({
        orderId: ORDER_ID,
        status: "pending",
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
      }),
    );

    await expect(createCheckout(checkoutInput, CSRF_TOKEN)).resolves.toEqual({
      orderId: ORDER_ID,
      status: "pending",
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
    });

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/checkout");
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(checkoutInput);
  });

  it("sends the session CSRF token on the checkout mutation", async () => {
    const fetchMock = stubFetchOnce(
      jsonResponse({
        orderId: ORDER_ID,
        status: "pending",
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
      }),
    );

    await createCheckout(checkoutInput, CSRF_TOKEN);

    expect(new Headers(calledInit(fetchMock).headers).get("x-csrf-token")).toBe(
      CSRF_TOKEN,
    );
  });

  it("rejects a request carrying a price/total field the shared schema does not allow", async () => {
    // Deliberately smuggling a client-supplied total: the shared checkout
    // request schema has no such field, so this must be rejected even though
    // `tamperedInput` type-checks as a plain object.
    const tamperedInput = {
      ...checkoutInput,
      total: { amount: 1, currency: "VND" },
    };

    await expect(
      createCheckout(tamperedInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects a malformed checkout response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ orderId: ORDER_ID, status: "pending" }));

    await expect(
      createCheckout(checkoutInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("settlePaymentAttempt", () => {
  it("posts to the payment-attempt settle endpoint with the CSRF header and validates the order", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(orderBody));

    await expect(
      settlePaymentAttempt(PAYMENT_ATTEMPT_ID, CSRF_TOKEN),
    ).resolves.toEqual(orderBody);

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(
      `/api/v1/payment-attempts/${PAYMENT_ATTEMPT_ID}/settle`,
    );
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-csrf-token")).toBe(CSRF_TOKEN);
  });

  it("rejects a settle response carrying a persistence-only field (e.g. a payment reference)", async () => {
    stubFetchOnce(
      jsonResponse({ ...orderBody, paymentReference: "sandbox-ref-123" }),
    );

    await expect(
      settlePaymentAttempt(PAYMENT_ATTEMPT_ID, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("listOrders", () => {
  it("validates the cursor-paginated order collection response", async () => {
    const responseBody = {
      data: [orderBody],
      meta: { nextCursor: null, hasMore: false },
    };
    const fetchMock = stubFetchOnce(jsonResponse(responseBody));

    await expect(listOrders()).resolves.toEqual(responseBody);
    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/orders?");
  });

  it("rejects a malformed order collection response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ data: [orderBody] }));

    await expect(listOrders()).rejects.toBeInstanceOf(ZodError);
  });
});

describe("getOrderById", () => {
  it("fetches one owned order and validates the allowlisted order DTO", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(orderBody));

    await expect(getOrderById(ORDER_ID)).resolves.toEqual(orderBody);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/orders/${ORDER_ID}`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("rejects an order response leaking a payment reference or provider field", async () => {
    stubFetchOnce(jsonResponse({ ...orderBody, provider: "sandbox" }));

    await expect(getOrderById(ORDER_ID)).rejects.toBeInstanceOf(ZodError);
  });
});

describe("listLibrary", () => {
  it("validates the entitlement library response", async () => {
    const responseBody = {
      data: [
        {
          id: ENTITLEMENT_ID,
          productId: PRODUCT_ID,
          version: "1.4.0",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      meta: { nextCursor: null, hasMore: false },
    };
    stubFetchOnce(jsonResponse(responseBody));

    await expect(listLibrary()).resolves.toEqual(responseBody);
  });

  it("rejects a malformed library response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ data: [{ productId: PRODUCT_ID }] }));

    await expect(listLibrary()).rejects.toBeInstanceOf(ZodError);
  });
});

describe("issueDownload", () => {
  it("POSTs to issue only (no token in the request target) with the CSRF header", async () => {
    const fetchMock = stubFetchOnce(
      jsonResponse({
        url: "https://cdn.kitvera.example/downloads/abc",
        expiresAt: "2026-08-01T00:05:00.000Z",
      }),
    );

    const result = await issueDownload(ENTITLEMENT_ID, CSRF_TOKEN);

    expect(result).toEqual({
      url: "https://cdn.kitvera.example/downloads/abc",
      expiresAt: "2026-08-01T00:05:00.000Z",
    });

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(`/api/v1/entitlements/${ENTITLEMENT_ID}/download`);
    expect(calledPath).not.toContain("token");
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get("x-csrf-token")).toBe(CSRF_TOKEN);
  });

  it("never logs the issued download URL/token", async () => {
    stubFetchOnce(
      jsonResponse({
        url: "https://cdn.kitvera.example/downloads/secret-token-abc",
        expiresAt: "2026-08-01T00:05:00.000Z",
      }),
    );
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];

    await issueDownload(ENTITLEMENT_ID, CSRF_TOKEN);

    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it("rejects a malformed download-issue response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ url: "https://cdn.kitvera.example/x" }));

    await expect(
      issueDownload(ENTITLEMENT_ID, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
