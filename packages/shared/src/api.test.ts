import { describe, expect, it } from "vitest";

import {
  apiErrorSchema,
  cursorPageMetaSchema,
  healthResponseSchema,
} from "./api.js";
import { currencySchema, localeSchema } from "./localization.js";
import { moneySchema } from "./money.js";

describe("shared wire-contract primitives", () => {
  it("parses valid API envelopes and cursor metadata", () => {
    expect(
      apiErrorSchema.parse({
        error: {
          code: "INVALID_REQUEST",
          message: "The request is invalid",
          details: { field: "email" },
        },
      }),
    ).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "The request is invalid",
        details: { field: "email" },
      },
    });

    expect(healthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
    expect(cursorPageMetaSchema.parse({ nextCursor: "next-page", hasMore: true })).toEqual({
      nextCursor: "next-page",
      hasMore: true,
    });
  });

  it("parses supported locale, currency, and integer minor-unit money", () => {
    expect(localeSchema.parse("vi")).toBe("vi");
    expect(localeSchema.parse("en")).toBe("en");
    expect(currencySchema.parse("VND")).toBe("VND");
    expect(currencySchema.parse("USD")).toBe("USD");
    expect(moneySchema.parse({ amount: 1999, currency: "USD" })).toEqual({
      amount: 1999,
      currency: "USD",
    });
  });

  it("rejects fractional minor-unit amounts", () => {
    expect(moneySchema.safeParse({ amount: 19.99, currency: "USD" }).success).toBe(false);
  });

  it("keeps minor-unit amounts within JavaScript's safe integer range", () => {
    expect(
      moneySchema.safeParse({ amount: Number.MAX_SAFE_INTEGER, currency: "VND" }).success,
    ).toBe(true);
    expect(
      moneySchema.safeParse({ amount: Number.MAX_SAFE_INTEGER + 1, currency: "VND" }).success,
    ).toBe(false);
    expect(
      moneySchema.safeParse({ amount: Number.MIN_SAFE_INTEGER - 1, currency: "VND" }).success,
    ).toBe(false);
  });

  it("rejects unsupported locales and currencies", () => {
    expect(localeSchema.safeParse("fr").success).toBe(false);
    expect(currencySchema.safeParse("EUR").success).toBe(false);
    expect(moneySchema.safeParse({ amount: 100, currency: "EUR" }).success).toBe(false);
  });
});
