import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import {
  categoryCollectionQuerySchema,
  productCollectionQuerySchema,
  slugSchema,
} from "@marketplace/shared/catalogue";
import { ZodError, z } from "zod";
import { ZodValidationException } from "nestjs-zod";

import { CatalogueService } from "./catalogue.service.js";

const emptyQuerySchema = z.object({}).strict();

function parseRequest<T>(schema: { parse(input: unknown): T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error: unknown) {
    if (error instanceof ZodError) throw new ZodValidationException(error);
    throw error;
  }
}

@Controller()
export class CatalogueController {
  constructor(
    @Inject(CatalogueService) private readonly catalogue: CatalogueService,
  ) {}

  @Get("categories")
  findCategories(@Query() query: unknown) {
    return this.catalogue.findCategories(
      parseRequest(categoryCollectionQuerySchema, query),
    );
  }

  @Get("products")
  findProducts(@Query() query: unknown) {
    return this.catalogue.findProducts(
      parseRequest(productCollectionQuerySchema, query),
    );
  }

  @Get("products/:slug")
  findProductBySlug(
    @Param("slug") slug: string,
    @Query() query: unknown,
  ) {
    parseRequest(emptyQuerySchema, query);
    return this.catalogue.findProductBySlug(parseRequest(slugSchema, slug));
  }
}
