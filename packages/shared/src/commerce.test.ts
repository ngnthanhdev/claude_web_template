import { describe, expect, it } from "vitest";

import {
  checkoutRequestSchema,
  checkoutResponseSchema,
  downloadIssueResponseSchema,
  entitlementSchema,
  libraryResponseSchema,
  orderDetailResponseSchema,
  orderSummarySchema,
} from "./index.js";

const validCheckoutRequest = {
  items: [
    {
      productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
      licence: "Regular",
    },
    {
      productId: "97e1176d-b7dc-4984-9fad-243f53788c1b",
      licence: "Extended",
    },
  ],
  idempotencyKey: "5c5a2c9e-2f3f-4a6b-9d0e-2f5a2f3c4d5e",
  discountCode: "LAUNCH25",
};

const orderItemSnapshot = {
  productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  version: "1.4.0",
  licenceIdentifier: "Regular",
  titleSnapshot: "Lotus Commerce",
  unitPrice: { amount: 1_290_000, currency: "VND" },
};

const order = {
  id: "8f2f8e14-2b4a-4c8e-9a0e-6e5f1b2c3d4e",
  status: "settled",
  total: { amount: 1_290_000, currency: "VND" },
  createdAt: "2026-07-20T08:30:00.000Z",
  items: [orderItemSnapshot],
};

const entitlement = {
  id: "3b6e1c2a-4f5d-4e6f-8a9b-0c1d2e3f4a5b",
  productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  version: "1.4.0",
  createdAt: "2026-07-20T08:30:00.000Z",
};

