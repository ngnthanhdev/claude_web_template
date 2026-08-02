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

/**
 * Seller-facing authoring contracts (design
 * docs/specs/2026-08-01-seller-authoring-design.md, §4-§6). These are kept
 * distinct from the buyer-facing `catalogue`/`commerce` contracts: every
 * request here is an *allowlist* that makes the mass-assignment defense
 * (design §5/§8) representable in the type system — no server-owned field
 * (`sellerId`, `publicationState`, `isFeatured`, price authority,
 * `reviewState`, `Artifact.checksum`/`signature`) can parse from an
 * authoring request body. State transitions are their own dedicated request
 * shapes, never a field on the generic edit request.
 *
 * `licenceOptions`/price fields are intentionally absent from every request
 * here: in the shipped schema a `LicenceOption` cannot exist without its
 * `Price` rows (price authority), so there is no seller-settable licence
 * shape that isn't also a price-authority shape.
 */

const nonEmptyTextSchema = z.string().trim().min(1);

const MAX_TAGS = 20;
const MAX_MEDIA_ITEMS = 50;
const MAX_COMPATIBILITY_ENTRIES = 50;
const MAX_SPECIFICATIONS = 50;
const MAX_DEMO_PAGES = 20;

function hasUniqueLocales(items: readonly { locale: string }[]): boolean {
  return new Set(items.map(({ locale }) => locale)).size === items.length;
}

/**
 * Review sub-state on a `ProductVersion` (design §4). Must match the Prisma
 * `ReviewState` enum exactly: seller-reachable states only (`draft`,
 * `in_review`); `approved` is admin-only and never seller-writable via any
 * schema in this file. `published`/delisted stay on `PublicationState`.
 */
export const reviewStateSchema = z.enum(["draft", "in_review", "approved"]);
export type ReviewState = z.infer<typeof reviewStateSchema>;

const translationInputSchema = z
  .object({
    locale: localeSchema,
    title: nonEmptyTextSchema,
    summary: nonEmptyTextSchema,
    description: nonEmptyTextSchema,
  })
  .strict();
export type SellerProductTranslationInput = z.infer<
  typeof translationInputSchema
>;

const mediaInputSchema = z
  .object({
    position: z.number().int().nonnegative().safe(),
    kind: z.enum(["image", "video"]),
    url: publicHttpUrlSchema,
    translations: z
      .array(
        z.object({ locale: localeSchema, alt: nonEmptyTextSchema }).strict(),
      )
      .max(localeSchema.options.length)
      .refine(hasUniqueLocales, "must not repeat a locale"),
  })
  .strict();
export type SellerProductMediaInput = z.infer<typeof mediaInputSchema>;

const compatibilityInputSchema = z
  .object({
    target: slugSchema,
    constraint: nonEmptyTextSchema,
  })
  .strict();
export type SellerProductCompatibilityInput = z.infer<
  typeof compatibilityInputSchema
>;

const specificationInputSchema = z
  .object({
    key: slugSchema,
    translations: z
      .array(
        z
          .object({
            locale: localeSchema,
            label: nonEmptyTextSchema,
            value: nonEmptyTextSchema,
          })
          .strict(),
      )
      .max(localeSchema.options.length)
      .refine(hasUniqueLocales, "must not repeat a locale"),
  })
  .strict();
export type SellerProductSpecificationInput = z.infer<
  typeof specificationInputSchema
>;

const demoPageInputSchema = z
  .object({
    position: z.number().int().nonnegative().safe(),
    slug: slugSchema,
    previewUrl: publicHttpUrlSchema,
    translations: z
      .array(
        z.object({ locale: localeSchema, title: nonEmptyTextSchema }).strict(),
      )
      .max(localeSchema.options.length)
      .refine(hasUniqueLocales, "must not repeat a locale"),
  })
  .strict();
export type SellerProductDemoPageInput = z.infer<typeof demoPageInputSchema>;

/**
 * Creates a new draft `Product` owned by the server-resolved seller.
 * `sellerId`, `publicationState`, `isFeatured`, and price authority are
 * never accepted here (design §5/§8).
 */
