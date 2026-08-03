import {
  adminGrantRoleRequestSchema,
  adminGrantRoleResponseSchema,
  adminMfaEnrollConfirmRequestSchema,
  adminMfaEnrollConfirmResponseSchema,
  adminMfaEnrollStartResponseSchema,
  adminMfaRecoveryRegenerateResponseSchema,
  adminMfaVerifyRequestSchema,
  adminMfaVerifyResponseSchema,
  adminRevokeRoleResponseSchema,
  adminRoleKeySchema,
  adminReviewQueueListResponseSchema,
  adminUserListResponseSchema,
  approveReviewRequestSchema,
  approveReviewResponseSchema,
  delistProductRequestSchema,
  delistProductResponseSchema,
  publishProductRequestSchema,
  publishProductResponseSchema,
  rejectReviewRequestSchema,
  rejectReviewResponseSchema,
  type AdminGrantRoleRequest,
  type AdminGrantRoleResponse,
  type AdminMfaEnrollConfirmRequest,
  type AdminMfaEnrollConfirmResponse,
  type AdminMfaEnrollStartResponse,
  type AdminMfaRecoveryRegenerateResponse,
  type AdminMfaVerifyRequest,
  type AdminMfaVerifyResponse,
  type AdminRevokeRoleResponse,
  type AdminReviewQueueListResponse,
  type AdminRoleKey,
  type AdminUserListResponse,
  type ApproveReviewResponse,
  type DelistProductResponse,
  type PublishProductRequest,
  type PublishProductResponse,
  type RejectReviewRequest,
  type RejectReviewResponse,
} from "@shared/admin";
import { semanticVersionSchema } from "@shared/catalogue";
import { z } from "zod";

import { apiClient, apiProxyBasePath } from "./api-client";

const uuidSchema = z.string().uuid();

/**
 * Headers every admin mutation must send: the session-bound CSRF value from
 * `useSession()`, matching the pattern already established by
 * `seller-client`/`commerce-client` — the caller reads the token from the
 * session cache; this client never reads it itself.
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

export type ListReviewQueueParams = CursorPageParams;

/**
 * Lists the `in_review` `ProductVersion` queue with QA/scan verdict metadata
 * (design §5), cursor-paginated. Read-only — no CSRF token required.
 */
export async function listReviewQueue(
  params: ListReviewQueueParams = {},
): Promise<AdminReviewQueueListResponse> {
  const search = buildCursorSearchParams(params);

  return apiClient.get(
    `${apiProxyBasePath}/admin/review?${search.toString()}`,
    adminReviewQueueListResponseSchema,
  );
}

/**
 * Dedicated guarded transition: moves the addressed `ProductVersion`
 * `in_review -> approved` only. The product+version are named in the route
 * path; `approveReviewRequestSchema` is an empty allowlist, so no
 * acting-admin id or elevated field can ever be smuggled through this call.
 */
