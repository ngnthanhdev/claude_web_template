import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  sellerProductDetailResponseSchema,
  sellerProductListResponseSchema,
  sellerProductSummarySchema,
  type CreateDraftProductRequest,
  type EditDraftProductRequest,
  type SellerProductDetailResponse,
  type SellerProductListResponse,
  type SellerProductSummary,
} from "@marketplace/shared/seller";
import { ZodValidationException } from "nestjs-zod";
import { z, ZodError } from "zod";

import { PrismaService } from "../prisma/prisma.service.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

export const sellerProductListQuerySchema = z
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
export type SellerProductListQuery = z.infer<
  typeof sellerProductListQuerySchema
>;

const cursorTupleSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
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
        message: "Invalid seller product cursor",
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

const versionSelect = {
  version: true,
  releasedAt: true,
  reviewState: true,
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

const summarySelect = {
  id: true,
  slug: true,
  publicationState: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { slug: true } },
  tags: { select: { tag: { select: { slug: true } } } },
  versions: { select: versionSelect, orderBy: { releasedAt: "desc" } },
} satisfies Prisma.ProductSelect;

const detailSelect = {
  ...summarySelect,
  thumbnailUrl: true,
  documentationUrl: true,
  isolatedPreviewUrl: true,
  translations: {
    select: { locale: true, title: true, summary: true, description: true },
  },
  media: {
    select: {
      position: true,
      kind: true,
      url: true,
      translations: { select: { locale: true, alt: true } },
    },
    orderBy: { position: "asc" },
  },
  compatibility: { select: { target: true, constraint: true } },
  specifications: {
    select: {
      key: true,
      translations: { select: { locale: true, label: true, value: true } },
    },
  },
  demoPages: {
    select: {
      position: true,
      slug: true,
      previewUrl: true,
      translations: { select: { locale: true, title: true } },
    },
    orderBy: { position: "asc" },
  },
} satisfies Prisma.ProductSelect;

type SummaryRow = Prisma.ProductGetPayload<{ select: typeof summarySelect }>;
type DetailRow = Prisma.ProductGetPayload<{ select: typeof detailSelect }>;

