import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiClientError, apiClient } from "./api-client";

const probeSchema = z.object({ status: z.literal("ok") }).strict();

afterEach(() => vi.unstubAllGlobals());

describe("apiClient error envelope", () => {
  it("sends credentials and an accept header on every request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.get("/api/v1/probe", probeSchema);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/probe",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ accept: "application/json" }),
      }),
    );
  });

  it("rejects a successful response that fails the caller's schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "not-ok" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.get("/api/v1/probe", probeSchema)).rejects.toThrow();
  });

  it("normalizes a structured API error envelope into ApiClientError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input.",
            details: { field: "email" },
          },
        }),
        { headers: { "content-type": "application/json" }, status: 422 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const failure: unknown = await apiClient
      .get("/api/v1/probe", probeSchema)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiClientError);
    expect(failure).toEqual(
      expect.objectContaining({
        status: 422,
        code: "VALIDATION_ERROR",
        message: "Invalid input.",
        details: { field: "email" },
      }),
    );
  });

  it.each([
    {
      body: "<html>upstream unavailable</html>",
      expectedMessage: "Bad Gateway",
      status: 502,
      statusText: "Bad Gateway",
    },
    {
      body: "",
      expectedMessage: "Request failed with status 503",
      status: 503,
      statusText: "",
    },
  ])(
    "normalizes a $status non-JSON API failure into a generic ApiClientError",
    async ({ body, expectedMessage, status, statusText }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(body, { status, statusText })),
      );

      const failure: unknown = await apiClient
        .get("/api/v1/probe", probeSchema)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ApiClientError);
      expect(failure).toEqual(
        expect.objectContaining({
          code: "HTTP_ERROR",
          message: expectedMessage,
          status,
        }),
      );
    },
  );

  it("routes a successful non-JSON response through the caller's schema and rejects it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 200 })),
    );

    await expect(apiClient.get("/api/v1/probe", probeSchema)).rejects.toThrow();
  });
});
