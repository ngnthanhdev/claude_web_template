import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import {
  DOWNLOAD_TOKEN_URL_PATTERN,
  requestLogSerializer,
} from "./request-log-serializer.js";

function fakeRequest(overrides: {
  method?: string;
  url: string;
  hostname?: string;
  ip?: string;
  remotePort?: number;
}): FastifyRequest {
  return {
    method: overrides.method ?? "GET",
    url: overrides.url,
    hostname: overrides.hostname ?? "api.kitvera.test",
    ip: overrides.ip ?? "127.0.0.1",
    socket: { remotePort: overrides.remotePort ?? 54321 },
  } as unknown as FastifyRequest;
}

describe("requestLogSerializer", () => {
  it("masks only the download token path segment", () => {
    const fields = requestLogSerializer(
      fakeRequest({ url: "/v1/downloads/token/super-secret-token" }),
    );

    expect(fields.url).toBe("/v1/downloads/token/[redacted]");
  });

  it("leaves every other request URL untouched", () => {
    const fields = requestLogSerializer(
      fakeRequest({ url: "/v1/orders?cursor=abc&limit=10" }),
    );

    expect(fields.url).toBe("/v1/orders?cursor=abc&limit=10");
  });

  it("preserves the method/hostname/remoteAddress/remotePort fields alongside the masked url", () => {
    const fields = requestLogSerializer(
      fakeRequest({
        method: "POST",
        url: "/v1/checkout",
        hostname: "api.kitvera.test",
        ip: "203.0.113.7",
        remotePort: 41234,
      }),
    );

    expect(fields).toEqual({
      method: "POST",
      url: "/v1/checkout",
      hostname: "api.kitvera.test",
      remoteAddress: "203.0.113.7",
      remotePort: 41234,
    });
  });

  it("stops the mask at the next path/query/fragment boundary", () => {
    const fields = requestLogSerializer(
      fakeRequest({
        url: "/v1/downloads/token/abc123?ignored=1",
      }),
    );

    expect(fields.url).toBe("/v1/downloads/token/[redacted]?ignored=1");
  });

  it("exports the same pattern it uses internally, so callers can't drift from it", () => {
    expect(DOWNLOAD_TOKEN_URL_PATTERN.test("/v1/downloads/token/abc")).toBe(
      true,
    );
  });
});
