import { ConfigService } from "@nestjs/config";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { Env } from "../../config/env.js";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  setSessionCookie,
} from "./auth-cookie.js";
import {
  AuthCryptoService,
  type AuthRandomSource,
} from "./auth-crypto.service.js";
import {
  AuthRateLimitService,
  type AuthRatePrisma,
  type AuthRateTransaction,
} from "./auth-rate-limit.service.js";
import {
  AUTH_CLOCK,
  AuthSessionService,
  type AuthClock,
  type AuthSessionPrisma,
  type AuthSessionTransaction,
  type StoredSession,
} from "./auth-session.service.js";

const secret = (byte: string): string => Buffer.alloc(32, byte).toString("base64url");

function cryptoService(random: AuthRandomSource): AuthCryptoService {
  const config = new ConfigService<Env, true>({
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL: "postgresql://database.invalid/test",
    CORS_ORIGIN: "https://app.kitvera.test",
    PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
    CATALOGUE_CURSOR_SIGNING_SECRET: secret("a"),
    AUTH_MAGIC_LINK_HASH_SECRET: secret("b"),
    AUTH_SESSION_HASH_SECRET: secret("c"),
    AUTH_CSRF_HASH_SECRET: secret("d"),
    AUTH_SOURCE_IP_HASH_SECRET: secret("e"),
  });
  return new AuthCryptoService(config, random);
}

describe("AuthCryptoService", () => {
  it("emits canonical 256-bit opaque values and separates every hash domain", () => {
    const crypto = cryptoService({ bytes: () => Buffer.alloc(32, 7) });
    const bearer = crypto.generateOpaqueValue();

    expect(bearer).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set([
      crypto.hashMagicLinkToken(bearer),
      crypto.hashSessionToken(bearer),
      crypto.hashCsrfToken(bearer),
      crypto.digestSourceAddress(bearer),
    ]).size).toBe(4);
  });

  it("derives a session-bound CSRF value and verifies it in constant-time form", () => {
    const crypto = cryptoService({ bytes: () => Buffer.alloc(32, 9) });
    const firstSession = crypto.generateOpaqueValue();
    const secondSession = `${firstSession.slice(0, -1)}A`;
    const csrf = crypto.deriveCsrfToken(firstSession);
    const storedHash = crypto.hashCsrfToken(csrf);

    expect(csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(crypto.verifyCsrfToken(firstSession, csrf, storedHash)).toBe(true);
    expect(crypto.verifyCsrfToken(secondSession, csrf, storedHash)).toBe(false);
    expect(crypto.verifyCsrfToken(firstSession, `${csrf.slice(0, -1)}A`, storedHash)).toBe(false);
  });
});

describe("session cookie helpers", () => {
  it("sets and clears the exact __Host cookie scope", () => {
    const writes: Array<{ operation: string; name: string; value?: string; options: object }> = [];
    const reply = {
      setCookie: (name: string, value: string, options: object) => {
        writes.push({ operation: "set", name, value, options });
        return reply;
      },
      clearCookie: (name: string, options: object) => {
        writes.push({ operation: "clear", name, options });
        return reply;
      },
    };

    setSessionCookie(reply, "opaque-session");
    clearSessionCookie(reply);

    expect(SESSION_COOKIE_NAME).toBe("__Host-kitvera_session");
    expect(writes).toEqual([
      {
        operation: "set",
        name: SESSION_COOKIE_NAME,
        value: "opaque-session",
        options: { httpOnly: true, path: "/", sameSite: "lax", secure: true },
      },
      {
        operation: "clear",
        name: SESSION_COOKIE_NAME,
        options: { httpOnly: true, path: "/", sameSite: "lax", secure: true },
      },
    ]);
    expect(writes[0]?.options).not.toHaveProperty("domain");
  });
});

