import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";
import { AuthCryptoService } from "./auth-crypto.service.js";
import { AUTH_CLOCK, type AuthClock } from "./auth-session.service.js";

type RateAction =
  "magicLinkInitiation" | "magicLinkRedemption" | "adminMfaVerification";

interface RateWhere {
  action: RateAction;
  normalizedEmail?: string;
  sourceIpDigest?: string;
  occurredAt: { gt: Date };
}

export interface AuthRateTransaction {
  $queryRawUnsafe(query: string, parameter: string): Promise<unknown>;
  authRateEvent: {
    count(input: { where: RateWhere }): Promise<number>;
    create(input: {
      data: {
        action: RateAction;
        normalizedEmail?: string;
        sourceIpDigest: string;
        occurredAt: Date;
      };
    }): Promise<unknown>;
    deleteMany(input: {
      where: { occurredAt: { lt: Date } };
    }): Promise<unknown>;
  };
}

export interface AuthRatePrisma {
  $transaction<T>(
    operation: (transaction: AuthRateTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface SourceAddressRequest {
  readonly ip: string;
}

export interface AuthRateLimitDecision {
  readonly allowed: boolean;
  readonly sourceIpDigest: string;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

@Injectable()
export class AuthRateLimitService {
  constructor(
    @Inject(PrismaService) private readonly prisma: AuthRatePrisma,
    @Inject(AuthCryptoService) private readonly crypto: AuthCryptoService,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
  ) {}

  checkMagicLinkInitiation(
    normalizedEmail: string,
    request: SourceAddressRequest,
  ): Promise<AuthRateLimitDecision> {
    const sourceIpDigest = this.crypto.digestSourceAddress(request.ip);
    return this.prisma.$transaction(async (transaction) => {
      const acquired = await this.tryAcquireLocks(transaction, [
        `initiation:email:${normalizedEmail}`,
        `initiation:ip:${sourceIpDigest}`,
      ]);
      if (!acquired) return { allowed: false, sourceIpDigest };

      const now = this.clock.now();
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * MINUTE);
      const oneDayAgo = new Date(now.getTime() - DAY);
      const [emailShortCount, emailDayCount, ipShortCount] = await Promise.all([
        transaction.authRateEvent.count({
          where: {
            action: "magicLinkInitiation",
            normalizedEmail,
            occurredAt: { gt: fifteenMinutesAgo },
          },
        }),
        transaction.authRateEvent.count({
          where: {
            action: "magicLinkInitiation",
            normalizedEmail,
            occurredAt: { gt: oneDayAgo },
          },
        }),
        transaction.authRateEvent.count({
          where: {
            action: "magicLinkInitiation",
            sourceIpDigest,
            occurredAt: { gt: fifteenMinutesAgo },
          },
        }),
      ]);

      await this.prune(transaction, oneDayAgo);
      const allowed =
        emailShortCount < 3 && emailDayCount < 10 && ipShortCount < 20;
      if (allowed) {
        await transaction.authRateEvent.create({
          data: {
            action: "magicLinkInitiation",
            normalizedEmail,
            sourceIpDigest,
            occurredAt: now,
          },
        });
      }

      return { allowed, sourceIpDigest };
    });
  }

  checkMagicLinkRedemption(
    request: SourceAddressRequest,
  ): Promise<AuthRateLimitDecision> {
    const sourceIpDigest = this.crypto.digestSourceAddress(request.ip);
    return this.prisma.$transaction(async (transaction) => {
      const acquired = await this.tryAcquireLocks(transaction, [
        `redemption:ip:${sourceIpDigest}`,
      ]);
      if (!acquired) return { allowed: false, sourceIpDigest };
      const now = this.clock.now();
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * MINUTE);
      const count = await transaction.authRateEvent.count({
        where: {
          action: "magicLinkRedemption",
          sourceIpDigest,
          occurredAt: { gt: fifteenMinutesAgo },
        },
      });
      await this.prune(transaction, new Date(now.getTime() - DAY));
      const allowed = count < 10;
      if (allowed) {
        await transaction.authRateEvent.create({
          data: {
            action: "magicLinkRedemption",
            sourceIpDigest,
            occurredAt: now,
          },
        });
      }
      return { allowed, sourceIpDigest };
    });
  }

  /**
   * Gates an admin MFA challenge attempt (TOTP-or-recovery-code compare, from
   * both enroll-confirm and step-up verify) before the code is checked, so a
   * denied attempt never reaches the comparison (design §6/§8). There is no
   * dedicated admin-user column on `AuthRateEvent` — the acting admin's
   * `User.id` is carried in the `normalizedEmail` column, the same free-text
   * key `checkMagicLinkInitiation` uses for its own subject. Tighter than the
   * magic-link windows: guessing a 6-digit TOTP code rewards very few
   * attempts, so the short window is a strict lockout rather than a
   * generous allowance.
   */
  checkAdminMfaVerification(
    adminUserId: string,
    request: SourceAddressRequest,
  ): Promise<AuthRateLimitDecision> {
    const sourceIpDigest = this.crypto.digestSourceAddress(request.ip);
    return this.prisma.$transaction(async (transaction) => {
      const acquired = await this.tryAcquireLocks(transaction, [
        `admin-mfa-verification:user:${adminUserId}`,
        `admin-mfa-verification:ip:${sourceIpDigest}`,
      ]);
      if (!acquired) return { allowed: false, sourceIpDigest };

      const now = this.clock.now();
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * MINUTE);
      const oneDayAgo = new Date(now.getTime() - DAY);
      const [userShortCount, userDayCount, ipShortCount] = await Promise.all([
        transaction.authRateEvent.count({
          where: {
            action: "adminMfaVerification",
            normalizedEmail: adminUserId,
            occurredAt: { gt: fifteenMinutesAgo },
          },
        }),
        transaction.authRateEvent.count({
          where: {
            action: "adminMfaVerification",
            normalizedEmail: adminUserId,
            occurredAt: { gt: oneDayAgo },
          },
        }),
        transaction.authRateEvent.count({
          where: {
            action: "adminMfaVerification",
            sourceIpDigest,
            occurredAt: { gt: fifteenMinutesAgo },
          },
        }),
      ]);

      await this.prune(transaction, oneDayAgo);
      const allowed =
        userShortCount < 5 && userDayCount < 15 && ipShortCount < 20;
      if (allowed) {
        await transaction.authRateEvent.create({
          data: {
            action: "adminMfaVerification",
            normalizedEmail: adminUserId,
            sourceIpDigest,
            occurredAt: now,
          },
        });
      }

      return { allowed, sourceIpDigest };
    });
  }

  private async tryAcquireLocks(
    transaction: AuthRateTransaction,
    keys: readonly string[],
  ): Promise<boolean> {
    for (const key of [...keys].sort()) {
      const result = await transaction.$queryRawUnsafe(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) AS acquired",
        key,
      );
      if (!this.didAcquireLock(result)) return false;
    }
    return true;
  }

  private didAcquireLock(result: unknown): boolean {
    if (!Array.isArray(result) || result.length !== 1) return false;
    const row = result[0];
    return (
      typeof row === "object" &&
      row !== null &&
      "acquired" in row &&
      row.acquired === true
    );
  }

  private async prune(
    transaction: AuthRateTransaction,
    cutoff: Date,
  ): Promise<void> {
    await transaction.authRateEvent.deleteMany({
      where: { occurredAt: { lt: cutoff } },
    });
  }
}
