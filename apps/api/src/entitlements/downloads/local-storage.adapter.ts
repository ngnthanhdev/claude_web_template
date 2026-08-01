import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, type ReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { NotFoundException } from "@nestjs/common";

import type { Env } from "../../config/env.js";
import type {
  DownloadEntitlement,
  DownloadProduct,
  IssuedDownload,
  StoragePort,
} from "./storage.port.js";

const TOKEN_TTL_MS = 5 * 60_000;

/**
 * Path the web app's same-origin proxy forwards to the API's `/v1/*` routes
 * (see `apps/web/src/app/api/[...proxy]/route.ts` and `apiProxyBasePath`).
 * The dev/CI adapter returns a browser-relative URL under this prefix so the
 * signed link can be opened directly without ever exposing the real API
 * origin to the client.
 */
const DOWNLOAD_URL_PATH_PREFIX = "/api/v1/downloads/token";

interface IssuedTokenRecord {
  readonly entitlementId: string;
  readonly objectKey: string;
  readonly expiresAtMs: number;
  consumed: boolean;
}

export interface VerifiedDownloadToken {
  readonly entitlementId: string;
  readonly objectKey: string;
}

/**
 * Dev/CI-only {@link StoragePort} adapter. Streams artifacts from a private
 * local directory behind a signed, short-TTL, single-use HMAC token minted as
 * an app route (never a raw filesystem path).
 *
 * The token itself is only a short random reference id plus its HMAC
 * signature (`<refId>.<signature>`, well under Fastify's default route
 * `maxParamLength`) — the entitlement/object-key/expiry it grants access to
 * is kept server-side in {@link issued}, exactly like the single-use
 * consumption state. Both are in-memory: acceptable for a single-process
 * dev/CI adapter that is explicitly not the production storage decision
 * (§8/§10 — go-live blocker).
 */
export class LocalStorageAdapter implements StoragePort {
  private readonly secret: Buffer;
  private readonly issued = new Map<string, IssuedTokenRecord>();

  constructor(
    private readonly artifactsDir: string,
    hmacSecret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.secret = Buffer.from(hmacSecret, "base64url");
  }

  async issueDownload(
    entitlement: DownloadEntitlement,
    product: DownloadProduct,
    version: string,
  ): Promise<IssuedDownload> {
    const objectKey = `${product.id}/${version}`;
    await this.assertArtifactExists(objectKey);

    this.pruneExpired();
    const expiresAt = new Date(this.now().getTime() + TOKEN_TTL_MS);
    const refId = randomBytes(16).toString("base64url");
    this.issued.set(refId, {
      entitlementId: entitlement.id,
      objectKey,
      expiresAtMs: expiresAt.getTime(),
      consumed: false,
    });

    const token = `v1.${refId}.${this.sign(refId)}`;
    return { url: `${DOWNLOAD_URL_PATH_PREFIX}/${token}`, expiresAt };
  }

  /**
   * Verifies signature, TTL, and single-use, then atomically consumes the
   * token. Returns `null` on any failure (never distinguishes the reason to
   * the caller) and never logs the raw token.
   */
  async consume(token: string): Promise<VerifiedDownloadToken | null> {
    this.pruneExpired();
    const refId = this.verifySignature(token);
    if (refId === null) return null;

    const record = this.issued.get(refId);
    if (record === undefined || record.consumed) return null;
    if (record.expiresAtMs <= this.now().getTime()) return null;

    try {
      await this.assertArtifactExists(record.objectKey);
    } catch {
      return null;
    }

    record.consumed = true;
    return { entitlementId: record.entitlementId, objectKey: record.objectKey };
  }

  fileStream(objectKey: string): ReadStream {
    return createReadStream(this.resolveArtifactPath(objectKey));
  }

  private async assertArtifactExists(objectKey: string): Promise<void> {
    const filePath = this.resolveArtifactPath(objectKey);
    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) throw new Error("not a file");
    } catch {
      throw new NotFoundException("Download artifact not found");
    }
  }

  private resolveArtifactPath(objectKey: string): string {
    if (
      objectKey.length === 0 ||
      objectKey.includes("..") ||
      objectKey.startsWith("/")
    ) {
      throw new NotFoundException("Download artifact not found");
    }
    const root = resolve(this.artifactsDir);
    const candidate = resolve(root, objectKey);
    if (candidate !== root && !candidate.startsWith(root + sep)) {
      throw new NotFoundException("Download artifact not found");
    }
    return candidate;
  }

  /** Returns the token's `refId` only once its signature verifies. */
  private verifySignature(token: string): string | null {
    if (token.length > 200) return null;
    const [prefix, refId, signature, extra] = token.split(".");
    if (
      prefix !== "v1" ||
      refId === undefined ||
      signature === undefined ||
      extra !== undefined ||
      !/^[A-Za-z0-9_-]+$/.test(refId) ||
      !/^[A-Za-z0-9_-]+$/.test(signature)
    ) {
      return null;
    }

    const expected = Buffer.from(this.sign(refId), "utf8");
    const received = Buffer.from(signature, "utf8");
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      return null;
    }
    return refId;
  }

  private sign(refId: string): string {
    return createHmac("sha256", this.secret).update(refId).digest("base64url");
  }

  private pruneExpired(): void {
    const now = this.now().getTime();
    for (const [refId, record] of this.issued) {
      if (record.consumed || record.expiresAtMs <= now)
        this.issued.delete(refId);
    }
  }
}

export interface StoragePortResolution {
  readonly nodeEnv: Env["NODE_ENV"];
  readonly localAdapter: LocalStorageAdapter;
}

/**
 * Chooses the active {@link StoragePort}. Outside production this is always
 * the local dev/CI adapter. In production, no real adapter is wired yet
 * (go-live storage-provider decision, §8/§10), so issuance fails closed
 * instead of ever reusing the dev filesystem adapter in production — while
 * still letting the rest of the entitlements module (e.g. library reads)
 * start normally.
 */
export function resolveStoragePort(
  resolution: StoragePortResolution,
): StoragePort {
  if (resolution.nodeEnv === "production") {
    return {
      issueDownload(): Promise<IssuedDownload> {
        throw new NotFoundException("Download storage is not configured");
      },
    };
  }
  return resolution.localAdapter;
}