export async function approveReviewVersion(
  productId: string,
  version: string,
  csrfToken: string,
): Promise<ApproveReviewResponse> {
  const id = uuidSchema.parse(productId);
  const ver = semanticVersionSchema.parse(version);
  const body = approveReviewRequestSchema.parse({});

  return apiClient.post(
    `${apiProxyBasePath}/admin/products/${id}/versions/${ver}/approve`,
    approveReviewResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Dedicated guarded transition: moves the addressed `ProductVersion` back to
 * `draft` and always requires a non-empty `reason` (design §4/§7). Built only
 * from `rejectReviewRequestSchema`, which carries nothing but `reason` — a
 * seller-controlled `reviewState` field can never be constructible.
 */
export async function rejectReviewVersion(
  productId: string,
  version: string,
  input: RejectReviewRequest,
  csrfToken: string,
): Promise<RejectReviewResponse> {
  const id = uuidSchema.parse(productId);
  const ver = semanticVersionSchema.parse(version);
  const body = rejectReviewRequestSchema.parse(input);

  return apiClient.post(
    `${apiProxyBasePath}/admin/products/${id}/versions/${ver}/reject`,
    rejectReviewResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Dedicated guarded transition: flips the target `Product`'s
 * `PublicationState` to `published`, naming the specific `ProductVersion`
 * becoming the live version (design §5). Built only from
 * `publishProductRequestSchema`, which carries nothing but `version`.
 */
export async function publishProduct(
  productId: string,
  input: PublishProductRequest,
  csrfToken: string,
): Promise<PublishProductResponse> {
  const id = uuidSchema.parse(productId);
  const body = publishProductRequestSchema.parse(input);

  return apiClient.post(
    `${apiProxyBasePath}/admin/products/${id}/publish`,
    publishProductResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Dedicated guarded transition: flips the target `Product`'s
 * `PublicationState` to `delisted`. The product is named in the route path,
 * so `delistProductRequestSchema` is an empty allowlist that still rejects a
 * smuggled `publicationState`/acting-admin field.
 */
export async function delistProduct(
  productId: string,
  csrfToken: string,
): Promise<DelistProductResponse> {
  const id = uuidSchema.parse(productId);
  const body = delistProductRequestSchema.parse({});

  return apiClient.post(
    `${apiProxyBasePath}/admin/products/${id}/delist`,
    delistProductResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

export type ListAdminUsersParams = CursorPageParams;

/**
 * Lists the PII-minimized admin user directory (normalized email + assigned
 * role keys only), cursor-paginated. Read-only — no CSRF token required.
 */
export async function listAdminUsers(
  params: ListAdminUsersParams = {},
): Promise<AdminUserListResponse> {
  const search = buildCursorSearchParams(params);

  return apiClient.get(
    `${apiProxyBasePath}/admin/users?${search.toString()}`,
    adminUserListResponseSchema,
  );
}

/**
 * Grants a role to the user addressed by the route path. Built only from
 * `adminGrantRoleRequestSchema` — the target user always comes from the path,
 * never the body, so a request can never grant a role to a different user
 * than the one addressed.
 */
export async function grantAdminRole(
  userId: string,
  input: AdminGrantRoleRequest,
  csrfToken: string,
): Promise<AdminGrantRoleResponse> {
  const id = uuidSchema.parse(userId);
  const body = adminGrantRoleRequestSchema.parse(input);

  return apiClient.post(
    `${apiProxyBasePath}/admin/users/${id}/roles`,
    adminGrantRoleResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Revokes a role from the user addressed by the route path — both the user
 * and the role key are path-addressed (`adminRoleKeySchema`-validated), so
 * this call carries no request body.
 */
export async function revokeAdminRole(
  userId: string,
  roleKey: AdminRoleKey,
  csrfToken: string,
): Promise<AdminRevokeRoleResponse> {
  const id = uuidSchema.parse(userId);
  const key = adminRoleKeySchema.parse(roleKey);

  return apiClient.delete(
    `${apiProxyBasePath}/admin/users/${id}/roles/${key}`,
    adminRevokeRoleResponseSchema,
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Starts TOTP enrollment for the session's admin (design §6). Carries no
 * input — the factor is created for the calling admin, never a
 * body-supplied user. The one-time provisioning payload this returns
 * (otpauth URI/secret) is surfaced to the caller for display only; this
 * client never logs or persists it.
 */
export async function startMfaEnrollment(
  csrfToken: string,
): Promise<AdminMfaEnrollStartResponse> {
  return apiClient.post(
    `${apiProxyBasePath}/admin/mfa/enroll`,
    adminMfaEnrollStartResponseSchema,
    {},
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Confirms a pending TOTP factor. Built only from
 * `adminMfaEnrollConfirmRequestSchema` (`factorId` + `code`) — the shared
 * secret itself is never a request field. The one-time recovery codes this
 * returns are surfaced to the caller for display only; this client never
 * logs or persists them.
 */
export async function confirmMfaEnrollment(
  input: AdminMfaEnrollConfirmRequest,
  csrfToken: string,
): Promise<AdminMfaEnrollConfirmResponse> {
  const body = adminMfaEnrollConfirmRequestSchema.parse(input);

  return apiClient.post(
    `${apiProxyBasePath}/admin/mfa/confirm`,
    adminMfaEnrollConfirmResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Validates a confirmed factor at challenge time — a 6-digit TOTP code or a
 * one-time recovery code. Built only from `adminMfaVerifyRequestSchema`.
 */
export async function verifyMfa(
  input: AdminMfaVerifyRequest,
  csrfToken: string,
): Promise<AdminMfaVerifyResponse> {
  const body = adminMfaVerifyRequestSchema.parse(input);

  return apiClient.post(
    `${apiProxyBasePath}/admin/mfa/verify`,
    adminMfaVerifyResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Regenerates recovery codes for the session's admin. Carries no input — the
 * confirmed factor is resolved from the session, never a body-supplied id.
 * The recovery codes this returns are surfaced to the caller for display
 * only; this client never logs or persists them.
 */
export async function regenerateMfaRecoveryCodes(
  csrfToken: string,
): Promise<AdminMfaRecoveryRegenerateResponse> {
  return apiClient.post(
    `${apiProxyBasePath}/admin/mfa/recovery-codes`,
    adminMfaRecoveryRegenerateResponseSchema,
    {},
    { headers: csrfHeaders(csrfToken) },
  );
}
