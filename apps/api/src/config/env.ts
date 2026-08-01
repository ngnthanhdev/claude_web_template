import { isAbsolute } from "node:path";

import { z } from "zod";

const postgresUrlSchema = z
  .string()
  .url()
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "DATABASE_URL must use the PostgreSQL protocol",
  );

const corsOriginSchema = z
  .string()
  .min(1)
  .superRefine((value, context) => {
    for (const origin of value.split(",").map((entry) => entry.trim())) {
      if (!z.string().url().safeParse(origin).success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid CORS origin: ${origin}`,
        });
      }
    }
  });

const secretSchema = z.string().superRefine((value, context) => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must be a canonical unpadded base64url 256-bit secret",
    });
    return;
  }

  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must decode to exactly 32 bytes",
    });
  }
});

const environmentObjectSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: postgresUrlSchema,
  CORS_ORIGIN: corsOriginSchema,
  PUBLIC_WEB_ORIGIN: z.string().url(),
  CATALOGUE_CURSOR_SIGNING_SECRET: secretSchema,
  AUTH_MAGIC_LINK_HASH_SECRET: secretSchema,
  AUTH_SESSION_HASH_SECRET: secretSchema,
  AUTH_CSRF_HASH_SECRET: secretSchema,
  AUTH_SOURCE_IP_HASH_SECRET: secretSchema,
  DOWNLOAD_TOKEN_HMAC_SECRET: secretSchema,
  LOCAL_ARTIFACT_STORAGE_DIR: z
    .string()
    .min(1)
    .refine(isAbsolute, "must be an absolute path"),
});

const secretNames = [
  "CATALOGUE_CURSOR_SIGNING_SECRET",
  "AUTH_MAGIC_LINK_HASH_SECRET",
  "AUTH_SESSION_HASH_SECRET",
  "AUTH_CSRF_HASH_SECRET",
  "AUTH_SOURCE_IP_HASH_SECRET",
  "DOWNLOAD_TOKEN_HMAC_SECRET",
] as const;

export const envSchema = environmentObjectSchema.superRefine(
  (environment, context) => {
    const secretValues = secretNames.map((name) => environment[name]);
    if (new Set(secretValues).size !== secretValues.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Security secrets must be independent",
      });
    }

    const publicWebUrl = new URL(environment.PUBLIC_WEB_ORIGIN);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      publicWebUrl.hostname,
    );
    const isAllowedDevelopmentHttp =
      environment.NODE_ENV === "development" &&
      publicWebUrl.protocol === "http:" &&
      isLoopback;
    if (
      (publicWebUrl.protocol !== "https:" && !isAllowedDevelopmentHttp) ||
      publicWebUrl.origin !== environment.PUBLIC_WEB_ORIGIN
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "PUBLIC_WEB_ORIGIN must be an HTTPS origin (loopback HTTP is development-only)",
        path: ["PUBLIC_WEB_ORIGIN"],
      });
    }
  },
);

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
