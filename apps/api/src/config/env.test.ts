import { describe, expect, it } from "vitest";

import { validateEnv } from "./env.js";

const secret = (byte: string): string =>
  Buffer.alloc(32, byte).toString("base64url");

function validEnvironment(): Record<string, unknown> {
  return {
    NODE_ENV: "test",
    PORT: "3000",
    DATABASE_URL: "postgresql://database.invalid/kitvera_test",
    CORS_ORIGIN: "https://app.kitvera.test",
    PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
    CATALOGUE_CURSOR_SIGNING_SECRET: secret("a"),
    AUTH_MAGIC_LINK_HASH_SECRET: secret("b"),
    AUTH_SESSION_HASH_SECRET: secret("c"),
    AUTH_CSRF_HASH_SECRET: secret("d"),
    AUTH_SOURCE_IP_HASH_SECRET: secret("e"),
    DOWNLOAD_TOKEN_HMAC_SECRET: secret("f"),
    FACTORY_INGEST_HMAC_SECRET: secret("g"),
    LOCAL_ARTIFACT_STORAGE_DIR: "/tmp/kitvera-test-artifacts",
    ADMIN_MFA_SECRET_ENCRYPTION_KEY: secret("h"),
  };
}

describe("environment validation", () => {
  it("accepts explicit independent 256-bit secrets and an HTTPS public origin", () => {
    const environment = validateEnv(validEnvironment());

    expect(environment.PUBLIC_WEB_ORIGIN).toBe("https://app.kitvera.test");
    expect(environment.AUTH_SESSION_HASH_SECRET).not.toBe(
      environment.AUTH_CSRF_HASH_SECRET,
    );
  });

  it.each([
    "CATALOGUE_CURSOR_SIGNING_SECRET",
    "AUTH_MAGIC_LINK_HASH_SECRET",
    "AUTH_SESSION_HASH_SECRET",
    "AUTH_CSRF_HASH_SECRET",
    "AUTH_SOURCE_IP_HASH_SECRET",
    "DOWNLOAD_TOKEN_HMAC_SECRET",
    "FACTORY_INGEST_HMAC_SECRET",
    "LOCAL_ARTIFACT_STORAGE_DIR",
    "PUBLIC_WEB_ORIGIN",
    "ADMIN_MFA_SECRET_ENCRYPTION_KEY",
  ])("rejects a missing %s", (name) => {
    const environment = validEnvironment();
    delete environment[name];

    expect(() => validateEnv(environment)).toThrow();
  });

  it("rejects short, non-canonical, or reused secrets", () => {
    expect(() =>
      validateEnv({
        ...validEnvironment(),
        AUTH_SESSION_HASH_SECRET: "not-256-bits",
      }),
    ).toThrow();

    const environment = validEnvironment();
    environment.AUTH_CSRF_HASH_SECRET = environment.AUTH_SESSION_HASH_SECRET;
    expect(() => validateEnv(environment)).toThrow(/independent/i);

    const reusedDownloadSecret = validEnvironment();
    reusedDownloadSecret.DOWNLOAD_TOKEN_HMAC_SECRET =
      reusedDownloadSecret.AUTH_SESSION_HASH_SECRET;
    expect(() => validateEnv(reusedDownloadSecret)).toThrow(/independent/i);

    const reusedAdminMfaSecret = validEnvironment();
    reusedAdminMfaSecret.ADMIN_MFA_SECRET_ENCRYPTION_KEY =
      reusedAdminMfaSecret.AUTH_SESSION_HASH_SECRET;
    expect(() => validateEnv(reusedAdminMfaSecret)).toThrow(/independent/i);
  });

  it("rejects a relative LOCAL_ARTIFACT_STORAGE_DIR path", () => {
    expect(() =>
      validateEnv({
        ...validEnvironment(),
        LOCAL_ARTIFACT_STORAGE_DIR: "relative/artifacts",
      }),
    ).toThrow(/absolute path/i);
  });

  it("allows HTTP only for loopback development origins", () => {
    expect(
      validateEnv({
        ...validEnvironment(),
        NODE_ENV: "development",
        PUBLIC_WEB_ORIGIN: "http://localhost:3001",
      }).PUBLIC_WEB_ORIGIN,
    ).toBe("http://localhost:3001");

    expect(() =>
      validateEnv({
        ...validEnvironment(),
        PUBLIC_WEB_ORIGIN: "http://kitvera.example",
      }),
    ).toThrow();
  });

  it("leaves ADMIN_MFA_ENFORCED undefined when unset", () => {
    const environment = validEnvironment();
    delete environment.ADMIN_MFA_ENFORCED;

    expect(validateEnv(environment).ADMIN_MFA_ENFORCED).toBeUndefined();
  });

  it.each(["true", "false"] as const)(
    "parses an explicit ADMIN_MFA_ENFORCED=%s to its literal boolean",
    (value) => {
      const environment = validateEnv({
        ...validEnvironment(),
        ADMIN_MFA_ENFORCED: value,
      });

      expect(environment.ADMIN_MFA_ENFORCED).toBe(value === "true");
    },
  );

  it("rejects a non-literal ADMIN_MFA_ENFORCED value", () => {
    expect(() =>
      validateEnv({
        ...validEnvironment(),
        ADMIN_MFA_ENFORCED: "yes",
      }),
    ).toThrow();
  });
});
