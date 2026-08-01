import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Order } from "@marketplace/shared/commerce";
import { ZodValidationException } from "nestjs-zod";
import { z, ZodError } from "zod";

import { SessionAuthGuard } from "../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../auth/sessions/session-csrf.guard.js";
import {
  getResolvedSession,
  type SessionRequest,
} from "../auth/sessions/session-context.js";
import { SettleService } from "./settle.service.js";

const paymentAttemptIdParamSchema = z.string().uuid();

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

@Controller("payment-attempts")
export class SettleController {
  constructor(@Inject(SettleService) private readonly settle: SettleService) {}

  @Post(":id/settle")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard, SessionCsrfGuard)
  create(
    @Req() request: SessionRequest,
    @Param("id") id: string,
  ): Promise<Order> {
    const session = getResolvedSession(request);
    return this.settle.settle(
      session.user.id,
      parseRequest(paymentAttemptIdParamSchema, id),
    );
  }
}