describe("database-backed authentication state", () => {
  class MutableClock implements AuthClock {
    constructor(private value: Date) {}
    now(): Date {
      return new Date(this.value);
    }
    advance(milliseconds: number): void {
      this.value = new Date(this.value.getTime() + milliseconds);
    }
  }

  type RateEvent = {
    action: "magicLinkInitiation" | "magicLinkRedemption";
    normalizedEmail?: string;
    sourceIpDigest: string;
    occurredAt: Date;
  };

  class MemoryRatePrisma implements AuthRatePrisma {
    readonly events: RateEvent[] = [];
    readonly locks: string[] = [];
    private queue: Promise<void> = Promise.resolve();

    async $transaction<T>(
      operation: (transaction: AuthRateTransaction) => Promise<T>,
    ): Promise<T> {
      let release = (): void => undefined;
      const previous = this.queue;
      this.queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const transaction = {
          $queryRawUnsafe: async (_query: string, parameter: string) => {
            this.locks.push(parameter);
            return 1;
          },
          authRateEvent: {
            count: async ({ where }) =>
              this.events.filter(
                (event) =>
                  event.action === where.action &&
                  (where.normalizedEmail === undefined ||
                    event.normalizedEmail === where.normalizedEmail) &&
                  (where.sourceIpDigest === undefined ||
                    event.sourceIpDigest === where.sourceIpDigest) &&
                  event.occurredAt > where.occurredAt.gt,
              ).length,
            create: async ({ data }) => {
              this.events.push(data);
              return data;
            },
            deleteMany: async ({ where }) => {
              const retained = this.events.filter(
                (event) => event.occurredAt >= where.occurredAt.lt,
              );
              this.events.splice(0, this.events.length, ...retained);
              return { count: 0 };
            },
          },
        } satisfies AuthRateTransaction;
        return await operation(transaction);
      } finally {
        release();
      }
    }
  }

  class MemorySessionPrisma implements AuthSessionPrisma {
    readonly sessions = new Map<string, StoredSession>();
    readonly events: object[] = [];
    private nextId = 1;
    private queue: Promise<void> = Promise.resolve();

    async $transaction<T>(
      operation: (transaction: AuthSessionTransaction) => Promise<T>,
    ): Promise<T> {
      let release = (): void => undefined;
      const previous = this.queue;
      this.queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await operation(this.transaction());
      } finally {
        release();
      }
    }

    private transaction(): AuthSessionTransaction {
      return {
        $queryRawUnsafe: async () => [{ pg_advisory_xact_lock: null }],
        session: {
          create: async ({ data }) => {
            const id = `00000000-0000-0000-0000-${String(this.nextId++).padStart(12, "0")}`;
            this.sessions.set(id, {
              id,
              ...data,
              revokedAt: null,
              rotatedToId: null,
              user: { id: data.userId, normalizedEmail: "buyer@example.com" },
            });
            return { id };
          },
          findUnique: async ({ where }) => {
            if ("id" in where) return this.sessions.get(where.id) ?? null;
            for (const session of this.sessions.values()) {
              if (session.tokenHash === where.tokenHash) return session;
            }
            return null;
          },
          updateMany: async ({ where, data }) => {
            let count = 0;
            for (const [id, session] of this.sessions) {
              const idMatches =
                where.id === undefined ||
                (typeof where.id === "string"
                  ? id === where.id
                  : where.id.in.includes(id));
              const matches =
                idMatches &&
                (where.userId === undefined || session.userId === where.userId) &&
                (where.revokedAt === undefined || session.revokedAt === null);
              if (!matches) continue;
              this.sessions.set(id, { ...session, ...data });
              count += 1;
            }
            return { count };
          },
        },
        authSecurityEvent: {
          create: async ({ data }) => {
            this.events.push(data);
            return data;
          },
        },
      };
    }
  }

  function sequentialCrypto(): AuthCryptoService {
    let byte = 0;
    return cryptoService({
      bytes: () => Buffer.alloc(32, (byte += 1)),
    });
  }

  it("serializes concurrent initiation and redemption windows at exact limits", async () => {
    const clock = new MutableClock(new Date("2026-07-22T00:00:00.000Z"));
    const prisma = new MemoryRatePrisma();
    const limiter = new AuthRateLimitService(prisma, sequentialCrypto(), clock);
    const request = { ip: "203.0.113.10", headers: { "x-forwarded-for": "198.51.100.2" } };

    const initiation = await Promise.all(
      Array.from({ length: 4 }, () =>
        limiter.checkMagicLinkInitiation("buyer@example.com", request),
      ),
    );
    expect(initiation.map(({ allowed }) => allowed)).toEqual([true, true, true, false]);
    expect(JSON.stringify(prisma.events)).not.toContain("203.0.113.10");
    expect(JSON.stringify(prisma.events)).not.toContain("198.51.100.2");

    clock.advance(15 * 60_000);
    await expect(
      limiter.checkMagicLinkInitiation("buyer@example.com", request),
    ).resolves.toMatchObject({ allowed: true });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      clock.advance(15 * 60_000);
      await expect(
        limiter.checkMagicLinkInitiation("buyer@example.com", request),
      ).resolves.toMatchObject({ allowed: true });
    }
    clock.advance(15 * 60_000);
    await expect(
      limiter.checkMagicLinkInitiation("buyer@example.com", request),
    ).resolves.toMatchObject({ allowed: false });

    const ipPrisma = new MemoryRatePrisma();
    const ipLimiter = new AuthRateLimitService(ipPrisma, sequentialCrypto(), clock);
    const ipDecisions = await Promise.all(
      Array.from({ length: 21 }, (_, index) =>
        ipLimiter.checkMagicLinkInitiation(`buyer-${index}@example.com`, request),
      ),
    );
    expect(ipDecisions.filter(({ allowed }) => allowed)).toHaveLength(20);
    expect(ipDecisions.at(-1)?.allowed).toBe(false);

    const redemptionPrisma = new MemoryRatePrisma();
    const redemptionLimiter = new AuthRateLimitService(
      redemptionPrisma,
      sequentialCrypto(),
      clock,
    );
    const redemption = await Promise.all(
      Array.from({ length: 11 }, () =>
        redemptionLimiter.checkMagicLinkRedemption(request),
      ),
    );
    expect(redemption.filter(({ allowed }) => allowed)).toHaveLength(10);
    expect(redemption.at(-1)?.allowed).toBe(false);
  });

  it("stores only hashes, rotates once at 24h, preserves absolute expiry, and rejects replay", async () => {
    const clock = new MutableClock(new Date("2026-07-22T00:00:00.000Z"));
    const prisma = new MemorySessionPrisma();
    const sessions = new AuthSessionService(prisma, sequentialCrypto(), clock);
    const issued = await sessions.createSession("00000000-0000-0000-0000-000000000123");

    expect(JSON.stringify([...prisma.sessions.values()])).not.toContain(issued.sessionToken);
    expect(JSON.stringify([...prisma.sessions.values()])).not.toContain(issued.csrfToken);
    await expect(sessions.resolveSession(issued.sessionToken)).resolves.toMatchObject({
      replacementSessionToken: null,
    });

    clock.advance(24 * 60 * 60_000);
    const concurrentRotation = await Promise.all([
      sessions.resolveSession(issued.sessionToken),
      sessions.resolveSession(issued.sessionToken),
    ]);
    const rotated = concurrentRotation.find((session) => session !== null);
    expect(concurrentRotation.filter((session) => session !== null)).toHaveLength(1);
    expect(rotated?.replacementSessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rotated?.absoluteExpiresAt).toEqual(issued.absoluteExpiresAt);
    await expect(sessions.resolveSession(issued.sessionToken)).resolves.toBeNull();
    await expect(
      sessions.resolveSession(rotated?.replacementSessionToken ?? "missing"),
    ).resolves.toMatchObject({ replacementSessionToken: null });
  });

  it("enforces idle expiry and atomic current-only versus user-wide revocation", async () => {
    const clock = new MutableClock(new Date("2026-07-22T00:00:00.000Z"));
    const prisma = new MemorySessionPrisma();
    const sessions = new AuthSessionService(prisma, sequentialCrypto(), clock);
    const userId = "00000000-0000-0000-0000-000000000123";
    const first = await sessions.createSession(userId);
    const second = await sessions.createSession(userId);

    await expect(sessions.revokeCurrentSession(userId, first.sessionId)).resolves.toBe(true);
    await expect(sessions.resolveSession(first.sessionToken)).resolves.toBeNull();
    await expect(sessions.resolveSession(second.sessionToken)).resolves.not.toBeNull();
    await expect(sessions.revokeAllSessions(userId)).resolves.toBe(1);
    await expect(sessions.resolveSession(second.sessionToken)).resolves.toBeNull();

    const expiring = await sessions.createSession(userId);
    clock.advance(30 * 24 * 60 * 60_000);
    await expect(sessions.resolveSession(expiring.sessionToken)).resolves.toBeNull();
  });

  it("keeps the core interfaces strict", () => {
    expect(AuthRateLimitService).toBeTypeOf("function");
    expect(AuthSessionService).toBeTypeOf("function");
    expect(AUTH_CLOCK).toBeTypeOf("symbol");
    expectTypeOf<AuthRatePrisma>().toBeObject();
    expectTypeOf<AuthSessionPrisma>().toBeObject();
  });
});
