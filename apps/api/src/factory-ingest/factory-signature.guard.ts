import { createHmac, timingSafeEqual } from "node:crypto";

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";

import type { Env } from "../config/env.js";

/**
 * Exact field order the factory must serialize before signing (design
 * §2/§4/§6). Deliberately excludes `signature` itself — that field carries
 * the HMAC computed over this canonical form, so it can never be part of
 * what it signs. Kept in the request DTO's own field order
 * (`packages/shared/src/seller.ts#factoryArtifactIngestRequestSchema`) so a
 * factory implementation can serialize straight from the parsed request
 * object.
 */
const CANONICAL_FIELDS = [
  "productId",
  "version",
  "storageId",
  "checksum",
  "sizeBytes",
  "producedAt",
  "factoryRunId",
  "qaVerdict",
  "scanVerdict",
] as const;

/**
 * Builds the canonical JSON string the factory signs over. Returns `null`
 * when the raw body is missing one of the signed fields, so the guard can
 * fail closed without ever throwing on attacker-controlled input.
 */
export function canonicalFactoryIngestPayload(
  body: Record<string, unknown>,
): string | null {
  const canonical: Record<string, unknown> = {};
  for (const field of CANONICAL_FIELDS) {
    const value = body[field];
    if (value === undefined) return null;
    canonical[field] = value;
  }
  return JSON.stringify(canonical);
}

/** HMAC-SHA256 over the canonical payload, base64url-encoded. */
export function signFactoryIngestPayload(
  secret: Buffer,
  canonicalPayload: string,
): string {
  return createHmac("sha256", secret)
    .update(canonicalPayload)
    .digest("base64url");
}

/**
 * Server-to-server guard for `POST /v1/factory/artifacts` (design §2/§4/§6
 * "Factory -> API signed-artifact ingest"). Verifies the request body's own
 * `signature` field against an HMAC computed over the rest of the payload
 * using `FACTORY_INGEST_HMAC_SECRET`, with a constant-time comparison so a
 * timing side-channel can never leak the expected signature. Never session
 * or seller guarded — this route has no browser-facing caller. The secret
 * and the submitted signature are never logged: this guard only ever throws
 * a fixed, generic message, never one built from the raw signature or
 * secret bytes.
 */
@Injectable()
export class FactorySignatureGuard implements CanActivate {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Env, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const body = request.body;
    if (typeof body !== "object" || body === null) {
      throw this.invalidSignature();
    }

    const record = body as Record<string, unknown>;
    const signature = record.signature;
    if (typeof signature !== "string" || signature.length === 0) {
      throw this.invalidSignature();
    }

    const canonicalPayload = canonicalFactoryIngestPayload(record);
    if (canonicalPayload === null) {
      throw this.invalidSignature();
    }

    const secret = Buffer.from(
      this.config.getOrThrow<string>("FACTORY_INGEST_HMAC_SECRET"),
      "base64url",
    );
    const expected = Buffer.from(
      signFactoryIngestPayload(secret, canonicalPayload),
      "utf8",
    );
    const received = Buffer.from(signature, "utf8");

    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw this.invalidSignature();
    }

    return true;
  }

  private invalidSignature(): UnauthorizedException {
    return new UnauthorizedException("Invalid factory signature");
  }
}
