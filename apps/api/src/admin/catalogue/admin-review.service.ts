import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  AdminAuditAction,
  AdminAuditTargetType,
  Prisma,
  ReviewState,
} from "@prisma/client";
import {
  adminReviewQueueItemSchema,
  adminReviewQueueListResponseSchema,
  approveReviewResponseSchema,
  rejectReviewResponseSchema,
  type AdminReviewQueueItem,
  type AdminReviewQueueListResponse,
  type ApproveReviewResponse,
  type RejectReviewResponse,
} from "@marketplace/shared/admin";
import { ZodValidationException } from "nestjs-zod";
import { z, ZodError } from "zod";

import { PrismaService } from "../../prisma/prisma.service.js";
import { AdminAuditService } from "../admin-audit.service.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

export const adminReviewQueueQuerySchema = z
  .object({
    cursor: z.string().min(1).max(2_048).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_LIMIT)
      .default(DEFAULT_PAGE_LIMIT),
  })
  .strict();
export type AdminReviewQueueQuery = z.infer<typeof adminReviewQueueQuerySchema>;

const cursorTupleSchema = z
  .object({
    releasedAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();
type CursorTuple = z.infer<typeof cursorTupleSchema>;

function invalidCursor(): never {
  throw new ZodValidationException(
    new ZodError([
      {
        code: "custom",
        path: ["cursor"],
        message: "Invalid admin review-queue cursor",
      },
    ]),
  );
}

function encodeCursor(tuple: CursorTuple): string {
  return Buffer.from(JSON.stringify(tuple), "utf8").toString("base64url");
}

function decodeCursor(raw: string): CursorTuple {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    invalidCursor();
  }
  const result = cursorTupleSchema.safeParse(parsed);
  if (!result.success) invalidCursor();
  return result.data;
}

/**
 * The admin review queue's `ProductVersion` + `Product` + latest linked
 * `Artifact`/`BuildRun` shape (design §5) — no buyer/order/revenue field.
 * Mirrors `seller-products.service.ts`'s `versionSelect`/`latestBuildRun`
 * projection so both sides of the Layer-8 state machine read the same shape.
 */
const reviewQueueSelect = {
  id: true,
  productId: true,
  version: true,
  releasedAt: true,
  reviewState: true,
  product: {
    select: {
      slug: true,
      thumbnailUrl: true,
      sellerId: true,
      category: { select: { slug: true } },
    },
  },
  buildRuns: {
    orderBy: { startedAt: "desc" },
    take: 1,
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      qaVerdict: true,
      scanVerdict: true,
      artifact: {
        select: {
          id: true,
          storageId: true,
          checksum: true,
          sizeBytes: true,
          producedAt: true,
          factoryRunId: true,
        },
      },
    },
  },
} satisfies Prisma.ProductVersionSelect;

type ReviewQueueRow = Prisma.ProductVersionGetPayload<{
  select: typeof reviewQueueSelect;
}>;

function toReviewQueueItemDto(row: ReviewQueueRow): AdminReviewQueueItem {
  const latestBuildRun = row.buildRuns[0];
  return adminReviewQueueItemSchema.parse({
    productId: row.productId,
    productSlug: row.product.slug,
    category: row.product.category.slug,
    thumbnailUrl: row.product.thumbnailUrl,
    sellerId: row.product.sellerId,
    version: row.version,
    releasedAt: row.releasedAt.toISOString(),
    reviewState: row.reviewState,
    // `ProductVersion` carries no dedicated "submitted for review" column —
    // `releasedAt` is the only monotonic timestamp on the model (see the
    // task's Prisma-model note), so it doubles as the queue's submission
    // time until a dedicated column is added in a future layer.
    submittedAt: row.releasedAt.toISOString(),
    latestBuildRun:
      latestBuildRun === undefined
        ? null
        : {
            id: latestBuildRun.id,
            status: latestBuildRun.status,
            startedAt: latestBuildRun.startedAt.toISOString(),
            finishedAt:
              latestBuildRun.finishedAt === null
                ? null
                : latestBuildRun.finishedAt.toISOString(),
            qaVerdict: latestBuildRun.qaVerdict,
            scanVerdict: latestBuildRun.scanVerdict,
            artifact:
              latestBuildRun.artifact === null
                ? null
                : {
                    id: latestBuildRun.artifact.id,
                    storageId: latestBuildRun.artifact.storageId,
                    checksum: latestBuildRun.artifact.checksum,
                    sizeBytes: Number(latestBuildRun.artifact.sizeBytes),
                    producedAt:
                      latestBuildRun.artifact.producedAt.toISOString(),
                    factoryRunId: latestBuildRun.artifact.factoryRunId,
                  },
          },
  });
}

