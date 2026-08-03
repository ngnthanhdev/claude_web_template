import { z } from "zod";

import { cursorPageMetaSchema } from "./api.js";
import {
  categorySlugSchema,
  publicHttpUrlSchema,
  publicationStateSchema,
  semanticVersionSchema,
  slugSchema,
} from "./catalogue.js";
import { localeSchema } from "./localization.js";
import {
  buildRunStatusSchema,
  buildVerdictSchema,
  reviewStateSchema,
} from "./seller.js";

/**
 * Admin-facing contracts (design docs/specs/2026-08-01-admin-surface-design.md,
 * §4-§7). Every request here is an *allowlist* that makes the "no client
 * authority" defense (design §4/§8) representable in the type system: no
 * acting-admin id, audit field, free-set `publicationState`/`reviewState`, MFA
 * secret, or role key outside `seller|admin` can parse from an admin request
 * body. The acting admin always comes from the session, never the body.
 * State transitions (approve/reject/publish/delist, role grant/revoke, MFA
 * enroll/confirm/verify) are each their own dedicated request shape, never a
 * field on a generic edit.
 */

const nonEmptyTextSchema = z.string().trim().min(1);

/** Mirrors the private `normalizedEmailSchema` convention in `auth.ts`. */
const normalizedEmailSchema = z.string().trim().toLowerCase().email().max(320);

const MAX_REASON_LENGTH = 2_000;
const RECOVERY_CODE_COUNT = 10;

/**
 * Role key allowlist for grant/revoke (design §1/§4): exactly the two roles
 * that exist today. No other key can parse.
 */
export const adminRoleKeySchema = z.enum(["seller", "admin"]);
export type AdminRoleKey = z.infer<typeof adminRoleKeySchema>;

/**
 * MFA factor type (design §6): TOTP only for v1, schema left open to
 * WebAuthn later.
 */
export const adminMfaFactorTypeSchema = z.enum(["totp"]);
export type AdminMfaFactorType = z.infer<typeof adminMfaFactorTypeSchema>;

const totpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "must be a 6-digit TOTP code");

/**
 * A one-time recovery code (design §6). Distinct from a 6-digit TOTP: a
 * bounded non-empty string the service issues (hashed at rest) and the admin
 * may present at `verify` time in place of a TOTP code. Bounds keep the input
 * validated at the DTO boundary without over-constraining the issued format.
 */
const recoveryCodeSchema = z.string().trim().min(8).max(64);

/**
 * Artifact metadata surfaced to an admin reviewer (design §5) — no
 * buyer/order/revenue field. `signature` is excluded: it is a
 * server/factory verification credential checked during publish, not a
 * reviewer-relevant field.
 */
const adminArtifactSummarySchema = z
  .object({
    id: z.string().uuid(),
    storageId: z.string().min(1).max(2_048),
    checksum: z.string().min(32).max(128),
    sizeBytes: z.number().int().positive().safe(),
    producedAt: z.string().datetime({ offset: true }),
    factoryRunId: z.string().min(1).max(120),
  })
  .strict();
export type AdminArtifactSummary = z.infer<typeof adminArtifactSummarySchema>;

const adminBuildRunSummarySchema = z
  .object({
    id: z.string().uuid(),
    status: buildRunStatusSchema,
    startedAt: z.string().datetime({ offset: true }),
    finishedAt: z.string().datetime({ offset: true }).nullable(),
    qaVerdict: buildVerdictSchema,
    scanVerdict: buildVerdictSchema,
    artifact: adminArtifactSummarySchema.nullable(),
  })
  .strict();
export type AdminBuildRunSummary = z.infer<typeof adminBuildRunSummarySchema>;

const adminReviewTranslationSchema = z
  .object({
    locale: localeSchema,
    title: nonEmptyTextSchema,
    summary: nonEmptyTextSchema,
    description: nonEmptyTextSchema,
  })
  .strict();
export type AdminReviewTranslation = z.infer<
  typeof adminReviewTranslationSchema
>;

/**
 * One `in_review` `ProductVersion` on the review queue, with its `Product`
 * and linked `Artifact`/`BuildRun` QA/scan verdict metadata (design §5) — no
 * buyer/order/revenue field. `sellerId` is included for reviewer
 * accountability (not buyer PII).
 */
