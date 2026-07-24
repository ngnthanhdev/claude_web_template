import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/middleware", () => ({ default: () => vi.fn() }));

import { createContentSecurityPolicy } from "@/middleware";

describe("createContentSecurityPolicy", () => {
  it("keeps connect-src self-only regardless of any configured origin", () => {
    const policy = createContentSecurityPolicy("test-nonce", undefined);

    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toMatch(/connect-src 'self' \S/);
  });

  it("scopes script-src/style-src to the per-request nonce", () => {
    const policy = createContentSecurityPolicy("test-nonce", undefined);

    expect(policy).toContain(
      "script-src 'self' 'nonce-test-nonce' 'strict-dynamic'",
    );
    expect(policy).toContain("style-src 'self' 'nonce-test-nonce'");
  });

  it("blocks all framing when no preview origin is configured", () => {
    const policy = createContentSecurityPolicy("test-nonce", undefined);

    expect(policy).toContain("frame-src 'none'");
  });

  it("allows framing only the configured preview origin", () => {
    const policy = createContentSecurityPolicy(
      "test-nonce",
      "https://preview.kitvera.test:8443/some/path?probe=1",
    );

    expect(policy).toContain("frame-src https://preview.kitvera.test:8443");
    expect(policy).not.toContain("/some/path");
  });

  it.each([undefined, "not a url", "javascript:alert(1)"])(
    "falls back to blocking all framing for an unset or unsafe preview origin: %s",
    (configuredPreviewOrigin) => {
      const policy = createContentSecurityPolicy(
        "test-nonce",
        configuredPreviewOrigin,
      );

      expect(policy).toContain("frame-src 'none'");
    },
  );

  it("never widens connect-src even when a preview origin is configured", () => {
    const policy = createContentSecurityPolicy(
      "test-nonce",
      "https://preview.kitvera.test",
    );

    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toMatch(/connect-src 'self' \S/);
  });
});