export const createDraftProductRequestSchema = z
  .object({
    slug: slugSchema,
    category: categorySlugSchema,
    thumbnailUrl: publicHttpUrlSchema,
    documentationUrl: publicHttpUrlSchema,
    isolatedPreviewUrl: publicHttpUrlSchema,
    tags: z.array(slugSchema).max(MAX_TAGS).optional(),
  })
  .strict();
export type CreateDraftProductRequest = z.infer<
  typeof createDraftProductRequestSchema
>;

/**
 * Partial edit of an owned, draft-only `Product` — the allowlisted path for
 * attaching translations/media/compatibility/specifications/demo pages
 * (design §5/§6). No field here can ever set `publicationState`,
 * `isFeatured`, `sellerId`, or price authority; state transitions are
 * dedicated request shapes, not fields here.
 */
export const editDraftProductRequestSchema = z
  .object({
    category: categorySlugSchema,
    tags: z.array(slugSchema).max(MAX_TAGS),
    thumbnailUrl: publicHttpUrlSchema,
    documentationUrl: publicHttpUrlSchema,
    isolatedPreviewUrl: publicHttpUrlSchema,
    translations: z
      .array(translationInputSchema)
      .min(1)
      .max(localeSchema.options.length)
      .refine(hasUniqueLocales, "must not repeat a locale"),
    media: z.array(mediaInputSchema).max(MAX_MEDIA_ITEMS),
    compatibility: z
      .array(compatibilityInputSchema)
      .max(MAX_COMPATIBILITY_ENTRIES),
    specifications: z.array(specificationInputSchema).max(MAX_SPECIFICATIONS),
    demoPages: z.array(demoPageInputSchema).max(MAX_DEMO_PAGES),
  })
  .partial()
  .strict();
export type EditDraftProductRequest = z.infer<
  typeof editDraftProductRequestSchema
>;

/**
 * Creates a new `ProductVersion` on an owned product. `reviewState` always
 * starts at `draft` server-side and is never bindable here.
 */
export const createVersionRequestSchema = z
  .object({
    version: semanticVersionSchema,
    releasedAt: z.string().datetime({ offset: true }),
    translations: z
      .array(
        z.object({ locale: localeSchema, notes: nonEmptyTextSchema }).strict(),
      )
      .min(1)
      .max(localeSchema.options.length)
      .refine(hasUniqueLocales, "must not repeat a locale"),
  })
  .strict();
export type CreateVersionRequest = z.infer<typeof createVersionRequestSchema>;

/**
 * Dedicated guarded transition: moves the addressed version `draft ->
 * in_review` only (design §5/§8). Never a field on a generic edit request,
 * and never able to request `approved`/`published` — a seller can never
 * self-publish.
 */
export const submitForReviewRequestSchema = z
  .object({
    version: semanticVersionSchema,
  })
  .strict();
export type SubmitForReviewRequest = z.infer<
  typeof submitForReviewRequestSchema
>;

export const submitForReviewResponseSchema = z
  .object({
    productId: z.string().uuid(),
    version: semanticVersionSchema,
    reviewState: reviewStateSchema,
  })
  .strict();
export type SubmitForReviewResponse = z.infer<
  typeof submitForReviewResponseSchema
>;

/**
 * QA/scan verdict on a factory `BuildRun` (design §4/§5). Must match the
 * Prisma `BuildVerdict` enum exactly (`pending` is the persisted default).
 */
export const buildVerdictSchema = z.enum(["pending", "passed", "failed"]);
export type BuildVerdict = z.infer<typeof buildVerdictSchema>;

/**
 * Lifecycle status of a factory `BuildRun`. Must match the Prisma
 * `BuildRunStatus` enum exactly, including the `pending` default a freshly
 * recorded run carries before it transitions.
 */
export const buildRunStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
]);
export type BuildRunStatus = z.infer<typeof buildRunStatusSchema>;

/**
 * Artifact/build metadata a seller may see on their own product/version
 * (design §4/§6) — no buyer/order/revenue field. `checksum` is included
 * because it lets the seller verify integrity of what was ingested;
 * `signature` is not surfaced here (it is a server/factory verification
 * credential, not an authoring-relevant field).
 */
