import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";
import { AuthCryptoService } from "./auth-crypto.service.js";

export const AUTH_CLOCK = Symbol("AUTH_CLOCK");

export interface AuthClock {
  now(): Date;
}

export const systemAuthClock: AuthClock = {
  now: () => new Date(),
};

export interface StoredSession {
  id: string;
  userId: string;
  tokenHash: string;
  csrfHash: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  lastActivityAt: Date;
  lastRotatedAt: Date;
  revokedAt: Date | null;
  rotatedToId: string | null;
  createdAt: Date;
  user: { id: string; normalizedEmail: string };
}

interface SessionCreateData {
  userId: string;
  tokenHash: string;
  csrfHash: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  lastActivityAt: Date;
  lastRotatedAt: Date;
  createdAt: Date;
}

interface SessionUpdateWhere {
  id?: string | { in: string[] };
  userId?: string;
  revokedAt?: null;
}

interface SessionUpdateData {
  idleExpiresAt?: Date;
  lastActivityAt?: Date;
  revokedAt?: Date;
  rotatedToId?: string;
}

export interface AuthSessionTransaction {
  $queryRawUnsafe(query: string, parameter: string): Promise<unknown>;
  session: {
    create(input: { data: SessionCreateData; select: { id: true } }): Promise<{ id: string }>;
    findUnique(input: {
      where: { id: string } | { tokenHash: string };
      include: { user: { select: { id: true; normalizedEmail: true } } };
    }): Promise<StoredSession | null>;
    updateMany(input: {
      where: SessionUpdateWhere;
      data: SessionUpdateData;
    }): Promise<{ count: number }>;
  };
  authSecurityEvent: {
    create(input: {
      data: {
        kind:
          | "sessionCreated"
          | "sessionRotated"
          | "sessionRevoked"
          | "userSessionsRevoked";
        userId: string;
        sessionId?: string;
        occurredAt: Date;
      };
    }): Promise<unknown>;
  };
}

export interface AuthSessionPrisma {
  $transaction<T>(operation: (transaction: AuthSessionTransaction) => Promise<T>): Promise<T>;
}

export interface IssuedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

export interface ResolvedSession {
  readonly sessionId: string;
  readonly user: { readonly id: string; readonly email: string };
  readonly csrfToken: string;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly replacementSessionToken: string | null;
}

const DAY = 24 * 60 * 60_000;
const IDLE_LIFETIME = 30 * DAY;
const ABSOLUTE_LIFETIME = 90 * DAY;
const ROTATION_INTERVAL = DAY;

