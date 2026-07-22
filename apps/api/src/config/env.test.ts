import { describe, expect, it } from "vitest";

import { validateEnv } from "./env.js";

const secret = (byte: string): string => Buffer.alloc(32, byte).toString("base64url");

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
    "PUBLIC_WEB_ORIGIN",
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
});
