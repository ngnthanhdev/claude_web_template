import { Body, Controller, Inject, Post, Req, UseGuards } from "@nestjs/common";
import {
  checkoutRequestSchema,
  type CheckoutResponse,
} from "@marketplace/shared/commerce";
import { ZodValidationException } from "nestjs-zod";
import { ZodError } from "zod";

import { SessionAuthGuard } from "../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../auth/sessions/session-csrf.guard.js";
import {
  getResolvedSession,
  type SessionRequest,
} from "../auth/sessions/session-context.js";
import { CheckoutService } from "./checkout.service.js";

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

@Controller("checkout")
export class CheckoutController {
  constructor(
    @Inject(CheckoutService) private readonly checkout: CheckoutService,
  ) {}

  @Post()
  @UseGuards(SessionAuthGuard, SessionCsrfGuard)
  create(
    @Req() request: SessionRequest,
    @Body() body: unknown,
  ): Promise<CheckoutResponse> {
    const session = getResolvedSession(request);
    const parsed = parseRequest(checkoutRequestSchema, body);
    return this.checkout.checkout(session.user.id, parsed);
  }
}