describe("checkout request contract", () => {
  it("accepts a representative valid checkout payload", () => {
    expect(checkoutRequestSchema.parse(validCheckoutRequest)).toEqual(
      validCheckoutRequest,
    );
    expect(
      checkoutRequestSchema.safeParse({
        items: validCheckoutRequest.items,
        idempotencyKey: validCheckoutRequest.idempotencyKey,
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate items with the same product and licence", () => {
    const line = {
      productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
      licence: "Regular",
    };
    expect(
      checkoutRequestSchema.safeParse({
        ...validCheckoutRequest,
        items: [line, line],
      }).success,
    ).toBe(false);
  });

  it("carries no price, discount amount, currency total, or owner id", () => {
    for (const smuggledField of [
      { totalMinor: 129_000_0 },
      { subtotalMinor: 129_000_0 },
      { discountMinor: 0 },
      { currency: "VND" },
      { userId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9" },
    ]) {
      expect(
        checkoutRequestSchema.safeParse({
          ...validCheckoutRequest,
          ...smuggledField,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects money/owner fields smuggled onto an item", () => {
    expect(
      checkoutRequestSchema.safeParse({
        ...validCheckoutRequest,
        items: [
          {
            ...validCheckoutRequest.items[0],
            unitPriceMinor: 1_290_000,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects an over-long items list", () => {
    const tooManyItems = Array.from({ length: 21 }, (_, index) => ({
      productId: `2a80d74e-6f18-48a6-9034-7b79a8af9${index.toString().padStart(3, "0")}`,
      licence: "Regular",
    }));

    expect(
      checkoutRequestSchema.safeParse({
        ...validCheckoutRequest,
        items: tooManyItems,
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed items list", () => {
    expect(
      checkoutRequestSchema.safeParse({
        ...validCheckoutRequest,
        items: [],
      }).success,
    ).toBe(false);
    expect(
      checkoutRequestSchema.safeParse({
        ...validCheckoutRequest,
        items: [{ productId: "not-a-uuid", licence: "Regular" }],
      }).success,
    ).toBe(false);
    expect(
      checkoutRequestSchema.safeParse({
        ...validCheckoutRequest,
        items: [{ productId: validCheckoutRequest.items[0]?.productId }],
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown licence", () => {
    expect(
      checkoutRequestSchema.safeParse({
        ...validCheckoutRequest,
        items: [
          {
            productId: validCheckoutRequest.items[0]?.productId,
            licence: "Pro",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates discountCode as a shape only, with no redemption behavior", () => {
    expect(
      checkoutRequestSchema.safeParse({
        ...validCheckoutRequest,
        discountCode: "a$",
      }).success,
    ).toBe(false);
    expect(
      checkoutRequestSchema.safeParse({
        ...validCheckoutRequest,
        discountCode: "AB",
      }).success,
    ).toBe(false);
  });
});

describe("checkout response contract", () => {
  it("accepts the order id, status, and payment-attempt id", () => {
    const response = {
      orderId: order.id,
      status: "pending",
      paymentAttemptId: "6d4b8a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b",
    };
    expect(checkoutResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects an order status outside pending|settled|cancelled", () => {
    expect(
      checkoutResponseSchema.safeParse({
        orderId: order.id,
        status: "paid",
        paymentAttemptId: "6d4b8a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b",
      }).success,
    ).toBe(false);
  });

  it("rejects a persistence-only field such as a payment reference", () => {
    expect(
      checkoutResponseSchema.safeParse({
        orderId: order.id,
        status: "pending",
        paymentAttemptId: "6d4b8a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b",
        provider: "sandbox",
      }).success,
    ).toBe(false);
  });
});

describe("order summary/detail contracts", () => {
  it("accepts a representative valid order (id, status, date, total, snapshots)", () => {
    expect(orderSummarySchema.parse(order)).toEqual(order);
    expect(orderDetailResponseSchema.parse(order)).toEqual(order);
  });

  for (const requiredField of ["total", "createdAt"] as const) {
    it(`requires the caller-visible field: ${requiredField}`, () => {
      const { [requiredField]: _omitted, ...withoutField } = order;
      expect(orderSummarySchema.safeParse(withoutField).success).toBe(false);
    });
  }

  it("rejects an unknown currency in an item snapshot", () => {
    expect(
      orderSummarySchema.safeParse({
        ...order,
        items: [
          {
            ...orderItemSnapshot,
            unitPrice: { amount: 4_900, currency: "EUR" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  for (const persistenceField of [
    "idempotencyKey",
    "paymentReference",
    "provider",
    "userId",
    "subtotalMinor",
    "discountMinor",
    "totalMinor",
  ]) {
    it(`rejects a persistence-only field: ${persistenceField}`, () => {
      expect(
        orderSummarySchema.safeParse({
          ...order,
          [persistenceField]: "must-not-leak",
        }).success,
      ).toBe(false);
    });
  }

  it("rejects a persistence-only field on an item snapshot", () => {
    expect(
      orderSummarySchema.safeParse({
        ...order,
        items: [{ ...orderItemSnapshot, orderId: order.id }],
      }).success,
    ).toBe(false);
  });
});

describe("account/library entitlement response contract", () => {
  it("accepts a representative valid library page", () => {
    const response = {
      data: [entitlement],
      meta: { nextCursor: null, hasMore: false },
    };
    expect(libraryResponseSchema.parse(response)).toEqual(response);
    expect(entitlementSchema.parse(entitlement)).toEqual(entitlement);
  });

  for (const persistenceField of ["userId", "orderId"]) {
    it(`rejects a persistence-only field: ${persistenceField}`, () => {
      expect(
        entitlementSchema.safeParse({
          ...entitlement,
          [persistenceField]: "must-not-leak",
        }).success,
      ).toBe(false);
    });
  }
});

describe("download-issue response contract", () => {
  it("accepts exactly a url and an expiry", () => {
    const response = {
      url: "/api/v1/downloads/token/abcdef",
      expiresAt: "2026-07-20T08:35:00.000Z",
    };
    expect(downloadIssueResponseSchema.parse(response)).toEqual(response);
  });

  for (const persistenceField of [
    "token",
    "provider",
    "entitlementId",
    "objectKey",
  ]) {
    it(`rejects a persistence-only field: ${persistenceField}`, () => {
      expect(
        downloadIssueResponseSchema.safeParse({
          url: "/api/v1/downloads/token/abcdef",
          expiresAt: "2026-07-20T08:35:00.000Z",
          [persistenceField]: "must-not-leak",
        }).success,
      ).toBe(false);
    });
  }
});
