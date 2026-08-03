import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * TOTP (RFC 6238, over HOTP/RFC 4226) and the admin-MFA envelope-encryption /
 * recovery-code helpers, kept dependency-free (no otplib/speakeasy) — only
 * `node:crypto`. Every comparison here is constant-time (mirrors
 * `AuthCryptoService#constantTimeEqual`'s pattern); nothing here ever logs a
 * secret, code, or recovery code.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
/** 160-bit shared secret — RFC 4226's recommended minimum, and what every
 * mainstream authenticator app (Google/Microsoft/Authy) expects. */
const TOTP_SECRET_BYTES = 20;
/** +/-1 step (~30s either side) of clock-skew tolerance — small enough that
 * it does not meaningfully widen the brute-force window, generous enough to
 * absorb ordinary clock drift between the admin's device and the server. */
const DEFAULT_VERIFICATION_WINDOW_STEPS = 1;

const RECOVERY_CODE_BYTES = 10;
const GCM_ALGORITHM = "aes-256-gcm";
const GCM_IV_BYTES = 12;

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  const comparableRight =
    rightBuffer.length === leftBuffer.length
      ? rightBuffer
      : Buffer.alloc(leftBuffer.length);
  const equal = timingSafeEqual(leftBuffer, comparableRight);
  return equal && rightBuffer.length === leftBuffer.length;
}

export function generateTotpSecret(): Buffer {
  return randomBytes(TOTP_SECRET_BYTES);
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

export function base32Decode(encoded: string): Buffer {
  const normalized = encoded.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 character in TOTP secret");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export interface OtpauthUriParams {
  readonly issuer: string;
  readonly accountName: string;
  readonly secret: Buffer;
}

/**
 * Builds the standard `otpauth://totp/...` provisioning URI (Google
 * Authenticator / Key URI Format) shown once at enrollment start.
 */
export function buildOtpauthUri(params: OtpauthUriParams): string {
  const label = `${params.issuer}:${params.accountName}`;
  const query = new URLSearchParams({
    secret: base32Encode(params.secret),
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const truncated =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);
  return (truncated % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

/** Exposed for tests that need a currently-valid code without depending on
 * an external authenticator implementation. */
export function generateTotpCode(
  secret: Buffer,
  at: Date = new Date(),
): string {
  const counter = Math.floor(at.getTime() / 1000 / TOTP_STEP_SECONDS);
  return hotp(secret, counter);
}

/**
 * Constant-time TOTP verification across a small step window. Rejects
 * anything that isn't exactly 6 digits before ever touching the secret.
 */
export function verifyTotpCode(
  secret: Buffer,
  code: string,
  at: Date = new Date(),
  windowSteps: number = DEFAULT_VERIFICATION_WINDOW_STEPS,
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(at.getTime() / 1000 / TOTP_STEP_SECONDS);
  let matched = false;
  for (let delta = -windowSteps; delta <= windowSteps; delta += 1) {
    const candidate = hotp(secret, counter + delta);
    // Every candidate in the window is compared (no early return) so the
    // number of matching steps cannot be inferred from timing.
    if (constantTimeEqual(candidate, code)) matched = true;
  }
  return matched;
}

/**
 * AES-256-GCM envelope encryption for `AdminMfaFactor.encryptedSecret`
 * (design §6) — encryption, not hashing, because verification needs the
 * plaintext secret back. `key` must be exactly 32 bytes (the decoded
 * `ADMIN_MFA_SECRET_ENCRYPTION_KEY`). Stored form is
 * `<iv>.<authTag>.<ciphertext>`, each segment base64url — never the
 * plaintext secret.
 */
export function encryptTotpSecret(key: Buffer, secret: Buffer): string {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv(GCM_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptTotpSecret(key: Buffer, encoded: string): Buffer {
  const [ivPart, authTagPart, ciphertextPart] = encoded.split(".");
  if (
    ivPart === undefined ||
    authTagPart === undefined ||
    ciphertextPart === undefined
  ) {
    throw new Error("Malformed encrypted TOTP secret");
  }
  const decipher = createDecipheriv(
    GCM_ALGORITHM,
    key,
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]);
}

/**
 * Generates `count` one-time recovery codes (design §6) — high-entropy
 * (80-bit) random tokens, base32 for unambiguous manual transcription,
 * formatted as two dashed groups for readability. Returned in plaintext
 * exactly once by the caller; never stored or logged in this form.
 */
export function generateRecoveryCodes(count: number): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(RECOVERY_CODE_BYTES));
    return `${raw.slice(0, 8)}-${raw.slice(8)}`;
  });
}

/**
 * One-way hash of a recovery code at rest. Plain `sha256` (not a keyed HMAC)
 * is sufficient here — unlike a user-chosen password, a recovery code is a
 * server-generated 80-bit random token, so it is not subject to a
 * dictionary/rainbow-table attack the way a low-entropy secret would be.
 */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("base64url");
}
