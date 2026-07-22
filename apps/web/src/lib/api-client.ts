import { apiErrorSchema, healthResponseSchema, type HealthResponse } from "@shared/api";
import type { ZodType } from "zod";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

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

async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      accept: "application/json",
      ...init?.headers,
    },
  });
  const body: unknown = await response.json();

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

    throw new ApiClientError(response.status, "UNKNOWN", response.statusText || "Request failed");
  }

  return schema.parse(body);
}

export const apiClient = {
  get: <T>(path: string, schema: ZodType<T>) => request(path, schema),
  health: (): Promise<HealthResponse> => request("/health", healthResponseSchema),
};
