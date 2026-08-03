import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  adminMfaEnrollConfirmRequestSchema,
  adminMfaEnrollStartRequestSchema,
  adminMfaRecoveryRegenerateRequestSchema,
  adminMfaVerifyRequestSchema,
  type AdminMfaEnrollConfirmResponse,
  type AdminMfaEnrollStartResponse,
  type AdminMfaRecoveryRegenerateResponse,
  type AdminMfaVerifyResponse,
} from "@marketplace/shared/admin";
import { createZodDto, ZodValidationPipe } from "nestjs-zod";

import { getResolvedSession } from "../../auth/sessions/session-context.js";
import { SessionAuthGuard } from "../../auth/sessions/session-auth.guard.js";
import { SessionCsrfGuard } from "../../auth/sessions/session-csrf.guard.js";
import { AdminMfaEnforcementGuard } from "../admin-mfa-enforcement.guard.js";
import { getAdminPrincipal, type AdminRequest } from "../admin-principal.js";
import { AdminRolesGuard } from "../admin-roles.guard.js";
import { AdminMfaService } from "./admin-mfa.service.js";

class AdminMfaEnrollStartDto extends createZodDto(
  adminMfaEnrollStartRequestSchema,
) {}
class AdminMfaEnrollConfirmDto extends createZodDto(
  adminMfaEnrollConfirmRequestSchema,
) {}
class AdminMfaVerifyDto extends createZodDto(adminMfaVerifyRequestSchema) {}
class AdminMfaRecoveryRegenerateDto extends createZodDto(
  adminMfaRecoveryRegenerateRequestSchema,
) {}

/**
 * Admin TOTP enrollment/verification (design §6/§8). `enroll`/`confirm`/
 * `verify` are deliberately NOT behind `AdminMfaEnforcementGuard` — an admin
 * cannot already be MFA-verified before they have enrolled. Only
 * `recovery-codes` (a post-enrollment sensitive action) requires it.
 */
@Controller("admin/mfa")
@UseGuards(SessionAuthGuard)
export class AdminMfaController {
  constructor(@Inject(AdminMfaService) private readonly mfa: AdminMfaService) {}

  @Post("enroll")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCsrfGuard, AdminRolesGuard)
  enroll(
    @Req() request: AdminRequest,
    // No fields to read — the empty allowlist still forces the pipe to run
    // and reject an unexpected body.
    @Body(new ZodValidationPipe(adminMfaEnrollStartRequestSchema))
    body: AdminMfaEnrollStartDto,
  ): Promise<AdminMfaEnrollStartResponse> {
    void body;
    const principal = getAdminPrincipal(request);
    const session = getResolvedSession(request);
    return this.mfa.enrollStart(principal.userId, session.user.email);
  }

  @Post("confirm")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCsrfGuard, AdminRolesGuard)
  confirm(
    @Req() request: AdminRequest,
    @Body(new ZodValidationPipe(adminMfaEnrollConfirmRequestSchema))
    body: AdminMfaEnrollConfirmDto,
  ): Promise<AdminMfaEnrollConfirmResponse> {
    const principal = getAdminPrincipal(request);
    return this.mfa.confirm(principal.userId, body, { ip: request.ip });
  }

  @Post("verify")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCsrfGuard, AdminRolesGuard)
  verify(
    @Req() request: AdminRequest,
    @Body(new ZodValidationPipe(adminMfaVerifyRequestSchema))
    body: AdminMfaVerifyDto,
  ): Promise<AdminMfaVerifyResponse> {
    const principal = getAdminPrincipal(request);
    const session = getResolvedSession(request);
    return this.mfa.verify(principal.userId, session.sessionId, body, {
      ip: request.ip,
    });
  }

  @Post("recovery-codes")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCsrfGuard, AdminRolesGuard, AdminMfaEnforcementGuard)
  regenerateRecoveryCodes(
    @Req() request: AdminRequest,
    // No fields to read — the empty allowlist still forces the pipe to run
    // and reject an unexpected body.
    @Body(new ZodValidationPipe(adminMfaRecoveryRegenerateRequestSchema))
    body: AdminMfaRecoveryRegenerateDto,
  ): Promise<AdminMfaRecoveryRegenerateResponse> {
    void body;
    const principal = getAdminPrincipal(request);
    return this.mfa.regenerateRecoveryCodes(principal.userId);
  }
}
