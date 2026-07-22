import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  MagicLinkInitiationRequest,
  MagicLinkInitiationResponse,
  MagicLinkRedemptionRequest,
  MagicLinkRedemptionResponse,
} from "@marketplace/shared/auth";
import type { Prisma } from "@prisma/client";

import { ApiHttpException } from "../../common/errors/api-http.exception.js";
import type { Env } from "../../config/env.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuthCryptoService } from "../core/auth-crypto.service.js";
import {
  AuthRateLimitService,
  type SourceAddressRequest,
} from "../core/auth-rate-limit.service.js";
import { AuthSessionService } from "../core/auth-session.service.js";
import {
  EMAIL_DELIVERY_PORT,
  type EmailDeliveryPort,
} from "./email-delivery.port.js";

const ACCEPTED_RESPONSE = { status: "accepted" } as const;
const MAGIC_LINK_LIFETIME_MS = 15 * 60_000;
const MAGIC_LINK_LOCK_SQL =
  "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))::text AS lock_result";

class InvalidMagicLinkError extends Error {}

export interface MagicLinkRedemptionResult {
  readonly response: MagicLinkRedemptionResponse;
  readonly sessionToken: string;
}

@Injectable()
export class MagicLinksService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuthCryptoService)
    private readonly crypto: AuthCryptoService,
    @Inject(AuthRateLimitService)
    private readonly rateLimit: AuthRateLimitService,
    @Inject(AuthSessionService)
    private readonly sessions: AuthSessionService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Env, true>,
    @Inject(EMAIL_DELIVERY_PORT)
    private readonly emailDelivery: EmailDeliveryPort,
  ) {}

  async initiate(
    input: MagicLinkInitiationRequest,
    source: SourceAddressRequest,
  ): Promise<MagicLinkInitiationResponse> {
    const decision = await this.rateLimit.checkMagicLinkInitiation(
      input.email,
      source,
    );
    if (!decision.allowed) return ACCEPTED_RESPONSE;

    const rawToken = this.crypto.generateOpaqueValue();
    const tokenHash = this.crypto.hashMagicLinkToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MAGIC_LINK_LIFETIME_MS);
    const tokenId = await this.prisma.$transaction(async (transaction) => {
      await this.acquireLock(transaction, `magic-link-email:${input.email}`);
      const revoked = await transaction.magicLinkToken.updateMany({
        where: {
          normalizedEmail: input.email,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      if (revoked.count > 0) {
        await transaction.authSecurityEvent.create({
          data: {
            kind: "magicLinkRevoked",
            sourceIpDigest: decision.sourceIpDigest,
            occurredAt: now,
          },
        });
      }
      const token = await transaction.magicLinkToken.create({
        data: {
          normalizedEmail: input.email,
          locale: input.locale,
          returnTo: input.returnTo,
          tokenHash,
          expiresAt,
          createdAt: now,
        },
        select: { id: true },
      });
      return token.id;
    });

    const publicOrigin = this.config.getOrThrow<string>("PUBLIC_WEB_ORIGIN");
    const link = `${publicOrigin}/${input.locale}/auth/magic-link#token=${rawToken}`;
    try {
      const outcome = await this.emailDelivery.sendMagicLink({
        email: input.email,
        locale: input.locale,
        link,
      });
      if (outcome.status === "delivered") {
        await this.prisma.authSecurityEvent.create({
          data: {
            kind: "magicLinkIssueSucceeded",
            sourceIpDigest: decision.sourceIpDigest,
            occurredAt: new Date(),
          },
        });
      } else {
        await this.failIssuedToken(tokenId, decision.sourceIpDigest);
      }
    } catch {
      await this.failIssuedToken(tokenId, decision.sourceIpDigest);
    }

    return ACCEPTED_RESPONSE;
  }

  async redeem(
    input: MagicLinkRedemptionRequest,
    source: SourceAddressRequest,
  ): Promise<MagicLinkRedemptionResult> {
    const decision = await this.rateLimit.checkMagicLinkRedemption(source);
    if (!decision.allowed) {
      await this.recordRedemptionFailure(decision.sourceIpDigest);
      throw this.invalidMagicLink();
    }

    const tokenHash = this.crypto.hashMagicLinkToken(input.token);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.acquireLock(transaction, `magic-link-token:${tokenHash}`);
        const initial = await transaction.magicLinkToken.findUnique({
          where: { tokenHash },
        });
        if (initial === null) throw new InvalidMagicLinkError();

        await this.acquireLock(
          transaction,
          `magic-link-email:${initial.normalizedEmail}`,
        );
        const token = await transaction.magicLinkToken.findUnique({
          where: { id: initial.id },
        });
        const now = new Date();
        if (
          token === null ||
          token.consumedAt !== null ||
          token.revokedAt !== null ||
          token.expiresAt.getTime() <= now.getTime()
        ) {
          throw new InvalidMagicLinkError();
        }

        const user = await transaction.user.upsert({
          where: { normalizedEmail: token.normalizedEmail },
          create: { normalizedEmail: token.normalizedEmail },
          update: {},
          select: { id: true, normalizedEmail: true },
        });
        const consumed = await transaction.magicLinkToken.updateMany({
          where: {
            id: token.id,
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { userId: user.id, consumedAt: now },
        });
        if (consumed.count !== 1) throw new InvalidMagicLinkError();

        const session = await this.sessions.createSession(user.id, transaction);
        await transaction.authSecurityEvent.create({
          data: {
            kind: "magicLinkRedemptionSucceeded",
            userId: user.id,
            sessionId: session.sessionId,
            sourceIpDigest: decision.sourceIpDigest,
            occurredAt: now,
          },
        });
        return {
          sessionToken: session.sessionToken,
          response: {
            user: { id: user.id, email: user.normalizedEmail },
            session: {
              id: session.sessionId,
              expiresAt: session.idleExpiresAt.toISOString(),
            },
            csrfToken: session.csrfToken,
            returnTo: token.returnTo,
          },
        } satisfies MagicLinkRedemptionResult;
      });
    } catch (error: unknown) {
      if (!(error instanceof InvalidMagicLinkError)) throw error;
      await this.recordRedemptionFailure(decision.sourceIpDigest);
      throw this.invalidMagicLink();
    }
  }

  private async failIssuedToken(
    tokenId: string,
    sourceIpDigest: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.magicLinkToken.updateMany({
        where: { id: tokenId, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.authSecurityEvent.create({
        data: {
          kind: "magicLinkIssueFailed",
          sourceIpDigest,
          occurredAt: now,
        },
      });
    });
  }

  private recordRedemptionFailure(sourceIpDigest: string): Promise<unknown> {
    return this.prisma.authSecurityEvent.create({
      data: {
        kind: "magicLinkRedemptionFailed",
        sourceIpDigest,
        occurredAt: new Date(),
      },
    });
  }

  private acquireLock(
    transaction: Prisma.TransactionClient,
    key: string,
  ): Promise<unknown> {
    return transaction.$queryRawUnsafe(MAGIC_LINK_LOCK_SQL, key);
  }

  private invalidMagicLink(): ApiHttpException {
    return new ApiHttpException(
      HttpStatus.UNAUTHORIZED,
      "MAGIC_LINK_INVALID_OR_EXPIRED",
    );
  }
}
