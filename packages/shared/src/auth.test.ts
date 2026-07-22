import { describe, expect, it } from "vitest";

import {
  allSessionsRevocationResponseSchema,
  currentSessionResponseSchema,
  currentSessionRevocationResponseSchema,
  magicLinkInitiationRequestSchema,
  magicLinkInitiationResponseSchema,
  magicLinkRedemptionRequestSchema,
  magicLinkRedemptionResponseSchema,
} from "./auth.js";

const rawToken = "A".repeat(43);
const safeSession = {
  user: {
    id: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
    email: "customer@example.com",
  },
  session: {
    id: "97e1176d-b7dc-4984-9fad-243f53788c1b",
    expiresAt: "2026-10-20T08:30:00.000Z",
  },
  csrfToken: `${"B".repeat(42)}E`,
};

describe("passwordless auth contracts", () => {
  it("normalizes initiation input and applies a locale-dependent return target", () => {
    expect(
      magicLinkInitiationRequestSchema.parse({
        email: "  Customer@Example.COM ",
        locale: "vi",
      }),
    ).toEqual({
      email: "customer@example.com",
      locale: "vi",
      returnTo: "/vi/account",
    });
    expect(
      magicLinkInitiationRequestSchema.parse({
        email: "customer@example.com",
        locale: "en",
        returnTo: "/en/search?q=landing+page&technology=nextjs",
      }).returnTo,
    ).toBe("/en/search?q=landing+page&technology=nextjs");
    expect(
      magicLinkInitiationRequestSchema.safeParse({
        email: "admin@example.com",
        locale: "en",
        returnTo: "/en/admin/products",
      }).success,
    ).toBe(true);
  });

  it.each([
    "https://evil.example/en/account",
    "//evil.example/en/account",
    "/en/auth/magic-link",
    "/en/account#token=secret",
    "/vi/account",
    "/en/../vi/account",
    "/en/%2e%2e/vi/account",
    "/en/%2E%2E/vi/account",
    "/en/%2e./vi/account",
  ])("rejects the unsafe or mismatched return target %s", (returnTo) => {
    expect(
      magicLinkInitiationRequestSchema.safeParse({
        email: "customer@example.com",
        locale: "en",
        returnTo,
      }).success,
    ).toBe(false);
  });

  it("canonicalizes an approved return target while preserving its query", () => {
    expect(
      magicLinkInitiationRequestSchema.parse({
        email: "customer@example.com",
        locale: "en",
        returnTo: "/en/templates/../search?q=landing+page&technology=nextjs",
      }).returnTo,
    ).toBe("/en/search?q=landing+page&technology=nextjs");
  });

  it("enforces the return-target limit after canonicalizing Unicode queries", () => {
    const withinLimitQuery = "界".repeat(225);
    const withinLimitRaw = `/en/search?q=${withinLimitQuery}`;
    const withinLimitCanonical = `/en/search?q=${encodeURIComponent(withinLimitQuery)}`;
    const overLimitQuery = "界".repeat(227);
    const overLimitRaw = `/en/search?q=${overLimitQuery}`;
    const overLimitCanonical = `/en/search?q=${encodeURIComponent(overLimitQuery)}`;

    expect(withinLimitCanonical.length).toBeLessThanOrEqual(2_048);
    expect(overLimitRaw.length).toBeLessThan(2_048);
    expect(overLimitCanonical.length).toBeGreaterThan(2_048);
    expect(
      magicLinkInitiationRequestSchema.parse({
        email: "customer@example.com",
        locale: "en",
        returnTo: withinLimitRaw,
      }).returnTo,
    ).toBe(withinLimitCanonical);
    expect(
      magicLinkInitiationRequestSchema.safeParse({
        email: "customer@example.com",
        locale: "en",
        returnTo: overLimitRaw,
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported locales and unknown initiation fields", () => {
    expect(
      magicLinkInitiationRequestSchema.safeParse({
        email: "customer@example.com",
        locale: "fr",
      }).success,
    ).toBe(false);
    expect(
      magicLinkInitiationRequestSchema.safeParse({
        email: "customer@example.com",
        locale: "en",
        role: "admin",
      }).success,
    ).toBe(false);
  });

  it("uses the generic HTTP-202 response", () => {
    expect(
      magicLinkInitiationResponseSchema.parse({ status: "accepted" }),
    ).toEqual({ status: "accepted" });
    expect(
      magicLinkInitiationResponseSchema.safeParse({
        status: "accepted",
        userExists: true,
      }).success,
    ).toBe(false);
  });

  it("locks redemption input to a 32-byte unpadded base64url token", () => {
    expect(magicLinkRedemptionRequestSchema.parse({ token: rawToken })).toEqual(
      {
        token: rawToken,
      },
    );
    expect(
      magicLinkRedemptionRequestSchema.safeParse({ token: "unknown" }).success,
    ).toBe(false);
    expect(
      magicLinkRedemptionRequestSchema.safeParse({
        token: `${"A".repeat(42)}+`,
      }).success,
    ).toBe(false);
    expect(
      magicLinkRedemptionRequestSchema.safeParse({ token: "B".repeat(43) })
        .success,
    ).toBe(false);
    expect(
      magicLinkRedemptionRequestSchema.safeParse({
        token: `${rawToken}=`,
      }).success,
    ).toBe(false);
  });

  it("distinguishes malformed input from a well-formed invalid token", () => {
    const wellFormedButInvalid = `${"Z".repeat(42)}c`;

    expect(
      magicLinkRedemptionRequestSchema.safeParse({ token: "expired" }).success,
    ).toBe(false);
    expect(
      magicLinkRedemptionRequestSchema.safeParse({
        token: wellFormedButInvalid,
      }).success,
    ).toBe(true);
  });

  it("allows only minimum safe redemption and current-session fields", () => {
    expect(
      magicLinkRedemptionResponseSchema.parse({
        ...safeSession,
        returnTo: "/en/account/library",
      }),
    ).toEqual({ ...safeSession, returnTo: "/en/account/library" });
    expect(currentSessionResponseSchema.parse(safeSession)).toEqual(
      safeSession,
    );

    for (const persistenceField of [
      "token",
      "tokenHash",
      "csrfHash",
      "rotatedToId",
      "revokedAt",
    ]) {
      expect(
        currentSessionResponseSchema.safeParse({
          ...safeSession,
          session: {
            ...safeSession.session,
            [persistenceField]: "must-not-leak",
          },
        }).success,
      ).toBe(false);
    }
  });

  it("rejects unknown public fields at every auth response boundary", () => {
    expect(
      magicLinkRedemptionResponseSchema.safeParse({
        ...safeSession,
        returnTo: "/en/account",
        roles: ["admin"],
      }).success,
    ).toBe(false);
    expect(
      currentSessionResponseSchema.safeParse({
        ...safeSession,
        user: { ...safeSession.user, profile: { displayName: "Customer" } },
      }).success,
    ).toBe(false);
  });

  it("models both successful session revocations as HTTP 204 no-content", () => {
    expect(currentSessionRevocationResponseSchema.parse(undefined)).toBe(
      undefined,
    );
    expect(allSessionsRevocationResponseSchema.parse(undefined)).toBe(
      undefined,
    );
    expect(currentSessionRevocationResponseSchema.safeParse({}).success).toBe(
      false,
    );
    expect(allSessionsRevocationResponseSchema.safeParse(null).success).toBe(
      false,
    );
  });
});