@Injectable()
export class AuthSessionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: AuthSessionPrisma,
    private readonly crypto: AuthCryptoService,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
  ) {}

  createSession(
    userId: string,
    transaction?: AuthSessionTransaction,
  ): Promise<IssuedSession> {
    if (transaction !== undefined) {
      return this.createSessionInTransaction(userId, transaction, this.clock.now());
    }
    return this.prisma.$transaction((currentTransaction) =>
      this.createSessionInTransaction(userId, currentTransaction, this.clock.now()),
    );
  }

  resolveSession(rawSessionToken: string): Promise<ResolvedSession | null> {
    const tokenHash = this.crypto.hashSessionToken(rawSessionToken);
    return this.prisma.$transaction(async (transaction) => {
      await this.acquireLock(transaction, `session-token:${tokenHash}`);
      const initial = await this.findByTokenHash(transaction, tokenHash);
      if (initial === null) return null;

      await this.acquireLock(transaction, `session-user:${initial.userId}`);
      const session = await this.findByTokenHash(transaction, tokenHash);
      if (session === null) return null;

      const now = this.clock.now();
      if (
        session.revokedAt !== null ||
        session.rotatedToId !== null ||
        session.idleExpiresAt.getTime() <= now.getTime() ||
        session.absoluteExpiresAt.getTime() <= now.getTime()
      ) {
        await this.revokeExpiredSession(transaction, session, now);
        return null;
      }

      if (now.getTime() - session.lastRotatedAt.getTime() >= ROTATION_INTERVAL) {
        return this.rotateSession(transaction, session, now);
      }

      const idleExpiresAt = this.nextIdleDeadline(now, session.absoluteExpiresAt);
      const updated = await transaction.session.updateMany({
        where: { id: session.id, userId: session.userId, revokedAt: null },
        data: { idleExpiresAt, lastActivityAt: now },
      });
      if (updated.count !== 1) return null;

      return {
        sessionId: session.id,
        user: { id: session.user.id, email: session.user.normalizedEmail },
        csrfToken: this.crypto.deriveCsrfToken(rawSessionToken),
        idleExpiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        replacementSessionToken: null,
      };
    });
  }

  verifyCsrf(
    rawSessionToken: string,
    presentedCsrfToken: string,
    storedCsrfHash: string,
  ): boolean {
    return this.crypto.verifyCsrfToken(
      rawSessionToken,
      presentedCsrfToken,
      storedCsrfHash,
    );
  }

  revokeCurrentSession(userId: string, sessionId: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      await this.acquireLock(transaction, `session-user:${userId}`);
      const session = await this.findById(transaction, sessionId);
      if (session === null || session.userId !== userId) return false;

      const ids = [session.id];
      if (session.rotatedToId !== null) ids.push(session.rotatedToId);
      const now = this.clock.now();
      const result = await transaction.session.updateMany({
        where: { id: { in: ids }, userId, revokedAt: null },
        data: { revokedAt: now },
      });
      if (result.count > 0) {
        await transaction.authSecurityEvent.create({
          data: { kind: "sessionRevoked", userId, sessionId, occurredAt: now },
        });
      }
      return result.count > 0;
    });
  }

  revokeAllSessions(userId: string): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      await this.acquireLock(transaction, `session-user:${userId}`);
      const now = this.clock.now();
      const result = await transaction.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      if (result.count > 0) {
        await transaction.authSecurityEvent.create({
          data: { kind: "userSessionsRevoked", userId, occurredAt: now },
        });
      }
      return result.count;
    });
  }

  private async createSessionInTransaction(
    userId: string,
    transaction: AuthSessionTransaction,
    now: Date,
    absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_LIFETIME),
  ): Promise<IssuedSession> {
    const sessionToken = this.crypto.generateOpaqueValue();
    const csrfToken = this.crypto.deriveCsrfToken(sessionToken);
    const idleExpiresAt = this.nextIdleDeadline(now, absoluteExpiresAt);
    const created = await transaction.session.create({
      data: {
        userId,
        tokenHash: this.crypto.hashSessionToken(sessionToken),
        csrfHash: this.crypto.hashCsrfToken(csrfToken),
        idleExpiresAt,
        absoluteExpiresAt,
        lastActivityAt: now,
        lastRotatedAt: now,
        createdAt: now,
      },
      select: { id: true },
    });
    await transaction.authSecurityEvent.create({
      data: {
        kind: "sessionCreated",
        userId,
        sessionId: created.id,
        occurredAt: now,
      },
    });
    return {
      sessionId: created.id,
      userId,
      sessionToken,
      csrfToken,
      idleExpiresAt,
      absoluteExpiresAt,
    };
  }

  private async rotateSession(
    transaction: AuthSessionTransaction,
    session: StoredSession,
    now: Date,
  ): Promise<ResolvedSession | null> {
    const replacement = await this.createSessionInTransaction(
      session.userId,
      transaction,
      now,
      session.absoluteExpiresAt,
    );
    const oldSession = await transaction.session.updateMany({
      where: { id: session.id, userId: session.userId, revokedAt: null },
      data: { revokedAt: now, rotatedToId: replacement.sessionId },
    });
    if (oldSession.count !== 1) {
      throw new Error("Session rotation lost its current-session lock");
    }
    await transaction.authSecurityEvent.create({
      data: {
        kind: "sessionRotated",
        userId: session.userId,
        sessionId: session.id,
        occurredAt: now,
      },
    });
    return {
      sessionId: replacement.sessionId,
      user: { id: session.user.id, email: session.user.normalizedEmail },
      csrfToken: replacement.csrfToken,
      idleExpiresAt: replacement.idleExpiresAt,
      absoluteExpiresAt: replacement.absoluteExpiresAt,
      replacementSessionToken: replacement.sessionToken,
    };
  }

  private async revokeExpiredSession(
    transaction: AuthSessionTransaction,
    session: StoredSession,
    now: Date,
  ): Promise<void> {
    if (session.revokedAt !== null) return;
    const result = await transaction.session.updateMany({
      where: { id: session.id, userId: session.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (result.count > 0) {
      await transaction.authSecurityEvent.create({
        data: {
          kind: "sessionRevoked",
          userId: session.userId,
          sessionId: session.id,
          occurredAt: now,
        },
      });
    }
  }

  private findByTokenHash(
    transaction: AuthSessionTransaction,
    tokenHash: string,
  ): Promise<StoredSession | null> {
    return transaction.session.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, normalizedEmail: true } } },
    });
  }

  private findById(
    transaction: AuthSessionTransaction,
    id: string,
  ): Promise<StoredSession | null> {
    return transaction.session.findUnique({
      where: { id },
      include: { user: { select: { id: true, normalizedEmail: true } } },
    });
  }

  private acquireLock(
    transaction: AuthSessionTransaction,
    key: string,
  ): Promise<unknown> {
    return transaction.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))::text AS lock_result",
      key,
    );
  }

  private nextIdleDeadline(now: Date, absoluteExpiresAt: Date): Date {
    return new Date(
      Math.min(now.getTime() + IDLE_LIFETIME, absoluteExpiresAt.getTime()),
    );
  }
}