export const adminReviewQueueItemSchema = z
  .object({
    productId: z.string().uuid(),
    productSlug: slugSchema,
    category: categorySlugSchema,
    thumbnailUrl: publicHttpUrlSchema,
    sellerId: z.string().uuid(),
    version: semanticVersionSchema,
    releasedAt: z.string().datetime({ offset: true }),
    reviewState: reviewStateSchema,
    submittedAt: z.string().datetime({ offset: true }),
    latestBuildRun: adminBuildRunSummarySchema.nullable(),
  })
  .strict();
export type AdminReviewQueueItem = z.infer<typeof adminReviewQueueItemSchema>;

export const adminReviewQueueListResponseSchema = z
  .object({
    data: z.array(adminReviewQueueItemSchema),
    meta: cursorPageMetaSchema,
  })
  .strict();
export type AdminReviewQueueListResponse = z.infer<
  typeof adminReviewQueueListResponseSchema
>;

export const adminReviewQueueItemDetailResponseSchema =
  adminReviewQueueItemSchema
    .extend({
      documentationUrl: publicHttpUrlSchema,
      isolatedPreviewUrl: publicHttpUrlSchema,
      translations: z.array(adminReviewTranslationSchema),
    })
    .strict();
export type AdminReviewQueueItemDetailResponse = z.infer<
  typeof adminReviewQueueItemDetailResponseSchema
>;

/**
 * Dedicated guarded transition: moves the addressed `ProductVersion`
 * `in_review -> approved` only (design §4/§5/§8). The target product+version
 * are named in the route path (`/admin/products/:productId/versions/:version/
 * approve`), so the body carries no identity — an empty allowlist that still
 * rejects any smuggled `reviewState`/`publicationState`/acting-admin field.
 */
export const approveReviewRequestSchema = z.object({}).strict();
export type ApproveReviewRequest = z.infer<typeof approveReviewRequestSchema>;

export const approveReviewResponseSchema = z
  .object({
    productId: z.string().uuid(),
    version: semanticVersionSchema,
    reviewState: reviewStateSchema,
  })
  .strict();
export type ApproveReviewResponse = z.infer<typeof approveReviewResponseSchema>;

/**
 * Dedicated guarded transition: moves the addressed `ProductVersion` back to
 * `draft` and always requires a non-empty `reason` (design §4/§7 — the reason
 * is recorded on the audit row). Target product+version come from the route
 * path; the body carries only the `reason`.
 */
export const rejectReviewRequestSchema = z
  .object({
    reason: nonEmptyTextSchema.max(MAX_REASON_LENGTH),
  })
  .strict();
export type RejectReviewRequest = z.infer<typeof rejectReviewRequestSchema>;

export const rejectReviewResponseSchema = z
  .object({
    productId: z.string().uuid(),
    version: semanticVersionSchema,
    reviewState: reviewStateSchema,
  })
  .strict();
export type RejectReviewResponse = z.infer<typeof rejectReviewResponseSchema>;

/**
 * Dedicated guarded transition: flips the target `Product`'s
 * `PublicationState` to `published`, naming the specific `ProductVersion`
 * becoming the live version (design §5). The product is named in the route
 * path (`/admin/products/:productId/publish`); the body names only the target
 * `version`, so a publish request missing its target version fails to parse.
 */
export const publishProductRequestSchema = z
  .object({
    version: semanticVersionSchema,
  })
  .strict();
export type PublishProductRequest = z.infer<typeof publishProductRequestSchema>;

export const publishProductResponseSchema = z
  .object({
    productId: z.string().uuid(),
    version: semanticVersionSchema,
    publicationState: publicationStateSchema,
  })
  .strict();
export type PublishProductResponse = z.infer<
  typeof publishProductResponseSchema
>;

/**
 * Dedicated guarded transition: flips the target `Product`'s
 * `PublicationState` to `delisted` (design §5). The product is named in the
 * route path (`/admin/products/:productId/delist`), so the body carries no
 * identity — an empty allowlist that still rejects a smuggled
 * `publicationState`/acting-admin field.
 */
export const delistProductRequestSchema = z.object({}).strict();
export type DelistProductRequest = z.infer<typeof delistProductRequestSchema>;

export const delistProductResponseSchema = z
  .object({
    productId: z.string().uuid(),
    publicationState: publicationStateSchema,
  })
  .strict();
export type DelistProductResponse = z.infer<typeof delistProductResponseSchema>;

/**
 * PII-minimized admin user directory entry (design §4/§8): the opaque user
 * `id` (the resource handle the `:userId` grant/revoke routes address — a
 * UUID, not PII, so a user's email never has to enter a URL/path/log),
 * normalized email, and assigned role keys only — no session, token, order,
 * name, phone, or other PII.
 */