const sellerArtifactSummarySchema = z
  .object({
    id: z.string().uuid(),
    storageId: z.string().min(1).max(2_048),
    checksum: z.string().min(32).max(128),
    sizeBytes: z.number().int().positive().safe(),
    producedAt: z.string().datetime({ offset: true }),
    factoryRunId: z.string().min(1).max(120),
  })
  .strict();
export type SellerArtifactSummary = z.infer<typeof sellerArtifactSummarySchema>;

const sellerBuildRunSummarySchema = z
  .object({
    id: z.string().uuid(),
    status: buildRunStatusSchema,
    startedAt: z.string().datetime({ offset: true }),
    finishedAt: z.string().datetime({ offset: true }).nullable(),
    qaVerdict: buildVerdictSchema,
    scanVerdict: buildVerdictSchema,
    artifact: sellerArtifactSummarySchema.nullable(),
  })
  .strict();
export type SellerBuildRunSummary = z.infer<typeof sellerBuildRunSummarySchema>;

const sellerVersionSummarySchema = z
  .object({
    version: semanticVersionSchema,
    releasedAt: z.string().datetime({ offset: true }),
    reviewState: reviewStateSchema,
    latestBuildRun: sellerBuildRunSummarySchema.nullable(),
  })
  .strict();
export type SellerVersionSummary = z.infer<typeof sellerVersionSummarySchema>;

/**
 * The seller's own product summary — surfaces `publicationState` (own
 * product only) plus each version's `reviewState` and build/artifact
 * metadata. No buyer, order, or revenue field.
 */
export const sellerProductSummarySchema = z
  .object({
    id: z.string().uuid(),
    slug: slugSchema,
    category: categorySlugSchema,
    publicationState: publicationStateSchema,
    tags: z.array(slugSchema),
    versions: z.array(sellerVersionSummarySchema),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type SellerProductSummary = z.infer<typeof sellerProductSummarySchema>;

export const sellerProductListResponseSchema = z
  .object({
    data: z.array(sellerProductSummarySchema),
    meta: cursorPageMetaSchema,
  })
  .strict();
export type SellerProductListResponse = z.infer<
  typeof sellerProductListResponseSchema
>;

export const sellerProductDetailResponseSchema = sellerProductSummarySchema
  .extend({
    thumbnailUrl: publicHttpUrlSchema,
    documentationUrl: publicHttpUrlSchema,
    isolatedPreviewUrl: publicHttpUrlSchema,
    translations: z.array(translationInputSchema),
    media: z.array(mediaInputSchema),
    compatibility: z.array(compatibilityInputSchema),
    specifications: z.array(specificationInputSchema),
    demoPages: z.array(demoPageInputSchema),
  })
  .strict();
export type SellerProductDetailResponse = z.infer<
  typeof sellerProductDetailResponseSchema
>;

/**
 * Factory -> API signed-artifact ingest contract (design §2/§4/§6). Kept
 * distinct from the browser-facing seller schemas above: this is a
 * server-to-server payload, verified by an HMAC signature over the
 * canonical payload (not by session/seller auth).
 */
export const factoryArtifactIngestRequestSchema = z
  .object({
    productId: z.string().uuid(),
    version: semanticVersionSchema,
    storageId: z.string().min(1).max(2_048),
    checksum: z.string().min(32).max(128),
    signature: z.string().min(1).max(4_096),
    sizeBytes: z.number().int().positive().safe(),
    producedAt: z.string().datetime({ offset: true }),
    factoryRunId: z.string().min(1).max(120),
    qaVerdict: buildVerdictSchema,
    scanVerdict: buildVerdictSchema,
  })
  .strict();
export type FactoryArtifactIngestRequest = z.infer<
  typeof factoryArtifactIngestRequestSchema
>;

export const factoryArtifactIngestResponseSchema = z
  .object({
    artifactId: z.string().uuid(),
    buildRunId: z.string().uuid(),
    productId: z.string().uuid(),
    version: semanticVersionSchema,
    recordedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type FactoryArtifactIngestResponse = z.infer<
  typeof factoryArtifactIngestResponseSchema
>;
