import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, PublicationState } from "@prisma/client";
import {
  checkoutResponseSchema,
  type CheckoutRequest,
  type CheckoutResponse,
} from "@marketplace/shared/commerce";
import type { Currency } from "@marketplace/shared/localization";

import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Wave-1 checkout carries no currency field (design §5's `POST /v1/checkout`
 * body is `{ items, idempotencyKey, discountCode? }`) — the shopper's
 * VND/USD display preference is client-only UI state
 * (`apps/web/src/lib/currency.tsx`), never sent to the server. Every Wave-1
 * order is therefore priced in the marketplace's default currency, matching
 * the web app's own `DEFAULT_CURRENCY`. A later wave that wants per-order
 * currency choice extends the checkout contract explicitly rather than
 * inferring it here.
 */
const CHECKOUT_CURRENCY: Currency = "VND";

const RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const MAX_CHECKOUT_ATTEMPTS_PER_WINDOW = 20;

const checkoutProductInclude = {
  licenceOptions: { include: { prices: true } },
  translations: { where: { locale: "en" } },
} satisfies Prisma.ProductInclude;

type CheckoutProductRow = Prisma.ProductGetPayload<{
  include: typeof checkoutProductInclude;
}>;

const orderWithPaymentAttemptsInclude = {
  paymentAttempts: true,
} satisfies Prisma.OrderInclude;

type OrderWithPaymentAttempts = Prisma.OrderGetPayload<{
  include: typeof orderWithPaymentAttemptsInclude;
}>;

type CheckoutItem = CheckoutRequest["items"][number];

interface PricedSnapshot {
  readonly productId: string;
  readonly version: string;
  readonly licenceIdentifier: CheckoutItem["licence"];
  readonly titleSnapshot: string;
  readonly unitPriceMinor: number;
  readonly currency: Currency;
}

/**
 * Creates the `Order` + immutable `OrderItemSnapshot`s + a `pending`
 * `PaymentAttempt` from a client cart, computing every price server-side from
 * the published catalogue (design §9 "Client cart → checkout / Tampering").
 * Idempotent on `idempotencyKey`: a retry — including a race between two
 * concurrent identical requests — returns the original order rather than
 * creating a duplicate.
 */
@Injectable()
export class CheckoutService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async checkout(
    userId: string,
    request: CheckoutRequest,
  ): Promise<CheckoutResponse> {
    // Replay an existing order for a repeated idempotency key BEFORE the rate
    // limit, so a client that lost its response and retries the same key gets
    // its original order back rather than a 429 at the attempt cap.
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: request.idempotencyKey },
      include: orderWithPaymentAttemptsInclude,
    });
    if (existing !== null) {
      return this.replayResponse(userId, existing);
    }

    await this.assertWithinRateLimit(userId);

    const snapshots = await this.priceItems(request.items);
    const subtotalMinor = snapshots.reduce(
      (sum, item) => sum + item.unitPriceMinor,
      0,
    );
    const discountMinor = 0;
    const totalMinor = subtotalMinor - discountMinor;

    try {
      const created = await this.prisma.order.create({
        data: {
          userId,
          currency: CHECKOUT_CURRENCY,
          subtotalMinor,
          discountMinor,
          totalMinor,
          idempotencyKey: request.idempotencyKey,
          items: {
            create: snapshots.map((snapshot) => ({
              productId: snapshot.productId,
              version: snapshot.version,
              licenceIdentifier: snapshot.licenceIdentifier,
              titleSnapshot: snapshot.titleSnapshot,
              unitPriceMinor: snapshot.unitPriceMinor,
              currency: snapshot.currency,
            })),
          },
          paymentAttempts: { create: [{ provider: "sandbox" }] },
        },
        include: orderWithPaymentAttemptsInclude,
      });
      return this.toCheckoutResponse(created);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await this.prisma.order.findUnique({
          where: { idempotencyKey: request.idempotencyKey },
          include: orderWithPaymentAttemptsInclude,
        });
        if (raced !== null) return this.replayResponse(userId, raced);
      }
      throw error;
    }
  }

  private replayResponse(
    userId: string,
    order: OrderWithPaymentAttempts,
  ): CheckoutResponse {
    if (order.userId !== userId) {
      throw new ConflictException("Idempotency key already used");
    }
    return this.toCheckoutResponse(order);
  }

  private toCheckoutResponse(
    order: OrderWithPaymentAttempts,
  ): CheckoutResponse {
    const paymentAttempt = order.paymentAttempts[0];
    if (paymentAttempt === undefined) {
      throw new Error("Order is missing its checkout payment attempt");
    }
    return checkoutResponseSchema.parse({
      orderId: order.id,
      status: order.status,
      paymentAttemptId: paymentAttempt.id,
    });
  }

  private async assertWithinRateLimit(userId: string): Promise<void> {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recentOrders = await this.prisma.order.count({
      where: { userId, createdAt: { gt: since } },
    });
    if (recentOrders >= MAX_CHECKOUT_ATTEMPTS_PER_WINDOW) {
      throw new HttpException(
        "Too many checkout attempts",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async priceItems(
    items: readonly CheckoutItem[],
  ): Promise<PricedSnapshot[]> {
    const uniqueProductIds = [...new Set(items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: uniqueProductIds },
        publicationState: PublicationState.published,
        currentVersion: { not: null },
      },
      include: checkoutProductInclude,
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    return items.map((item) => {
      const product = productById.get(item.productId);
      if (product === undefined) {
        throw new NotFoundException("Product is not available for purchase");
      }
      return this.priceItem(product, item.licence);
    });
  }

  private priceItem(
    product: CheckoutProductRow,
    licence: CheckoutItem["licence"],
  ): PricedSnapshot {
    if (product.currentVersion === null) {
      throw new NotFoundException("Product is not available for purchase");
    }
    const licenceOption = product.licenceOptions.find(
      (option) => option.identifier === licence,
    );
    if (licenceOption === undefined) {
      throw new UnprocessableEntityException(
        `Licence ${licence} is not offered for this product`,
      );
    }
    const price = licenceOption.prices.find(
      (candidate) => candidate.currency === CHECKOUT_CURRENCY,
    );
    if (price === undefined) {
      throw new UnprocessableEntityException(
        `Licence ${licence} has no ${CHECKOUT_CURRENCY} price`,
      );
    }
    const titleSnapshot = product.translations[0]?.title;
    if (titleSnapshot === undefined) {
      throw new Error(
        `Product ${product.id} is missing its canonical title snapshot`,
      );
    }

    return {
      productId: product.id,
      version: product.currentVersion,
      licenceIdentifier: licence,
      titleSnapshot,
      unitPriceMinor: price.amount,
      currency: CHECKOUT_CURRENCY,
    };
  }
}
