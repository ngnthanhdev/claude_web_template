import {
  Body,
  Controller,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  createVersionRequestSchema,
  type SellerProductDetailResponse,
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
import { SellerVersionsService } from "./seller-versions.service.js";

class CreateVersionDto extends createZodDto(createVersionRequestSchema) {}

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
export class SellerVersionsController {
  constructor(
    @Inject(SellerVersionsService)
    private readonly sellerVersions: SellerVersionsService,
  ) {}

  @Post(":id/versions")
  @UseGuards(SessionCsrfGuard, SellerGuard)
  createVersion(
    @Req() request: SellerRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createVersionRequestSchema))
    body: CreateVersionDto,
  ): Promise<SellerProductDetailResponse> {
    const principal = getSellerPrincipal(request);
    return this.sellerVersions.createVersion(
      principal.sellerId,
      parseRequest(productIdParamSchema, id),
      body,
    );
  }
}
