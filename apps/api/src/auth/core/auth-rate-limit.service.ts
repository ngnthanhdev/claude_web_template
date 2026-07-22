import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";
import { AuthCryptoService } from "./auth-crypto.service.js";
import { AUTH_CLOCK, type AuthClock } from "./auth-session.service.js";

type RateAction = "magicLinkInitiation" | "magicLinkRedemption";

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
    deleteMany(input: { where: { occurredAt: { lt: Date } } }): Promise<unknown>;
  };
}

export interface AuthRatePrisma {
  $transaction<T>(operation: (transaction: AuthRateTransaction) => Promise<T>): Promise<T>;
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
      await this.acquireLocks(transaction, [
        `initiation:email:${normalizedEmail}`,
        `initiation:ip:${sourceIpDigest}`,
      ]);

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

      await transaction.authRateEvent.create({
        data: {
          action: "magicLinkInitiation",
          normalizedEmail,
          sourceIpDigest,
          occurredAt: now,
        },
      });
      await this.prune(transaction, oneDayAgo);

      return {
        allowed: emailShortCount < 3 && emailDayCount < 10 && ipShortCount < 20,
        sourceIpDigest,
      };
    });
  }

  checkMagicLinkRedemption(
    request: SourceAddressRequest,
  ): Promise<AuthRateLimitDecision> {
    const sourceIpDigest = this.crypto.digestSourceAddress(request.ip);
    return this.prisma.$transaction(async (transaction) => {
      await this.acquireLocks(transaction, [`redemption:ip:${sourceIpDigest}`]);
      const now = this.clock.now();
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * MINUTE);
      const count = await transaction.authRateEvent.count({
        where: {
          action: "magicLinkRedemption",
          sourceIpDigest,
          occurredAt: { gt: fifteenMinutesAgo },
        },
      });
      await transaction.authRateEvent.create({
        data: {
          action: "magicLinkRedemption",
          sourceIpDigest,
          occurredAt: now,
        },
      });
      await this.prune(transaction, new Date(now.getTime() - DAY));
      return { allowed: count < 10, sourceIpDigest };
    });
  }

  private async acquireLocks(
    transaction: AuthRateTransaction,
    keys: readonly string[],
  ): Promise<void> {
    for (const key of [...keys].sort()) {
      await transaction.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))::text AS lock_result",
        key,
      );
    }
  }

  private async prune(transaction: AuthRateTransaction, cutoff: Date): Promise<void> {
    await transaction.authRateEvent.deleteMany({
      where: { occurredAt: { lt: cutoff } },
    });
  }
}
