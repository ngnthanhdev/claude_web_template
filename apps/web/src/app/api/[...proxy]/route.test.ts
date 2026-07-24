import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET, POST } from "./route";

const originalApiOrigin = process.env.API_ORIGIN;

function routeParams(...segments: string[]) {
  return { params: Promise.resolve({ proxy: segments }) };
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env.API_ORIGIN = "http://api.internal.test:4000";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalApiOrigin === undefined) {
    delete process.env.API_ORIGIN;
  } else {
    process.env.API_ORIGIN = originalApiOrigin;
  }
});

describe("same-origin API proxy", () => {
  it("forwards an allowlisted GET request to the configured API origin", async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const request = new NextRequest(
      "http://web.local.test/api/v1/categories?locale=vi",
      { headers: { cookie: "__Host-kitvera_session=abc" } },
    );

    const response = await GET(request, routeParams("v1", "categories"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      string | URL,
      RequestInit,
    ];
    expect(String(calledUrl)).toBe(
      "http://api.internal.test:4000/v1/categories?locale=vi",
    );
    expect(new Headers(calledInit.headers).get("cookie")).toBe(
      "__Host-kitvera_session=abc",
    );
  });

  it("rejects a path outside the /v1 allowlist without ever calling fetch", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 200 }));

    const request = new NextRequest("http://web.local.test/api/health");
    const response = await GET(request, routeParams("health"));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never leaks the configured API origin into a rejected response body", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 200 }));

    const request = new NextRequest("http://web.local.test/api/health");
    const response = await GET(request, routeParams("health"));

    const text = await response.text();
    expect(text).not.toContain("api.internal.test");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a traversal attempt that would resolve outside /v1", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 200 }));

    const request = new NextRequest("http://web.local.test/api/v1/x");
    const response = await GET(request, routeParams("v1", "..", "..", "admin"));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards Set-Cookie (including multiple values) and X-CSRF-Token from the upstream response", async () => {
    const upstreamHeaders = new Headers();
    upstreamHeaders.set("content-type", "application/json");
    upstreamHeaders.append(
      "set-cookie",
      "__Host-kitvera_session=next; Path=/; Secure; HttpOnly",
    );
    upstreamHeaders.set("x-csrf-token", "next-csrf-token");
    stubFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: upstreamHeaders,
      }),
    );

    const request = new NextRequest(
      "http://web.local.test/api/v1/sessions/current",
    );
    const response = await GET(
      request,
      routeParams("v1", "sessions", "current"),
    );

    expect(response.headers.get("set-cookie")).toContain(
      "__Host-kitvera_session=next",
    );
    expect(response.headers.get("x-csrf-token")).toBe("next-csrf-token");
  });

  it("forwards a POST body, content-type, and X-CSRF-Token to the upstream API", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 202 }));

    const request = new NextRequest(
      "http://web.local.test/api/v1/auth/magic-links",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": "token-value",
        },
        body: JSON.stringify({ email: "person@example.com" }),
      },
    );

    const response = await POST(
      request,
      routeParams("v1", "auth", "magic-links"),
    );

    expect(response.status).toBe(202);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      string | URL,
      RequestInit,
    ];
    expect(String(calledUrl)).toBe(
      "http://api.internal.test:4000/v1/auth/magic-links",
    );
    expect(calledInit.method).toBe("POST");
    const forwardedHeaders = new Headers(calledInit.headers);
    expect(forwardedHeaders.get("content-type")).toBe("application/json");
    expect(forwardedHeaders.get("x-csrf-token")).toBe("token-value");
    expect(calledInit.body).toBe(
      JSON.stringify({ email: "person@example.com" }),
    );
  });

  it("forwards DELETE requests without a body and returns a null body for 204", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    const request = new NextRequest("http://web.local.test/api/v1/sessions", {
      method: "DELETE",
      headers: { "x-csrf-token": "token-value" },
    });

    const response = await DELETE(request, routeParams("v1", "sessions"));

    expect(response.status).toBe(204);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      string | URL,
      RequestInit,
    ];
    expect(String(calledUrl)).toBe("http://api.internal.test:4000/v1/sessions");
    expect(calledInit.body).toBeUndefined();
  });

  it("fails closed with a 500 when the server-only API origin is not configured", async () => {
    delete process.env.API_ORIGIN;
    const fetchMock = stubFetch(new Response(null, { status: 200 }));

    const request = new NextRequest(
      "http://web.local.test/api/v1/categories?locale=vi",
    );
    const response = await GET(request, routeParams("v1", "categories"));

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a 502 JSON error envelope when the upstream API is unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "http://web.local.test/api/v1/categories?locale=vi",
    );
    const response = await GET(request, routeParams("v1", "categories"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: { code: "UPSTREAM_UNAVAILABLE", message: expect.any(String) },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
