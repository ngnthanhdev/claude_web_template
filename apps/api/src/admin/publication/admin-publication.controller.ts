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
  delistProductRequestSchema,
  publishProductRequestSchema,
  type DelistProductResponse,
  type PublishProductResponse,
} from "@marketplace/shared/admin";
import {
  createZodDto,
  ZodValidationException,
  ZodValidationPipe,
} from "nestjs-zod";
import { ZodError, z } from "zod";

import { SessionAuthGuard } from "../../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../../auth/sessions/session-csrf.guard.js";
import { AdminMfaEnforcementGuard } from "../admin-mfa-enforcement.guard.js";
import { getAdminPrincipal, type AdminRequest } from "../admin-principal.js";
import { AdminRolesGuard } from "../admin-roles.guard.js";
import { AdminPublicationService } from "./admin-publication.service.js";

class PublishProductDto extends createZodDto(publishProductRequestSchema) {}

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

@Controller("admin/products")
@UseGuards(SessionAuthGuard)
export class AdminPublicationController {
  constructor(
    @Inject(AdminPublicationService)
    private readonly adminPublication: AdminPublicationService,
  ) {}

  @Post(":productId/publish")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCsrfGuard, AdminRolesGuard, AdminMfaEnforcementGuard)
  publish(
    @Req() request: AdminRequest,
    @Param("productId") productId: string,
    @Body(new ZodValidationPipe(publishProductRequestSchema))
    body: PublishProductDto,
  ): Promise<PublishProductResponse> {
    const principal = getAdminPrincipal(request);
    return this.adminPublication.publish(
      principal.userId,
      parseRequest(productIdParamSchema, productId),
      body,
    );
  }

  @Post(":productId/delist")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCsrfGuard, AdminRolesGuard, AdminMfaEnforcementGuard)
  delist(
    @Req() request: AdminRequest,
    @Param("productId") productId: string,
    @Body() body: unknown,
  ): Promise<DelistProductResponse> {
    // The delist body is a `.strict()` empty allowlist (no target field —
    // the product comes from the route path): parse it purely for its
    // side effect of rejecting a smuggled field, and discard the result.
    parseRequest(delistProductRequestSchema, body);
    const principal = getAdminPrincipal(request);
    return this.adminPublication.delist(
      principal.userId,
      parseRequest(productIdParamSchema, productId),
    );
  }
}
