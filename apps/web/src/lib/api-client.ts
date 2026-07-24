import { apiErrorSchema } from "@shared/api";
import type { ZodType } from "zod";

/**
 * Same-origin path the typed clients (catalogue-client, auth-client) build
 * their request paths from. The browser never talks to the API origin
 * directly — every request stays same-origin and is forwarded by
 * `apps/web/src/app/api/[...proxy]/route.ts`, which is the only place the
 * real (server-only) API origin is read.
 */
export const apiProxyBasePath = "/api/v1";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      accept: "application/json",
      ...init?.headers,
    },
  });
  const responseText = await response.text();
  let body: unknown = undefined;

  if (responseText) {
    try {
      const parsedBody: unknown = JSON.parse(responseText);
      body = parsedBody;
    } catch {
      body = responseText;
    }
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(body);
    if (parsedError.success) {
      throw new ApiClientError(
        response.status,
        parsedError.data.error.code,
        parsedError.data.error.message,
        parsedError.data.error.details,
      );
    }

    throw new ApiClientError(
      response.status,
      "HTTP_ERROR",
      response.statusText || `Request failed with status ${response.status}`,
    );
  }

  return schema.parse(body);
}

export const apiClient = {
  get: <T>(path: string, schema: ZodType<T>, init?: RequestInit) =>
    request(path, schema, init),
  post: <T>(
    path: string,
    schema: ZodType<T>,
    body?: unknown,
    init?: RequestInit,
  ) =>
    request(path, schema, {
      ...init,
      method: "POST",
      headers: { "content-type": "application/json", ...init?.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string, schema: ZodType<T>, init?: RequestInit) =>
    request(path, schema, { ...init, method: "DELETE" }),
};
