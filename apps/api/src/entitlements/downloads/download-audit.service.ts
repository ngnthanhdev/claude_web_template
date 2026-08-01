import { Inject, Injectable } from "@nestjs/common";

import {
  AUTH_CLOCK,
  type AuthClock,
} from "../../auth/core/auth-session.service.js";
import { AuthCryptoService } from "../../auth/core/auth-crypto.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

const WINDOW_MS = 15 * 60_000;
const MAX_ISSUANCES_PER_WINDOW = 20;

interface DownloadEventWhere {
  entitlementId: string;
  issuedAt: { gt: Date };
}

export interface DownloadAuditTransaction {
  $queryRawUnsafe(query: string, parameter: string): Promise<unknown>;
  downloadEvent: {
    count(input: { where: DownloadEventWhere }): Promise<number>;
    create(input: {
      data: {
        entitlementId: string;
        userId: string;
        productId: string;
        version: string;
        issuedAt: Date;
        sourceIpDigest: string;
      };
    }): Promise<unknown>;
  };
}

export interface DownloadAuditPrisma {
  $transaction<T>(
    operation: (transaction: DownloadAuditTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface DownloadIssuanceRequest {
  readonly userId: string;
  readonly entitlementId: string;
  readonly productId: string;
  readonly version: string;
  readonly ip: string;
}

export interface DownloadIssuanceDecision {
  readonly allowed: boolean;
}

/**
 * Atomically rate-limits and audits download issuance (design §9 "Download /
 * DoS" and "DownloadEvent / Repudiation"): counts recent `DownloadEvent` rows
 * for the entitlement inside a Postgres advisory-locked transaction and, only
 * when under the per-entitlement window limit, writes exactly one append-only
 * `DownloadEvent` — the same row that both records the audit trail and caps
 * future issuance. `sourceIpDigest` reuses the auth core's keyed HMAC source
 * -address digest, never a raw or unkeyed hash of the IP.
 */
@Injectable()
export class DownloadAuditService {
  constructor(
    @Inject(PrismaService) private readonly prisma: DownloadAuditPrisma,
    @Inject(AuthCryptoService) private readonly crypto: AuthCryptoService,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
  ) {}

  recordIssuance(
    request: DownloadIssuanceRequest,
  ): Promise<DownloadIssuanceDecision> {
    const sourceIpDigest = this.crypto.digestSourceAddress(request.ip);
    return this.prisma.$transaction(async (transaction) => {
      const acquired = await this.tryAcquireLock(
        transaction,
        `download:entitlement:${request.entitlementId}`,
      );
      if (!acquired) return { allowed: false };

      const now = this.clock.now();
      const windowStart = new Date(now.getTime() - WINDOW_MS);
      const count = await transaction.downloadEvent.count({
        where: {
          entitlementId: request.entitlementId,
          issuedAt: { gt: windowStart },
        },
      });
      const allowed = count < MAX_ISSUANCES_PER_WINDOW;
      if (allowed) {
        await transaction.downloadEvent.create({
          data: {
            entitlementId: request.entitlementId,
            userId: request.userId,
            productId: request.productId,
            version: request.version,
            issuedAt: now,
            sourceIpDigest,
          },
        });
      }

      return { allowed };
    });
  }

  private async tryAcquireLock(
    transaction: DownloadAuditTransaction,
    key: string,
  ): Promise<boolean> {
    const result = await transaction.$queryRawUnsafe(
      "SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) AS acquired",
      key,
    );
    return this.didAcquireLock(result);
  }

  private didAcquireLock(result: unknown): boolean {
    if (!Array.isArray(result) || result.length !== 1) return false;
    const row: unknown = result[0];
    return (
      typeof row === "object" &&
      row !== null &&
      "acquired" in row &&
      row.acquired === true
    );
  }
}
