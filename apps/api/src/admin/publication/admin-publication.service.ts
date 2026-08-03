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
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.product.update({
        where: { id: productId },
        data: {
          publicationState: PublicationState.published,
          currentVersion: body.version,
          publishedAt,
        },
        select: { publicationState: true },
      });
      await this.audit.record(tx, {
        actingAdminId,
        action: "productPublished",
        targetType: "product",
        targetId: productId,
        afterState: {
          publicationState: result.publicationState,
          version: body.version,
          checksum: artifact.checksum,
        },
      });
      return result;
    });

    return publishProductResponseSchema.parse({
      productId,
      version: body.version,
      publicationState: updated.publicationState,
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.product.update({
        where: { id: productId },
        data: { publicationState: PublicationState.delisted },
        select: { publicationState: true },
      });
      await this.audit.record(tx, {
        actingAdminId,
        action: "productDelisted",
        targetType: "product",
        targetId: productId,
        afterState: {
          publicationState: result.publicationState,
          version: product.currentVersion,
          checksum: product.currentVersionEntry?.artifact?.checksum ?? null,
        },
      });
      return result;
    });

    return delistProductResponseSchema.parse({
      productId,
      publicationState: updated.publicationState,
    });
  }
}
