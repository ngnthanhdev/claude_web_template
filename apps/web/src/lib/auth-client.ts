import {
  allSessionsRevocationResponseSchema,
  currentSessionResponseSchema,
  currentSessionRevocationResponseSchema,
  magicLinkInitiationRequestSchema,
  magicLinkInitiationResponseSchema,
  magicLinkRedemptionRequestSchema,
  magicLinkRedemptionResponseSchema,
  type AllSessionsRevocationResponse,
  type CurrentSessionResponse,
  type CurrentSessionRevocationResponse,
  type MagicLinkInitiationResponse,
  type MagicLinkRedemptionRequest,
  type MagicLinkRedemptionResponse,
} from "@shared/auth";
import type { z } from "zod";

import { apiClient, apiProxyBasePath } from "./api-client";

/**
 * Input for {@link initiateMagicLink}. Uses the schema's pre-transform input
 * type so callers may omit `returnTo` and let the shared schema apply its
 * own default instead of duplicating that rule on the client.
 */
export type InitiateMagicLinkInput = z.input<
  typeof magicLinkInitiationRequestSchema
>;

/** Requests a passwordless sign-in link be sent to the given email. */
export async function initiateMagicLink(
  input: InitiateMagicLinkInput,
): Promise<MagicLinkInitiationResponse> {
  const body = magicLinkInitiationRequestSchema.parse(input);

  return apiClient.post(
    `${apiProxyBasePath}/auth/magic-links`,
    magicLinkInitiationResponseSchema,
    body,
  );
}

/** Redeems a magic-link token, establishing the session cookie on success. */
export async function redeemMagicLink(
  input: MagicLinkRedemptionRequest,
): Promise<MagicLinkRedemptionResponse> {
  const body = magicLinkRedemptionRequestSchema.parse(input);

  return apiClient.post(
    `${apiProxyBasePath}/auth/magic-link-redemptions`,
    magicLinkRedemptionResponseSchema,
    body,
  );
}

/** Reads the current session for the caller's session cookie, if any. */
export async function getCurrentSession(): Promise<CurrentSessionResponse> {
  return apiClient.get(
    `${apiProxyBasePath}/sessions/current`,
    currentSessionResponseSchema,
  );
}

/** Revokes only the current session; requires the session's CSRF token. */
export async function logoutCurrentSession(
  csrfToken: string,
): Promise<CurrentSessionRevocationResponse> {
  return apiClient.delete(
    `${apiProxyBasePath}/sessions/current`,
    currentSessionRevocationResponseSchema,
    { headers: { "X-CSRF-Token": csrfToken } },
  );
}

/** Revokes every session for the current user; requires the CSRF token. */
export async function logoutAllSessions(
  csrfToken: string,
): Promise<AllSessionsRevocationResponse> {
  return apiClient.delete(
    `${apiProxyBasePath}/sessions`,
    allSessionsRevocationResponseSchema,
    { headers: { "X-CSRF-Token": csrfToken } },
  );
}
