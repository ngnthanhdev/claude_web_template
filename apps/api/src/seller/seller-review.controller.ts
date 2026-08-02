import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  submitForReviewRequestSchema,
  type SubmitForReviewResponse,
} from "@marketplace/shared/seller";
import {
  createZodDto,
  ZodValidationException,
  ZodValidationPipe,
} from "nestjs-zod";
import { ZodError, z } from "zod";

import { SessionAuthGuard } from "../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../auth/sessions/session-csrf.guard.js";
import { SellerGuard } from "./seller.guard.js";
import { getSellerPrincipal, type SellerRequest } from "./seller-principal.js";
import { SellerReviewService } from "./seller-review.service.js";

class SubmitForReviewDto extends createZodDto(submitForReviewRequestSchema) {}

const productIdParamSchema = z.string().uuid();

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

@Controller("seller/products")
@UseGuards(SessionAuthGuard)
export class SellerReviewController {
  constructor(
    @Inject(SellerReviewService)
    private readonly sellerReview: SellerReviewService,
  ) {}

  @Post(":id/submit-for-review")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCsrfGuard, SellerGuard)
  submitForReview(
    @Req() request: SellerRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(submitForReviewRequestSchema))
    body: SubmitForReviewDto,
  ): Promise<SubmitForReviewResponse> {
    const principal = getSellerPrincipal(request);
    return this.sellerReview.submitForReview(
      principal.sellerId,
      parseRequest(productIdParamSchema, id),
      body,
    );
  }
}
