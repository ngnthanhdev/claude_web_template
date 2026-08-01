import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  Order,
  OrderCollectionResponse,
} from "@marketplace/shared/commerce";
import { ZodValidationException } from "nestjs-zod";
import { z, ZodError } from "zod";

import { SessionAuthGuard } from "../auth/sessions/session-auth.guard.js";
import {
  getResolvedSession,
  type SessionRequest,
} from "../auth/sessions/session-context.js";
import { OrdersService, ordersQuerySchema } from "./orders.service.js";

const orderIdParamSchema = z.string().uuid();

function parseRequest<T>(
  schema: { parse(input: unknown): T },
  input: unknown,
): T {
  try {
    return schema.parse(input);
  } catch (error: unknown) {
    if (error instanceof ZodError) throw new ZodValidationException(error);
    throw error;
  }
}

@Controller("orders")
@UseGuards(SessionAuthGuard)
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get()
  list(
    @Req() request: SessionRequest,
    @Query() query: unknown,
  ): Promise<OrderCollectionResponse> {
    const session = getResolvedSession(request);
    return this.orders.list(
      session.user.id,
      parseRequest(ordersQuerySchema, query),
    );
  }

  @Get(":id")
  findOne(
    @Req() request: SessionRequest,
    @Param("id") id: string,
  ): Promise<Order> {
    const session = getResolvedSession(request);
    return this.orders.findOne(
      session.user.id,
      parseRequest(orderIdParamSchema, id),
    );
  }
}
