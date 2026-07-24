import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  getCurrentSession,
  initiateMagicLink,
  logoutAllSessions,
  logoutCurrentSession,
  redeemMagicLink,
} from "./auth-client";

function base64UrlToken(): string {
  return randomBytes(32).toString("base64url");
}

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("initiateMagicLink", () => {
  it("posts the request and validates the accepted-status response", async () => {
    const fetchMock = stubFetchOnce(jsonResponse({ status: "accepted" }));

    await expect(
      initiateMagicLink({ email: "person@example.com", locale: "vi" }),
    ).resolves.toEqual({ status: "accepted" });

    const [calledPath, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledPath).toBe("/api/v1/auth/magic-links");
    expect(calledInit.method).toBe("POST");
    expect(JSON.parse(calledInit.body as string)).toEqual({
      email: "person@example.com",
      locale: "vi",
      returnTo: "/vi/account",
    });
  });

  it("rejects a malformed initiation response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ status: "queued" }));

    await expect(
      initiateMagicLink({ email: "person@example.com", locale: "en" }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("redeemMagicLink", () => {
  it("posts the token and validates the resulting session envelope", async () => {
    const csrfToken = base64UrlToken();
    const responseBody = {
      user: { id: "00000000-0000-4000-8000-000000000001", email: "a@b.com" },
      session: {
        id: "00000000-0000-4000-8000-000000000002",
        expiresAt: "2026-08-01T00:00:00.000Z",
      },
      csrfToken,
      returnTo: "/vi/account",
    };
    const fetchMock = stubFetchOnce(jsonResponse(responseBody));

    await expect(redeemMagicLink({ token: base64UrlToken() })).resolves.toEqual(
      responseBody,
    );

    const [calledPath, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledPath).toBe("/api/v1/auth/magic-link-redemptions");
    expect(calledInit.method).toBe("POST");
  });

  it("rejects a malformed redemption response instead of returning it", async () => {
    stubFetchOnce(
      jsonResponse({
        user: { id: "00000000-0000-4000-8000-000000000001", email: "a@b.com" },
        session: {
          id: "00000000-0000-4000-8000-000000000002",
          expiresAt: "2026-08-01T00:00:00.000Z",
        },
        // csrfToken intentionally omitted
        returnTo: "/vi/account",
      }),
    );

    await expect(
      redeemMagicLink({ token: base64UrlToken() }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("getCurrentSession", () => {
  it("validates the current-session envelope", async () => {
    const responseBody = {
      user: { id: "00000000-0000-4000-8000-000000000001", email: "a@b.com" },
      session: {
        id: "00000000-0000-4000-8000-000000000002",
        expiresAt: "2026-08-01T00:00:00.000Z",
      },
      csrfToken: base64UrlToken(),
    };
    const fetchMock = stubFetchOnce(jsonResponse(responseBody));

    await expect(getCurrentSession()).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/sessions/current",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

describe("logoutCurrentSession", () => {
  it("sends a DELETE with the CSRF header and accepts an empty response", async () => {
    const fetchMock = stubFetchOnce(new Response(null, { status: 204 }));

    await expect(
      logoutCurrentSession("csrf-token-value"),
    ).resolves.toBeUndefined();

    const [calledPath, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledPath).toBe("/api/v1/sessions/current");
    expect(calledInit.method).toBe("DELETE");
    expect(new Headers(calledInit.headers).get("x-csrf-token")).toBe(
      "csrf-token-value",
    );
  });
});

describe("logoutAllSessions", () => {
  it("targets the collection endpoint (not /current) and sends the CSRF header", async () => {
    const fetchMock = stubFetchOnce(new Response(null, { status: 204 }));

    await expect(
      logoutAllSessions("csrf-token-value"),
    ).resolves.toBeUndefined();

    const [calledPath, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledPath).toBe("/api/v1/sessions");
    expect(calledInit.method).toBe("DELETE");
    expect(new Headers(calledInit.headers).get("x-csrf-token")).toBe(
      "csrf-token-value",
    );
  });
});
