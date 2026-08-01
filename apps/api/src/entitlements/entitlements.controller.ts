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
import { semanticVersionSchema } from "@marketplace/shared/catalogue";
import type {
  DownloadIssueResponse,
  LibraryResponse,
} from "@marketplace/shared/commerce";
import { ZodValidationException } from "nestjs-zod";
import { ZodError, z } from "zod";

import { SessionAuthGuard } from "../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../auth/sessions/session-csrf.guard.js";
import {
  getResolvedSession,
  type SessionRequest,
} from "../auth/sessions/session-context.js";
import { EntitlementsService } from "./entitlements.service.js";

const libraryQuerySchema = z
  .object({
    cursor: z.string().min(1).max(2_048).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const entitlementIdSchema = z.string().uuid();

const downloadIssueRequestSchema = z
  .object({
    productId: z.string().uuid(),
    version: semanticVersionSchema,
  })
  .strict();

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

@Controller()
export class EntitlementsController {
  constructor(
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get("account/library")
  @UseGuards(SessionAuthGuard)
  listLibrary(
    @Req() request: SessionRequest,
    @Query() query: unknown,
  ): Promise<LibraryResponse> {
    const session = getResolvedSession(request);
    return this.entitlements.listLibrary(
      session.user.id,
      parseRequest(libraryQuerySchema, query),
    );
  }

  @Post("entitlements/:id/download")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard, SessionCsrfGuard)
  issueDownload(
    @Req() request: SessionRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DownloadIssueResponse> {
    const session = getResolvedSession(request);
    const entitlementId = parseRequest(entitlementIdSchema, id);
    const parsedBody = parseRequest(downloadIssueRequestSchema, body);
    return this.entitlements.issueDownload(
      session.user.id,
      entitlementId,
      parsedBody,
      { ip: request.ip },
    );
  }
}
