import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { BuildVerdict, PublicationState, ReviewState } from "@prisma/client";
import {
  delistProductResponseSchema,
  publishProductResponseSchema,
  type DelistProductResponse,
  type PublishProductRequest,
  type PublishProductResponse,
} from "@marketplace/shared/admin";

import { AdminAuditService } from "../admin-audit.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

/**
 * Dedicated guarded `Product.publicationState` transitions (design §5/§8):
 * `draft -> published` (only once the addressed `ProductVersion` is
 * `approved`, its `Artifact` carries a verified, non-blank
 * `checksum`/`signature`, and its linked `BuildRun` passed both QA and scan)
 * and `published -> delisted`. Reuses the shipped `PublicationState` enum and
 * `Artifact` shape exactly — no parallel state model. Every flip and its
 * `AdminAuditLog` row commit together in one transaction.
 */
@Injectable()
export class AdminPublicationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async publish(
    actingAdminId: string,
    productId: string,
    body: PublishProductRequest,
  ): Promise<PublishProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, publicationState: true },
    });
    if (product === null) throw new NotFoundException("Product not found");

    const version = await this.prisma.productVersion.findUnique({
      where: { productId_version: { productId, version: body.version } },
      select: {
        reviewState: true,
        artifact: {
          select: {
            checksum: true,
            signature: true,
            buildRuns: { select: { qaVerdict: true, scanVerdict: true } },
          },
        },
      },
    });
    if (version === null) {
      throw new NotFoundException("Product version not found");
    }

    const artifact = version.artifact;
    const hasPassingBuildRun =
      artifact !== null &&
      artifact.buildRuns.some(
        (run) =>
          run.qaVerdict === BuildVerdict.passed &&
          run.scanVerdict === BuildVerdict.passed,
      );
    const isEligible =
      product.publicationState === PublicationState.draft &&
      version.reviewState === ReviewState.approved &&
      artifact !== null &&
      artifact.checksum.trim().length > 0 &&
      artifact.signature.trim().length > 0 &&
      hasPassingBuildRun;

    if (!isEligible || artifact === null) {
      throw new UnprocessableEntityException(
        "Product version is not eligible to publish",
      );
    }

    const publishedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Conditional update: the eligibility read above ran outside this
      // transaction, so guard the state precondition here. A concurrent
      // publish (or any move off `draft`) makes `count` 0 and 422s without
      // writing a duplicate audit row or clobbering `publishedAt`.
      const result = await tx.product.updateMany({
        where: { id: productId, publicationState: PublicationState.draft },
        data: {
          publicationState: PublicationState.published,
          currentVersion: body.version,
          publishedAt,
        },
      });
      if (result.count !== 1) {
        throw new UnprocessableEntityException(
          "Product version is not eligible to publish",
        );
      }
      await this.audit.record(tx, {
        actingAdminId,
        action: "productPublished",
        targetType: "product",
        targetId: productId,
        afterState: {
          publicationState: PublicationState.published,
          version: body.version,
          checksum: artifact.checksum,
        },
      });
    });

    return publishProductResponseSchema.parse({
      productId,
      version: body.version,
      publicationState: PublicationState.published,
    });
  }

  async delist(
    actingAdminId: string,
    productId: string,
  ): Promise<DelistProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        publicationState: true,
        currentVersion: true,
        currentVersionEntry: {
          select: { artifact: { select: { checksum: true } } },
        },
      },
    });
    if (product === null) throw new NotFoundException("Product not found");
    if (product.publicationState !== PublicationState.published) {
      throw new UnprocessableEntityException(
        "Only a published product can be delisted",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Conditional update guards the `published` precondition against a
      // concurrent delist between the read above and this write.
      const result = await tx.product.updateMany({
        where: { id: productId, publicationState: PublicationState.published },
        data: { publicationState: PublicationState.delisted },
      });
      if (result.count !== 1) {
        throw new UnprocessableEntityException(
          "Only a published product can be delisted",
        );
      }
      await this.audit.record(tx, {
        actingAdminId,
        action: "productDelisted",
        targetType: "product",
        targetId: productId,
        afterState: {
          publicationState: PublicationState.delisted,
          version: product.currentVersion,
          checksum: product.currentVersionEntry?.artifact?.checksum ?? null,
        },
      });
    });

    return delistProductResponseSchema.parse({
      productId,
      publicationState: PublicationState.delisted,
    });
  }
}
