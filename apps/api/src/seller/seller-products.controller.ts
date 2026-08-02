import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  createDraftProductRequestSchema,
  editDraftProductRequestSchema,
  type SellerProductDetailResponse,
  type SellerProductListResponse,
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
import {
  sellerProductListQuerySchema,
  SellerProductsService,
} from "./seller-products.service.js";

class CreateDraftProductDto extends createZodDto(
  createDraftProductRequestSchema,
) {}

class EditDraftProductDto extends createZodDto(editDraftProductRequestSchema) {}

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
export class SellerProductsController {
  constructor(
    @Inject(SellerProductsService)
    private readonly sellerProducts: SellerProductsService,
  ) {}

  @Get()
  @UseGuards(SellerGuard)
  list(
    @Req() request: SellerRequest,
    @Query() query: unknown,
  ): Promise<SellerProductListResponse> {
    const principal = getSellerPrincipal(request);
    return this.sellerProducts.list(
      principal.sellerId,
      parseRequest(sellerProductListQuerySchema, query),
    );
  }

  @Get(":id")
  @UseGuards(SellerGuard)
  findOne(
    @Req() request: SellerRequest,
    @Param("id") id: string,
  ): Promise<SellerProductDetailResponse> {
    const principal = getSellerPrincipal(request);
    return this.sellerProducts.findOwnedDetail(
      principal.sellerId,
      parseRequest(productIdParamSchema, id),
    );
  }

  @Post()
  @UseGuards(SessionCsrfGuard, SellerGuard)
  create(
    @Req() request: SellerRequest,
    @Body(new ZodValidationPipe(createDraftProductRequestSchema))
    body: CreateDraftProductDto,
  ): Promise<SellerProductDetailResponse> {
    const principal = getSellerPrincipal(request);
    return this.sellerProducts.createDraft(principal.sellerId, body);
  }

  @Patch(":id")
  @UseGuards(SessionCsrfGuard, SellerGuard)
  edit(
    @Req() request: SellerRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(editDraftProductRequestSchema))
    body: EditDraftProductDto,
  ): Promise<SellerProductDetailResponse> {
    const principal = getSellerPrincipal(request);
    return this.sellerProducts.editDraft(
      principal.sellerId,
      parseRequest(productIdParamSchema, id),
      body,
    );
  }
}