export const adminUserSummarySchema = z
  .object({
    id: z.string().uuid(),
    email: normalizedEmailSchema,
    roles: z.array(adminRoleKeySchema),
  })
  .strict();
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUserListResponseSchema = z
  .object({
    data: z.array(adminUserSummarySchema),
    meta: cursorPageMetaSchema,
  })
  .strict();
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

/**
 * Grants a role to the user addressed by the route path
 * (`POST /admin/users/:userId/roles`). The body carries only the `role`
 * (allowlisted to `seller|admin`) — the acting admin and the target user both
 * come from the server (session + path), never the body (design §4/§8).
 */
export const adminGrantRoleRequestSchema = z
  .object({
    role: adminRoleKeySchema,
  })
  .strict();
export type AdminGrantRoleRequest = z.infer<typeof adminGrantRoleRequestSchema>;

export const adminGrantRoleResponseSchema = adminUserSummarySchema;
export type AdminGrantRoleResponse = AdminUserSummary;

/**
 * Revoke addresses both the user and the role in the route path
 * (`DELETE /admin/users/:userId/roles/:roleKey`, the role key validated as
 * `adminRoleKeySchema`), so it carries no request body — only a response.
 */
export const adminRevokeRoleResponseSchema = adminUserSummarySchema;
export type AdminRevokeRoleResponse = AdminUserSummary;

/**
 * Starts TOTP enrollment for the session's admin. Carries no input — the
 * factor is created for the calling admin, never a body-supplied user.
 */
export const adminMfaEnrollStartRequestSchema = z.object({}).strict();
export type AdminMfaEnrollStartRequest = z.infer<
  typeof adminMfaEnrollStartRequestSchema
>;

/**
 * The one-time TOTP provisioning payload (design §6) — response-only. Never
 * acceptable as a field on any request schema in this file.
 */
export const adminMfaEnrollStartResponseSchema = z
  .object({
    factorId: z.string().uuid(),
    type: adminMfaFactorTypeSchema,
    otpauthUri: z.string().min(1).max(2_048),
    secret: z.string().min(16).max(128),
  })
  .strict();
export type AdminMfaEnrollStartResponse = z.infer<
  typeof adminMfaEnrollStartResponseSchema
>;

export const adminMfaEnrollConfirmRequestSchema = z
  .object({
    factorId: z.string().uuid(),
    code: totpCodeSchema,
  })
  .strict();
export type AdminMfaEnrollConfirmRequest = z.infer<
  typeof adminMfaEnrollConfirmRequestSchema
>;

/**
 * Recovery codes are shown exactly once, at confirmation time (design §6) —
 * response-only.
 */
export const adminMfaEnrollConfirmResponseSchema = z
  .object({
    factorId: z.string().uuid(),
    confirmedAt: z.string().datetime({ offset: true }),
    recoveryCodes: z.array(nonEmptyTextSchema).length(RECOVERY_CODE_COUNT),
  })
  .strict();
export type AdminMfaEnrollConfirmResponse = z.infer<
  typeof adminMfaEnrollConfirmResponseSchema
>;

/**
 * Validates a confirmed factor at challenge time. Accepts either a 6-digit
 * TOTP code or a one-time recovery code (design §6) — the service
 * disambiguates and consumes a recovery code single-use. A recovery code is
 * not a 6-digit numeric, so the input is a union of the two accepted shapes.
 */
export const adminMfaVerifyRequestSchema = z
  .object({
    code: z.union([totpCodeSchema, recoveryCodeSchema]),
  })
  .strict();
export type AdminMfaVerifyRequest = z.infer<typeof adminMfaVerifyRequestSchema>;

export const adminMfaVerifyResponseSchema = z
  .object({
    verifiedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type AdminMfaVerifyResponse = z.infer<
  typeof adminMfaVerifyResponseSchema
>;

/**
 * Regenerates recovery codes for the session's admin. Carries no input — the
 * confirmed factor is resolved from the session, never a body-supplied id.
 */
export const adminMfaRecoveryRegenerateRequestSchema = z.object({}).strict();
export type AdminMfaRecoveryRegenerateRequest = z.infer<
  typeof adminMfaRecoveryRegenerateRequestSchema
>;

export const adminMfaRecoveryRegenerateResponseSchema = z
  .object({
    recoveryCodes: z.array(nonEmptyTextSchema).length(RECOVERY_CODE_COUNT),
    regeneratedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type AdminMfaRecoveryRegenerateResponse = z.infer<
  typeof adminMfaRecoveryRegenerateResponseSchema
>;
