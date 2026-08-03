import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminMfaFactorType } from "@prisma/client";
import {
  adminMfaEnrollConfirmResponseSchema,
  adminMfaEnrollStartResponseSchema,
  adminMfaRecoveryRegenerateResponseSchema,
  adminMfaVerifyResponseSchema,
  type AdminMfaEnrollConfirmRequest,
  type AdminMfaEnrollConfirmResponse,
  type AdminMfaEnrollStartResponse,
  type AdminMfaRecoveryRegenerateResponse,
  type AdminMfaVerifyRequest,
  type AdminMfaVerifyResponse,
} from "@marketplace/shared/admin";

import {
  AuthRateLimitService,
  type SourceAddressRequest,
} from "../../auth/core/auth-rate-limit.service.js";
import {
  AUTH_CLOCK,
  type AuthClock,
} from "../../auth/core/auth-session.service.js";
import type { Env } from "../../config/env.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AdminAuditService } from "../admin-audit.service.js";
import {
  base32Encode,
  buildOtpauthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from "./totp.js";

const MFA_ISSUER = "Kitvera Admin";
/** Must stay in lockstep with `RECOVERY_CODE_COUNT` in
 * `packages/shared/src/admin.ts` (`.length(RECOVERY_CODE_COUNT)` on both
 * response schemas) — the shared package does not export that constant. */
const RECOVERY_CODE_COUNT = 10;

/**
 * The single, existence-hiding rejection for every failed MFA challenge
 * (design §6/§8): wrong TOTP code, wrong/already-used recovery code, no
 * confirmed factor at all, and a rate-limit denial are all indistinguishable
 * to the caller — the same status, the same message.
 */
class AdminMfaChallengeRejected extends ForbiddenException {
  constructor() {
    super("Invalid or expired admin MFA code");
  }
}

/**
 * Admin TOTP enrollment and step-up verification (design §6/§8). Every
 * mutation here runs inside a transaction with its `AdminAuditLog` row
 * (`mfaEnrolled` at confirm time, `mfaRecoveryRegenerated` at regeneration) —
 * `enrollStart` alone is not audited, since a pending/unconfirmed factor is
 * not yet a trusted credential. No method ever returns or logs the
 * plaintext TOTP secret after enrollment, or a recovery-code hash.
 */
@Injectable()
export class AdminMfaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    @Inject(AuthRateLimitService)
    private readonly rateLimit: AuthRateLimitService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
  ) {}

  /**
   * Starts (or restarts) TOTP enrollment for the calling admin. Re-running
   * this replaces any existing factor's secret and resets `confirmedAt` to
   * `null` (design: "re-enrollment replaces the existing row") — the prior
   * secret stops being valid the moment a new one is generated, even if the
   * admin never completes `confirm`.
   */
  async enrollStart(
    adminUserId: string,
    accountEmail: string,
  ): Promise<AdminMfaEnrollStartResponse> {
    const secret = generateTotpSecret();
    const encryptedSecret = encryptTotpSecret(this.encryptionKey(), secret);

    const factor = await this.prisma.adminMfaFactor.upsert({
      where: {
        userId_type: { userId: adminUserId, type: AdminMfaFactorType.totp },
      },
      create: {
        userId: adminUserId,
        type: AdminMfaFactorType.totp,
        encryptedSecret,
      },
      update: { encryptedSecret, confirmedAt: null },
      select: { id: true },
    });

    return adminMfaEnrollStartResponseSchema.parse({
      factorId: factor.id,
      type: "totp",
      otpauthUri: buildOtpauthUri({
        issuer: MFA_ISSUER,
        accountName: accountEmail,
        secret,
      }),
      secret: base32Encode(secret),
    });
  }

  /**
   * Verifies the first TOTP code against the pending factor, marks it
   * confirmed, and issues the one-time recovery-code batch. A confirmation
   * attempt still spends from the shared MFA-verification rate-limit
   * bucket — guessing the pending factor's code is the same class of attack
   * as guessing a confirmed one.
   */
  async confirm(
    adminUserId: string,
    body: AdminMfaEnrollConfirmRequest,
    request: SourceAddressRequest,
  ): Promise<AdminMfaEnrollConfirmResponse> {
    const decision = await this.rateLimit.checkAdminMfaVerification(
      adminUserId,
      request,
    );
    if (!decision.allowed) throw new AdminMfaChallengeRejected();

    const factor = await this.prisma.adminMfaFactor.findFirst({
      where: {
        id: body.factorId,
        userId: adminUserId,
        type: AdminMfaFactorType.totp,
      },
      select: { id: true, encryptedSecret: true },
    });
    if (factor === null) throw new AdminMfaChallengeRejected();

    const now = this.clock.now();
    const secret = decryptTotpSecret(
      this.encryptionKey(),
      factor.encryptedSecret,
    );
    if (!verifyTotpCode(secret, body.code, now)) {
      throw new AdminMfaChallengeRejected();
    }

    const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    await this.prisma.$transaction(async (tx) => {
      await tx.adminMfaFactor.update({
        where: { id: factor.id },
        data: { confirmedAt: now },
      });
      // Replace, not append: any recovery codes issued by a previous
      // confirmation of this factor stop being valid the moment a new batch
      // is issued.
      await tx.adminMfaRecoveryCode.deleteMany({
        where: { factorId: factor.id },
      });
      await tx.adminMfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          factorId: factor.id,
          codeHash: hashRecoveryCode(code),
        })),
      });
      await this.audit.record(tx, {
        actingAdminId: adminUserId,
        action: "mfaEnrolled",
        targetType: "adminMfaFactor",
        targetId: factor.id,
        afterState: {
          factorId: factor.id,
          type: "totp",
          confirmedAt: now.toISOString(),
        },
      });
    });

    return adminMfaEnrollConfirmResponseSchema.parse({
      factorId: factor.id,
      confirmedAt: now.toISOString(),
      recoveryCodes,
    });
  }

  /**
   * Step-up challenge: validates a TOTP or recovery code against the
   * calling admin's confirmed factor and, on success, writes the
   * `AdminMfaSession` marker `AdminMfaEnforcementGuard` reads. Every
   * rejection path — rate-limited, no confirmed factor, wrong code, used
   * recovery code — throws the same generic error.
   */
  async verify(
    adminUserId: string,
    sessionId: string,
    body: AdminMfaVerifyRequest,
    request: SourceAddressRequest,
  ): Promise<AdminMfaVerifyResponse> {
    const decision = await this.rateLimit.checkAdminMfaVerification(
      adminUserId,
      request,
    );
    if (!decision.allowed) throw new AdminMfaChallengeRejected();

    const factor = await this.prisma.adminMfaFactor.findFirst({
      where: {
        userId: adminUserId,
        type: AdminMfaFactorType.totp,
        confirmedAt: { not: null },
      },
      select: { id: true, encryptedSecret: true },
    });
    if (factor === null) throw new AdminMfaChallengeRejected();

    const now = this.clock.now();
    if (/^\d{6}$/.test(body.code)) {
      const secret = decryptTotpSecret(
        this.encryptionKey(),
        factor.encryptedSecret,
      );
      if (!verifyTotpCode(secret, body.code, now)) {
        throw new AdminMfaChallengeRejected();
      }
      await this.prisma.adminMfaSession.create({
        data: { sessionId, verifiedAt: now },
      });
    } else {
      const verified = await this.prisma.$transaction(async (tx) => {
        // A conditional UPDATE, not a read-then-write: two concurrent
        // presentations of the same recovery code can only ever have one
        // winner (`count === 1`), closing the replay race.
        const consumed = await tx.adminMfaRecoveryCode.updateMany({
          where: {
            factorId: factor.id,
            codeHash: hashRecoveryCode(body.code),
            usedAt: null,
          },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) return false;
        await tx.adminMfaSession.create({
          data: { sessionId, verifiedAt: now },
        });
        return true;
      });
      if (!verified) throw new AdminMfaChallengeRejected();
    }

    return adminMfaVerifyResponseSchema.parse({
      verifiedAt: now.toISOString(),
    });
  }

  /**
   * Post-enrollment sensitive action (controller-gated behind
   * `AdminMfaEnforcementGuard`): replaces the confirmed factor's recovery
   * codes wholesale.
   */
  async regenerateRecoveryCodes(
    adminUserId: string,
  ): Promise<AdminMfaRecoveryRegenerateResponse> {
    const factor = await this.prisma.adminMfaFactor.findFirst({
      where: {
        userId: adminUserId,
        type: AdminMfaFactorType.totp,
        confirmedAt: { not: null },
      },
      select: { id: true },
    });
    if (factor === null) {
      throw new NotFoundException("No confirmed admin MFA factor");
    }

    const now = this.clock.now();
    const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    await this.prisma.$transaction(async (tx) => {
      await tx.adminMfaRecoveryCode.deleteMany({
        where: { factorId: factor.id },
      });
      await tx.adminMfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          factorId: factor.id,
          codeHash: hashRecoveryCode(code),
        })),
      });
      await this.audit.record(tx, {
        actingAdminId: adminUserId,
        action: "mfaRecoveryRegenerated",
        targetType: "adminMfaFactor",
        targetId: factor.id,
        afterState: { factorId: factor.id, type: "totp" },
      });
    });

    return adminMfaRecoveryRegenerateResponseSchema.parse({
      recoveryCodes,
      regeneratedAt: now.toISOString(),
    });
  }

  private encryptionKey(): Buffer {
    return Buffer.from(
      this.config.getOrThrow<string>("ADMIN_MFA_SECRET_ENCRYPTION_KEY"),
      "base64url",
    );
  }
}
