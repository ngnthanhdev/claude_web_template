import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ReviewState } from "@prisma/client";
import {
  submitForReviewResponseSchema,
  type SubmitForReviewRequest,
  type SubmitForReviewResponse,
} from "@marketplace/shared/seller";

import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Dedicated `draft -> in_review` review-submission transition (design
 * §5/§8) — never a field on the generic edit request, and never able to
 * reach `approved`/`published`: a seller can never self-publish. Submitting a
 * version that is already `in_review` is an idempotent no-op; submitting an
 * `approved` version (or anything else that isn't `draft`) is rejected.
 */
@Injectable()
export class SellerReviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async submitForReview(
    sellerId: string,
    productId: string,
    body: SubmitForReviewRequest,
  ): Promise<SubmitForReviewResponse> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
      select: { id: true },
    });
    if (product === null) throw new NotFoundException("Product not found");

    const version = await this.prisma.productVersion.findUnique({
      where: { productId_version: { productId, version: body.version } },
      select: { reviewState: true },
    });
    if (version === null) {
      throw new NotFoundException("Product version not found");
    }

    if (version.reviewState === ReviewState.in_review) {
      return submitForReviewResponseSchema.parse({
        productId,
        version: body.version,
        reviewState: ReviewState.in_review,
      });
    }
    if (version.reviewState !== ReviewState.draft) {
      throw new UnprocessableEntityException(
        "Only a draft version can be submitted for review",
      );
    }

    const updated = await this.prisma.productVersion.update({
      where: { productId_version: { productId, version: body.version } },
      data: { reviewState: ReviewState.in_review },
      select: { reviewState: true },
    });

    return submitForReviewResponseSchema.parse({
      productId,
      version: body.version,
      reviewState: updated.reviewState,
    });
  }
}
