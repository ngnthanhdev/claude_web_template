import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  approveReviewRequestSchema,
  rejectReviewRequestSchema,
  type AdminReviewQueueListResponse,
  type ApproveReviewResponse,
  type RejectReviewResponse,
} from "@marketplace/shared/admin";
import { semanticVersionSchema } from "@marketplace/shared/catalogue";
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
import {
  adminReviewQueueQuerySchema,
  AdminReviewService,
} from "./admin-review.service.js";

class ApproveReviewDto extends createZodDto(approveReviewRequestSchema) {}
class RejectReviewDto extends createZodDto(rejectReviewRequestSchema) {}

const productIdParamSchema = z.string().uuid();
const versionParamSchema = semanticVersionSchema;

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

/**
 * Admin catalogue review resource (design §4/§5): approve/reject of a
 * seller's `submit-for-review` `ProductVersion`. Every route requires
 * `AdminRolesGuard` (admin role) and `AdminMfaEnforcementGuard` (a
 * prod-flag-gated recent-MFA check) on top of the base `SessionAuthGuard` —
 * admin sees every `in_review` version, never scoped to a single seller.
 */
@Controller("admin")
@UseGuards(SessionAuthGuard)
export class AdminReviewController {
  constructor(
    @Inject(AdminReviewService)
    private readonly adminReview: AdminReviewService,
  ) {}

  @Get("review")
  @UseGuards(AdminRolesGuard, AdminMfaEnforcementGuard)
  list(@Query() query: unknown): Promise<AdminReviewQueueListResponse> {
    return this.adminReview.list(
      parseRequest(adminReviewQueueQuerySchema, query),
    );
  }

  @Post("products/:productId/versions/:version/approve")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCsrfGuard, AdminRolesGuard, AdminMfaEnforcementGuard)
  approve(
    @Req() request: AdminRequest,
    @Param("productId") productId: string,
    @Param("version") version: string,
    @Body(new ZodValidationPipe(approveReviewRequestSchema))
    body: ApproveReviewDto,
  ): Promise<ApproveReviewResponse> {
    // The dedicated approve transition carries an empty, `.strict()` body —
    // there is nothing to read from it, but it is still validated so a
    // smuggled `reviewState`/`publicationState`/acting-admin field is
    // rejected rather than silently ignored.
    void body;
    const principal = getAdminPrincipal(request);
    return this.adminReview.approve(
      parseRequest(productIdParamSchema, productId),
      parseRequest(versionParamSchema, version),
      principal.userId,
    );
  }

  @Post("products/:productId/versions/:version/reject")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCsrfGuard, AdminRolesGuard, AdminMfaEnforcementGuard)
  reject(
    @Req() request: AdminRequest,
    @Param("productId") productId: string,
    @Param("version") version: string,
    @Body(new ZodValidationPipe(rejectReviewRequestSchema))
    body: RejectReviewDto,
  ): Promise<RejectReviewResponse> {
    const principal = getAdminPrincipal(request);
    return this.adminReview.reject(
      parseRequest(productIdParamSchema, productId),
      parseRequest(versionParamSchema, version),
      principal.userId,
      body.reason,
    );
  }
}
