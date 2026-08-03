import {
  Body,
  Controller,
  Delete,
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
  adminGrantRoleRequestSchema,
  adminRoleKeySchema,
  type AdminGrantRoleResponse,
  type AdminRevokeRoleResponse,
  type AdminUserListResponse,
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
import {
  adminUserListQuerySchema,
  AdminUsersService,
} from "./admin-users.service.js";

class AdminGrantRoleDto extends createZodDto(adminGrantRoleRequestSchema) {}

const userIdParamSchema = z.string().uuid();

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

@Controller("admin/users")
@UseGuards(SessionAuthGuard)
export class AdminUsersController {
  constructor(
    @Inject(AdminUsersService)
    private readonly adminUsers: AdminUsersService,
  ) {}

  @Get()
  @UseGuards(AdminRolesGuard, AdminMfaEnforcementGuard)
  list(@Query() query: unknown): Promise<AdminUserListResponse> {
    return this.adminUsers.list(parseRequest(adminUserListQuerySchema, query));
  }

  @Post(":userId/roles")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCsrfGuard, AdminRolesGuard, AdminMfaEnforcementGuard)
  grantRole(
    @Req() request: AdminRequest,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(adminGrantRoleRequestSchema))
    body: AdminGrantRoleDto,
  ): Promise<AdminGrantRoleResponse> {
    const principal = getAdminPrincipal(request);
    return this.adminUsers.grantRole(
      principal.userId,
      parseRequest(userIdParamSchema, userId),
      body.role,
    );
  }

  @Delete(":userId/roles/:roleKey")
  @UseGuards(SessionCsrfGuard, AdminRolesGuard, AdminMfaEnforcementGuard)
  revokeRole(
    @Req() request: AdminRequest,
    @Param("userId") userId: string,
    @Param("roleKey") roleKey: string,
  ): Promise<AdminRevokeRoleResponse> {
    const principal = getAdminPrincipal(request);
    return this.adminUsers.revokeRole(
      principal.userId,
      parseRequest(userIdParamSchema, userId),
      parseRequest(adminRoleKeySchema, roleKey),
    );
  }
}