function toSummaryDto(row: SummaryRow): SellerProductSummary {
  return sellerProductSummarySchema.parse({
    id: row.id,
    slug: row.slug,
    category: row.category.slug,
    publicationState: row.publicationState,
    tags: row.tags.map((entry) => entry.tag.slug),
    versions: row.versions.map((version) => {
      const latestBuildRun = version.buildRuns[0];
      return {
        version: version.version,
        releasedAt: version.releasedAt.toISOString(),
        reviewState: version.reviewState,
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
      };
    }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toDetailDto(row: DetailRow): SellerProductDetailResponse {
  return sellerProductDetailResponseSchema.parse({
    ...toSummaryDto(row),
    thumbnailUrl: row.thumbnailUrl,
    documentationUrl: row.documentationUrl,
    isolatedPreviewUrl: row.isolatedPreviewUrl,
    translations: row.translations,
    media: row.media.map((item) => ({
      position: item.position,
      kind: item.kind,
      url: item.url,
      translations: item.translations,
    })),
    compatibility: row.compatibility,
    specifications: row.specifications.map((spec) => ({
      key: spec.key,
      translations: spec.translations,
    })),
    demoPages: row.demoPages.map((page) => ({
      position: page.position,
      slug: page.slug,
      previewUrl: page.previewUrl,
      translations: page.translations,
    })),
  });
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Seller-scoped authoring reads/writes over `Product` (design §5/§6). Every
 * query is filtered by `sellerId` server-side, so a product owned by another
 * seller is indistinguishable from a missing one — `404`, never `403`.
 */
@Injectable()
export class SellerProductsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    sellerId: string,
    query: SellerProductListQuery,
  ): Promise<SellerProductListResponse> {
    const cursorTuple =
      query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    const cursorFilter: Prisma.ProductWhereInput | undefined =
      cursorTuple === undefined
        ? undefined
        : {
            OR: [
              { createdAt: { lt: new Date(cursorTuple.createdAt) } },
              {
                createdAt: new Date(cursorTuple.createdAt),
                id: { lt: cursorTuple.id },
              },
            ],
          };

    const rows = await this.prisma.product.findMany({
      where: { sellerId, ...cursorFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: summarySelect,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last !== undefined
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null;

    return sellerProductListResponseSchema.parse({
      data: page.map(toSummaryDto),
      meta: { nextCursor, hasMore },
    });
  }

  async findOwnedDetail(
    sellerId: string,
    productId: string,
  ): Promise<SellerProductDetailResponse> {
    const row = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
      select: detailSelect,
    });
    if (row === null) throw new NotFoundException("Product not found");
    return toDetailDto(row);
  }

  async createDraft(
    sellerId: string,
    body: CreateDraftProductRequest,
  ): Promise<SellerProductDetailResponse> {
    const category = await this.prisma.category.findUnique({
      where: { slug: body.category },
      select: { id: true },
    });
    if (category === null) {
      throw new Error(`Missing seeded category for slug ${body.category}`);
    }

    let created: { id: string };
    try {
      created = await this.prisma.product.create({
        data: {
          sellerId,
          categoryId: category.id,
          slug: body.slug,
          thumbnailUrl: body.thumbnailUrl,
          documentationUrl: body.documentationUrl,
          isolatedPreviewUrl: body.isolatedPreviewUrl,
          tags:
            body.tags === undefined || body.tags.length === 0
              ? undefined
              : {
                  create: body.tags.map((slug) => ({
                    tag: {
                      connectOrCreate: {
                        where: { slug },
                        create: { slug },
                      },
                    },
                  })),
                },
        },
        select: { id: true },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("Product slug already exists");
      }
      throw error;
    }

    return this.findOwnedDetail(sellerId, created.id);
  }

  async editDraft(
    sellerId: string,
    productId: string,
    body: EditDraftProductRequest,
  ): Promise<SellerProductDetailResponse> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
      select: { id: true, publicationState: true },
    });
    if (product === null) throw new NotFoundException("Product not found");
    if (product.publicationState !== "draft") {
      throw new ConflictException("Only a draft product can be edited");
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.applyScalarEdits(tx, productId, body);
        await this.replaceTags(tx, productId, body.tags);
        await this.replaceTranslations(tx, productId, body.translations);
        await this.replaceMedia(tx, productId, body.media);
        await this.replaceCompatibility(tx, productId, body.compatibility);
        await this.replaceSpecifications(tx, productId, body.specifications);
        await this.replaceDemoPages(tx, productId, body.demoPages);
      });
    } catch (error: unknown) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("Edit conflicts with an existing entry");
      }
      throw error;
    }

    return this.findOwnedDetail(sellerId, productId);
  }

  private async applyScalarEdits(
    tx: Prisma.TransactionClient,
    productId: string,
    body: EditDraftProductRequest,
  ): Promise<void> {
    const data: Prisma.ProductUpdateInput = {};
    if (body.category !== undefined) {
      const category = await tx.category.findUnique({
        where: { slug: body.category },
        select: { id: true },
      });
      if (category === null) {
        throw new Error(`Missing seeded category for slug ${body.category}`);
      }
      data.category = { connect: { id: category.id } };
    }
    if (body.thumbnailUrl !== undefined) data.thumbnailUrl = body.thumbnailUrl;
    if (body.documentationUrl !== undefined) {
      data.documentationUrl = body.documentationUrl;
    }
    if (body.isolatedPreviewUrl !== undefined) {
      data.isolatedPreviewUrl = body.isolatedPreviewUrl;
    }
    if (Object.keys(data).length > 0) {
      await tx.product.update({ where: { id: productId }, data });
    }
  }

  private async replaceTags(
    tx: Prisma.TransactionClient,
    productId: string,
    tags: EditDraftProductRequest["tags"],
  ): Promise<void> {
    if (tags === undefined) return;
    await tx.productTag.deleteMany({ where: { productId } });
    for (const slug of tags) {
      const tag = await tx.tag.upsert({
        where: { slug },
        update: {},
        create: { slug },
        select: { id: true },
      });
      await tx.productTag.create({ data: { productId, tagId: tag.id } });
    }
  }

  private async replaceTranslations(
    tx: Prisma.TransactionClient,
    productId: string,
    translations: EditDraftProductRequest["translations"],
  ): Promise<void> {
    if (translations === undefined) return;
    await tx.productTranslation.deleteMany({ where: { productId } });
    await tx.productTranslation.createMany({
      data: translations.map((translation) => ({ productId, ...translation })),
    });
  }

  private async replaceMedia(
    tx: Prisma.TransactionClient,
    productId: string,
    media: EditDraftProductRequest["media"],
  ): Promise<void> {
    if (media === undefined) return;
    const existing = await tx.productMedia.findMany({
      where: { productId },
      select: { id: true },
    });
    if (existing.length > 0) {
      await tx.productMediaTranslation.deleteMany({
        where: { mediaId: { in: existing.map((row) => row.id) } },
      });
      await tx.productMedia.deleteMany({ where: { productId } });
    }
    for (const item of media) {
      await tx.productMedia.create({
        data: {
          productId,
          position: item.position,
          kind: item.kind,
          url: item.url,
          translations: { create: item.translations },
        },
      });
    }
  }

  private async replaceCompatibility(
    tx: Prisma.TransactionClient,
    productId: string,
    compatibility: EditDraftProductRequest["compatibility"],
  ): Promise<void> {
    if (compatibility === undefined) return;
    await tx.productCompatibility.deleteMany({ where: { productId } });
    if (compatibility.length > 0) {
      await tx.productCompatibility.createMany({
        data: compatibility.map((entry) => ({ productId, ...entry })),
      });
    }
  }

  private async replaceSpecifications(
    tx: Prisma.TransactionClient,
    productId: string,
    specifications: EditDraftProductRequest["specifications"],
  ): Promise<void> {
    if (specifications === undefined) return;
    const existing = await tx.productSpecification.findMany({
      where: { productId },
      select: { id: true },
    });
    if (existing.length > 0) {
      await tx.productSpecificationTranslation.deleteMany({
        where: { specificationId: { in: existing.map((row) => row.id) } },
      });
      await tx.productSpecification.deleteMany({ where: { productId } });
    }
    for (const spec of specifications) {
      await tx.productSpecification.create({
        data: {
          productId,
          key: spec.key,
          translations: { create: spec.translations },
        },
      });
    }
  }

  private async replaceDemoPages(
    tx: Prisma.TransactionClient,
    productId: string,
    demoPages: EditDraftProductRequest["demoPages"],
  ): Promise<void> {
    if (demoPages === undefined) return;
    const existing = await tx.productDemoPage.findMany({
      where: { productId },
      select: { id: true },
    });
    if (existing.length > 0) {
      await tx.productDemoPageTranslation.deleteMany({
        where: { demoPageId: { in: existing.map((row) => row.id) } },
      });
      await tx.productDemoPage.deleteMany({ where: { productId } });
    }
    for (const page of demoPages) {
      await tx.productDemoPage.create({
        data: {
          productId,
          position: page.position,
          slug: page.slug,
          previewUrl: page.previewUrl,
          translations: { create: page.translations },
        },
      });
    }
  }
}
