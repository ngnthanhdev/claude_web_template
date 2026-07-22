import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../config/env.js";

export const AUTH_RANDOM_SOURCE = Symbol("AUTH_RANDOM_SOURCE");

export interface AuthRandomSource {
  bytes(size: number): Buffer;
}

export const systemAuthRandomSource: AuthRandomSource = {
  bytes: randomBytes,
};

type HashSecretName =
  | "AUTH_MAGIC_LINK_HASH_SECRET"
  | "AUTH_SESSION_HASH_SECRET"
  | "AUTH_CSRF_HASH_SECRET"
  | "AUTH_SOURCE_IP_HASH_SECRET";

@Injectable()
export class AuthCryptoService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(AUTH_RANDOM_SOURCE) private readonly random: AuthRandomSource,
  ) {}

  generateOpaqueValue(): string {
    return this.random.bytes(32).toString("base64url");
  }

  hashMagicLinkToken(rawToken: string): string {
    return this.hmac("AUTH_MAGIC_LINK_HASH_SECRET", "magic-link-token", rawToken);
  }

  hashSessionToken(rawToken: string): string {
    return this.hmac("AUTH_SESSION_HASH_SECRET", "session-token", rawToken);
  }

  deriveCsrfToken(rawSessionToken: string): string {
    return this.hmac("AUTH_CSRF_HASH_SECRET", "csrf-value", rawSessionToken);
  }

  hashCsrfToken(rawCsrfToken: string): string {
    return this.hmac("AUTH_CSRF_HASH_SECRET", "csrf-verifier", rawCsrfToken);
  }

  digestSourceAddress(sourceAddress: string): string {
    return this.hmac(
      "AUTH_SOURCE_IP_HASH_SECRET",
      "source-address",
      sourceAddress,
    );
  }

  verifyCsrfToken(
    rawSessionToken: string,
    presentedCsrfToken: string,
    storedCsrfHash: string,
  ): boolean {
    const derivedToken = this.deriveCsrfToken(rawSessionToken);
    const presentedMatches = this.constantTimeEqual(derivedToken, presentedCsrfToken);
    const presentedHash = this.hashCsrfToken(presentedCsrfToken);
    const storedMatches = this.constantTimeEqual(presentedHash, storedCsrfHash);
    return presentedMatches && storedMatches;
  }

  private hmac(secretName: HashSecretName, domain: string, value: string): string {
    const secret = Buffer.from(this.config.getOrThrow<string>(secretName), "base64url");
    return createHmac("sha256", secret)
      .update(`kitvera:v1:${domain}\0`, "utf8")
      .update(value, "utf8")
      .digest("base64url");
  }

  private constantTimeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "utf8");
    const rightBuffer = Buffer.from(right, "utf8");
    const comparableRight =
      rightBuffer.length === leftBuffer.length
        ? rightBuffer
        : Buffer.alloc(leftBuffer.length);
    const equal = timingSafeEqual(leftBuffer, comparableRight);
    return equal && rightBuffer.length === leftBuffer.length;
  }
}
