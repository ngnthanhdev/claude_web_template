import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  magicLinkInitiationRequestSchema,
  magicLinkRedemptionRequestSchema,
  type MagicLinkInitiationResponse,
  type MagicLinkRedemptionResponse,
} from "@marketplace/shared/auth";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodValidationException } from "nestjs-zod";
import { ZodError } from "zod";

import { setSessionCookie } from "../core/auth-cookie.js";
import { MagicLinksService } from "./magic-links.service.js";

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

@Controller("auth")
export class MagicLinksController {
  constructor(
    @Inject(MagicLinksService)
    private readonly magicLinks: MagicLinksService,
  ) {}

  @Post("magic-links")
  @HttpCode(HttpStatus.ACCEPTED)
  initiate(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<MagicLinkInitiationResponse> {
    return this.magicLinks.initiate(
      parseRequest(magicLinkInitiationRequestSchema, body),
      { ip: request.ip },
    );
  }

  @Post("magic-link-redemptions")
  @HttpCode(HttpStatus.CREATED)
  async redeem(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MagicLinkRedemptionResponse> {
    const result = await this.magicLinks.redeem(
      parseRequest(magicLinkRedemptionRequestSchema, body),
      { ip: request.ip },
    );
    setSessionCookie(reply, result.sessionToken);
    return result.response;
  }
}
