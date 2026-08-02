import {
  checkoutRequestSchema,
  checkoutResponseSchema,
  downloadIssueRequestSchema,
  downloadIssueResponseSchema,
  libraryResponseSchema,
  orderCollectionResponseSchema,
  orderDetailResponseSchema,
  orderSchema,
  type CheckoutRequest,
  type CheckoutResponse,
  type DownloadIssueRequest,
  type DownloadIssueResponse,
  type LibraryResponse,
  type Order,
  type OrderCollectionResponse,
} from "@shared/commerce";
import { z } from "zod";

import { apiClient, apiProxyBasePath } from "./api-client";

const uuidSchema = z.string().uuid();

/**
 * Headers every commerce mutation must send: the session-bound CSRF value
 * from `useSession()`, matching the pattern already established by
 * `auth-client`'s `logoutCurrentSession`/`logoutAllSessions` (the caller
 * reads the token from the session cache; this client never reads it
 * itself).
 */
function csrfHeaders(csrfToken: string): HeadersInit {
  return { "X-CSRF-Token": csrfToken };
}

interface CursorPageParams {
  cursor?: string;
  limit?: number;
}

function buildCursorSearchParams(params: CursorPageParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.cursor !== undefined) search.set("cursor", params.cursor);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  return search;
}

export type CreateCheckoutInput = CheckoutRequest;

/**
 * Creates an order (and its pending sandbox `PaymentAttempt`) from a
 * client-cart-derived list of `{ productId, licence }` lines. The request is
 * built only from `checkoutRequestSchema` — there is no field on this input
 * for price, discount amount, currency total, or owner id, so none can be
 * sent even by mistake; the server computes and owns every amount.
 */
export async function createCheckout(
  input: CreateCheckoutInput,
  csrfToken: string,
): Promise<CheckoutResponse> {
  const body = checkoutRequestSchema.parse(input);

  return apiClient.post(
    `${apiProxyBasePath}/checkout`,
    checkoutResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Triggers the sandbox two-step settle for a pending `PaymentAttempt`,
 * returning the now-`settled` order. Sandbox-only server-side: this client
 * makes no client-reported "paid" claim, it only asks the server to run the
 * settle transaction.
 */
export async function settlePaymentAttempt(
  paymentAttemptId: string,
  csrfToken: string,
): Promise<Order> {
  const id = uuidSchema.parse(paymentAttemptId);

  return apiClient.post(
    `${apiProxyBasePath}/payment-attempts/${id}/settle`,
    orderSchema,
    undefined,
    { headers: csrfHeaders(csrfToken) },
  );
}

export type ListOrdersParams = CursorPageParams;

/** Lists the caller's own orders, cursor-paginated. */
export async function listOrders(
  params: ListOrdersParams = {},
): Promise<OrderCollectionResponse> {
  const search = buildCursorSearchParams(params);

  return apiClient.get(
    `${apiProxyBasePath}/orders?${search.toString()}`,
    orderCollectionResponseSchema,
  );
}

/** Fetches one of the caller's own orders by id. */
export async function getOrderById(orderId: string): Promise<Order> {
  const id = uuidSchema.parse(orderId);

  return apiClient.get(
    `${apiProxyBasePath}/orders/${id}`,
    orderDetailResponseSchema,
  );
}

export type ListLibraryParams = CursorPageParams;

/** Lists the caller's owned entitlements ("library"), cursor-paginated. */
export async function listLibrary(
  params: ListLibraryParams = {},
): Promise<LibraryResponse> {
  const search = buildCursorSearchParams(params);

  return apiClient.get(
    `${apiProxyBasePath}/account/library?${search.toString()}`,
    libraryResponseSchema,
  );
}

/**
 * Issues a short-lived signed download URL for an owned entitlement. The
 * entitlement id travels in the request path; the request body carries the
 * `{ productId, version }` the server cross-checks against that entitlement
 * (anti-tamper — a mismatch 404s), built and validated only from the shared
 * `downloadIssueRequestSchema` so no other field can be sent. A download
 * token never appears in the request target, and the returned
 * `{ url, expiresAt }` is handed back to the caller to use directly — this
 * function never logs it, never appends it to a link the caller didn't ask
 * for, and never embeds it in a request target of its own.
 */
export async function issueDownload(
  entitlementId: string,
  download: DownloadIssueRequest,
  csrfToken: string,
): Promise<DownloadIssueResponse> {
  const id = uuidSchema.parse(entitlementId);
  const body = downloadIssueRequestSchema.parse(download);

  return apiClient.post(
    `${apiProxyBasePath}/entitlements/${id}/download`,
    downloadIssueResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}
