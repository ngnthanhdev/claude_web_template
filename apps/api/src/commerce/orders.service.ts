import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  orderCollectionResponseSchema,
  orderDetailResponseSchema,
  type Order,
  type OrderCollectionResponse,
} from "@marketplace/shared/commerce";
import { ZodValidationException } from "nestjs-zod";
import { z, ZodError } from "zod";

import { PrismaService } from "../prisma/prisma.service.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

export const ordersQuerySchema = z
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
export type OrdersQuery = z.infer<typeof ordersQuerySchema>;

const orderCursorTupleSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();
type OrderCursorTuple = z.infer<typeof orderCursorTupleSchema>;

const orderWithItemsInclude = { items: true } satisfies Prisma.OrderInclude;
type OrderWithItems = Prisma.OrderGetPayload<{
  include: typeof orderWithItemsInclude;
}>;

function invalidCursor(): never {
  throw new ZodValidationException(
    new ZodError([
      { code: "custom", path: ["cursor"], message: "Invalid orders cursor" },
    ]),
  );
}

function encodeCursor(tuple: OrderCursorTuple): string {
  return Buffer.from(JSON.stringify(tuple), "utf8").toString("base64url");
}

function decodeCursor(raw: string): OrderCursorTuple {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    invalidCursor();
  }
  const result = orderCursorTupleSchema.safeParse(parsed);
  if (!result.success) invalidCursor();
  return result.data;
}

/**
 * Maps a persisted order (+ its immutable item snapshots) to the shared,
 * allowlisted public DTO (design §5/§9 "Order detail / Information
 * disclosure"): own id/status/creation date/authoritative total and item
 * snapshots — never the payment reference, provider field, idempotency key,
 * owner id, or subtotal/discount breakdown.
 */
export function mapOrderToDto(order: OrderWithItems): Order {
  return {
    id: order.id,
    status: order.status,
    total: { amount: order.totalMinor, currency: order.currency },
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      productId: item.productId,
      version: item.version,
      licenceIdentifier: item.licenceIdentifier,
      titleSnapshot: item.titleSnapshot,
      unitPrice: { amount: item.unitPriceMinor, currency: item.currency },
    })),
  };
}

/**
 * Reads for the caller's own orders. Every query is scoped to `userId`, so a
 * non-owned id is indistinguishable from a missing one — `404`, never `403`
 * (design §9 "Order read / Elevation (BOLA/IDOR)").
 */
@Injectable()
export class OrdersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: OrdersQuery,
  ): Promise<OrderCollectionResponse> {
    const cursorTuple =
      query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    const cursorFilter: Prisma.OrderWhereInput | undefined =
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

    const rows = await this.prisma.order.findMany({
      where: { userId, ...cursorFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: orderWithItemsInclude,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last !== undefined
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null;

    return orderCollectionResponseSchema.parse({
      data: page.map(mapOrderToDto),
      meta: { nextCursor, hasMore },
    });
  }

  async findOne(userId: string, id: string): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: orderWithItemsInclude,
    });
    if (order === null) throw new NotFoundException("Order not found");
    return orderDetailResponseSchema.parse(mapOrderToDto(order));
  }
}
