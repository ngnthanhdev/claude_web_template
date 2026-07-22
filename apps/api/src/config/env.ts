import { z } from "zod";

const postgresUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "DATABASE_URL must use the PostgreSQL protocol",
  );

const corsOriginSchema = z.string().min(1).superRefine((value, context) => {
  for (const origin of value.split(",").map((entry) => entry.trim())) {
    if (!z.string().url().safeParse(origin).success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid CORS origin: ${origin}`,
      });
    }
  }
});

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: postgresUrlSchema,
  CORS_ORIGIN: corsOriginSchema,
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