/**
 * The admin half of the Layer-8 review state machine (design §5): seller
 * does `draft -> in_review` (`seller-review.service.ts`), admin does
 * `in_review -> approved` or back to `draft` (reject). Admin sees every
 * `in_review` version — no per-seller ownership filter, unlike the seller
 * surface. Neither transition touches `Product.publicationState`; that is
 * `T-a6f204`'s publish/delist resource.
 */
@Injectable()
export class AdminReviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async list(
    query: AdminReviewQueueQuery,
  ): Promise<AdminReviewQueueListResponse> {
    const cursorTuple =
      query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    const cursorFilter: Prisma.ProductVersionWhereInput | undefined =
      cursorTuple === undefined
        ? undefined
        : {
            OR: [
              { releasedAt: { gt: new Date(cursorTuple.releasedAt) } },
              {
                releasedAt: new Date(cursorTuple.releasedAt),
                id: { gt: cursorTuple.id },
              },
            ],
          };

    const rows = await this.prisma.productVersion.findMany({
      where: { reviewState: ReviewState.in_review, ...cursorFilter },
      // `releasedAt` is the only monotonic column on `ProductVersion` (no
      // createdAt/updatedAt) so it — plus `id` as a tiebreaker — is the only
      // available stable cursor ordering.
      orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      select: reviewQueueSelect,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last !== undefined
        ? encodeCursor({
            releasedAt: last.releasedAt.toISOString(),
            id: last.id,
          })
        : null;

    return adminReviewQueueListResponseSchema.parse({
      data: page.map(toReviewQueueItemDto),
      meta: { nextCursor, hasMore },
    });
  }

  approve(
    productId: string,
    version: string,
    actingAdminId: string,
  ): Promise<ApproveReviewResponse> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.productVersion.findUnique({
        where: { productId_version: { productId, version } },
        select: { id: true, reviewState: true },
      });
      if (current === null) {
        throw new NotFoundException("Product version not found");
      }
      if (current.reviewState !== ReviewState.in_review) {
        throw new UnprocessableEntityException(
          "Only an in_review version can be approved",
        );
      }

      // Conditional update re-checks `in_review` under the row lock, so a
      // concurrent approve/reject between the read above and this write can
      // only have one winner (`count === 1`) — no last-writer-wins state flip
      // or duplicate audit row.
      const updated = await tx.productVersion.updateMany({
        where: { productId, version, reviewState: ReviewState.in_review },
        data: { reviewState: ReviewState.approved },
      });
      if (updated.count !== 1) {
        throw new UnprocessableEntityException(
          "Only an in_review version can be approved",
        );
      }

      await this.audit.record(tx, {
        actingAdminId,
        action: AdminAuditAction.reviewApproved,
        targetType: AdminAuditTargetType.productVersion,
        targetId: current.id,
        beforeState: { reviewState: ReviewState.in_review, productId, version },
        afterState: { reviewState: ReviewState.approved, productId, version },
      });

      return approveReviewResponseSchema.parse({
        productId,
        version,
        reviewState: ReviewState.approved,
      });
    });
  }

  reject(
    productId: string,
    version: string,
    actingAdminId: string,
    reason: string,
  ): Promise<RejectReviewResponse> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.productVersion.findUnique({
        where: { productId_version: { productId, version } },
        select: { id: true, reviewState: true },
      });
      if (current === null) {
        throw new NotFoundException("Product version not found");
      }
      if (current.reviewState !== ReviewState.in_review) {
        throw new UnprocessableEntityException(
          "Only an in_review version can be rejected",
        );
      }

      // Conditional update re-checks `in_review` under the row lock (see
      // approve) so concurrent transitions cannot both win.
      const updated = await tx.productVersion.updateMany({
        where: { productId, version, reviewState: ReviewState.in_review },
        data: { reviewState: ReviewState.draft },
      });
      if (updated.count !== 1) {
        throw new UnprocessableEntityException(
          "Only an in_review version can be rejected",
        );
      }

      await this.audit.record(tx, {
        actingAdminId,
        action: AdminAuditAction.reviewRejected,
        targetType: AdminAuditTargetType.productVersion,
        targetId: current.id,
        beforeState: { reviewState: ReviewState.in_review, productId, version },
        afterState: {
          reviewState: ReviewState.draft,
          productId,
          version,
          reason,
        },
      });

      return rejectReviewResponseSchema.parse({
        productId,
        version,
        reviewState: ReviewState.draft,
      });
    });
  }
}
