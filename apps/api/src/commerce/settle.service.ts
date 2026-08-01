import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { orderSchema, type Order } from "@marketplace/shared/commerce";

import { PrismaService } from "../prisma/prisma.service.js";
import { mapOrderToDto } from "./orders.service.js";
import { PAYMENT_PORT, type PaymentPort } from "./payment/payment.port.js";

const paymentAttemptWithOrderInclude = {
  order: { include: { items: true } },
} satisfies Prisma.PaymentAttemptInclude;

type PaymentAttemptWithOrder = Prisma.PaymentAttemptGetPayload<{
  include: typeof paymentAttemptWithOrderInclude;
}>;

/**
 * Settles a sandbox `PaymentAttempt`: transitions it and its `Order` to
 * `settled` and grants the `Entitlement`s in one atomic transaction — the
 * only place entitlements are ever created (design §9 "Order → Entitlement
 * grant / Elevation"). The trigger itself is gated by {@link PaymentPort},
 * which throws outside non-production environments before any lookup runs
 * (design §9 "Sandbox settle endpoint / Elevation").
 */
@Injectable()
export class SettleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_PORT) private readonly paymentPort: PaymentPort,
  ) {}

  async settle(userId: string, paymentAttemptId: string): Promise<Order> {
    this.paymentPort.assertSettlementAllowed();

    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { id: paymentAttemptId },
      include: paymentAttemptWithOrderInclude,
    });
    if (attempt === null || attempt.order.userId !== userId) {
      throw new NotFoundException("Payment attempt not found");
    }

    if (attempt.status === "settled") {
      return orderSchema.parse(mapOrderToDto(attempt.order));
    }
    if (attempt.status !== "pending" || attempt.order.status !== "pending") {
      throw new UnprocessableEntityException(
        "Payment attempt cannot be settled",
      );
    }

    await this.paymentPort.confirmSettlement({ paymentAttemptId });

    const settledOrder = await this.settleTransaction(attempt);
    return orderSchema.parse(mapOrderToDto(settledOrder));
  }

  private settleTransaction(attempt: PaymentAttemptWithOrder) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const updatedAttempt = await tx.paymentAttempt.updateMany({
        where: { id: attempt.id, status: "pending" },
        data: { status: "settled", settledAt: now },
      });
      if (updatedAttempt.count !== 1) {
        throw new UnprocessableEntityException(
          "Payment attempt cannot be settled",
        );
      }

      const updatedOrder = await tx.order.updateMany({
        where: { id: attempt.order.id, status: "pending" },
        data: { status: "settled", settledAt: now },
      });
      if (updatedOrder.count !== 1) {
        throw new UnprocessableEntityException("Order cannot be settled");
      }

      if (attempt.order.items.length > 0) {
        await tx.entitlement.createMany({
          data: attempt.order.items.map((item) => ({
            userId: attempt.order.userId,
            productId: item.productId,
            version: item.version,
            orderId: attempt.order.id,
            createdAt: now,
          })),
          skipDuplicates: true,
        });
      }

      return tx.order.findUniqueOrThrow({
        where: { id: attempt.order.id },
        include: { items: true },
      });
    });
  }
}
