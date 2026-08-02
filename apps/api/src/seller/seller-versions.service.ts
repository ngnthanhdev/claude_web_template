import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ReviewState } from "@prisma/client";
import type {
  CreateVersionRequest,
  SellerProductDetailResponse,
} from "@marketplace/shared/seller";

import { PrismaService } from "../prisma/prisma.service.js";
import { SellerProductsService } from "./seller-products.service.js";

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Creates `ProductVersion`s on an owned `Product` (design §5/§6).
 * `reviewState` always starts at `draft` server-side — it is never bindable
 * from `CreateVersionRequest` (the shared schema doesn't even carry the
 * field), and this service pins it explicitly rather than relying only on
 * the Prisma column default.
 */
@Injectable()
export class SellerVersionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SellerProductsService)
    private readonly sellerProducts: SellerProductsService,
  ) {}

  async createVersion(
    sellerId: string,
    productId: string,
    body: CreateVersionRequest,
  ): Promise<SellerProductDetailResponse> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
      select: { id: true },
    });
    if (product === null) throw new NotFoundException("Product not found");

    try {
      await this.prisma.productVersion.create({
        data: {
          productId,
          version: body.version,
          releasedAt: new Date(body.releasedAt),
          reviewState: ReviewState.draft,
          translations: { create: body.translations },
        },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("Version already exists");
      }
      throw error;
    }

    return this.sellerProducts.findOwnedDetail(sellerId, productId);
  }
}
