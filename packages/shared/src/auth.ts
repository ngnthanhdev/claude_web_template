import { z } from "zod";

import { slugSchema } from "./catalogue.js";
import { localeSchema } from "./localization.js";

const normalizedEmailSchema = z.string().trim().toLowerCase().email().max(320);

export const base64Url256BitTokenSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/,
    "must be a 32-byte unpadded base64url token",
  )
  .describe("Canonical unpadded base64url encoding of 32 random bytes");
export type Base64Url256BitToken = z.infer<typeof base64Url256BitTokenSchema>;

function hasAllowedPath(pathname: string): boolean {
  const [, locale, ...segments] = pathname.split("/");
  if (!localeSchema.safeParse(locale).success) return false;
  if (segments.length === 0) return true;

  const [section, second, third, ...remaining] = segments;
  if (section === "categories") {
    return (
      second !== undefined &&
      [second, third, ...remaining]
        .filter((segment) => segment !== undefined)
        .every((segment) => slugSchema.safeParse(segment).success)
    );
  }
  if (section === "templates") {
    return (
      second !== undefined &&
      third === undefined &&
      slugSchema.safeParse(second).success
    );
  }
  if (["search", "wishlist", "cart"].includes(section ?? "")) {
    return second === undefined;
  }
  if (section === "checkout") {
    return second === undefined || (second === "result" && third === undefined);
  }
  if (section === "account") {
    if (second === undefined) return true;
    if (["library", "profile"].includes(second)) return third === undefined;
    return (
      second === "orders" &&
      third !== undefined &&
      remaining.length === 0 &&
      z.string().uuid().safeParse(third).success
    );
  }
  if (section === "admin") {
    return [second, third, ...remaining]
      .filter((segment) => segment !== undefined)
      .every((segment) => slugSchema.safeParse(segment).success);
  }
  return false;
}

function isAllowedKitveraReturnTo(value: string): boolean {
  if (
    value.length > 2_048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return false;
  }

  try {
    const url = new URL(value, "https://kitvera.invalid");
    return (
      url.origin === "https://kitvera.invalid" &&
      url.hash === "" &&
      hasAllowedPath(url.pathname)
    );
  } catch {
    return false;
  }
}

export const kitveraReturnToSchema = z
  .string()
  .min(1)
  .refine(isAllowedKitveraReturnTo, "must be an approved KITVERA route");
export type KitveraReturnTo = z.infer<typeof kitveraReturnToSchema>;

const magicLinkInitiationObjectSchema = z
  .object({
    email: normalizedEmailSchema,
    locale: localeSchema,
    returnTo: kitveraReturnToSchema.optional(),
  })
  .strict()
  .superRefine(({ locale, returnTo }, context) => {
    if (returnTo !== undefined && !returnTo.startsWith(`/${locale}`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "returnTo locale must match locale",
        path: ["returnTo"],
      });
    }
  })
  .transform((request) => ({
    ...request,
    returnTo: request.returnTo ?? `/${request.locale}/account`,
  }));

export const magicLinkInitiationRequestSchema = magicLinkInitiationObjectSchema;
export type MagicLinkInitiationRequest = z.infer<
  typeof magicLinkInitiationRequestSchema
>;

export const magicLinkInitiationResponseSchema = z
  .object({ status: z.literal("accepted") })
  .strict();
export type MagicLinkInitiationResponse = z.infer<
  typeof magicLinkInitiationResponseSchema
>;

export const magicLinkRedemptionRequestSchema = z
  .object({ token: base64Url256BitTokenSchema })
  .strict();
export type MagicLinkRedemptionRequest = z.infer<
  typeof magicLinkRedemptionRequestSchema
>;

export const sessionUserSchema = z
  .object({
    id: z.string().uuid(),
    email: normalizedEmailSchema,
  })
  .strict();
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const safeSessionSchema = z
  .object({
    id: z.string().uuid(),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type SafeSession = z.infer<typeof safeSessionSchema>;

export const currentSessionResponseSchema = z
  .object({
    user: sessionUserSchema,
    session: safeSessionSchema,
    csrfToken: base64Url256BitTokenSchema,
  })
  .strict();
export type CurrentSessionResponse = z.infer<
  typeof currentSessionResponseSchema
>;

export const magicLinkRedemptionResponseSchema = currentSessionResponseSchema
  .extend({ returnTo: kitveraReturnToSchema })
  .strict();
export type MagicLinkRedemptionResponse = z.infer<
  typeof magicLinkRedemptionResponseSchema
>;

export const currentSessionRevocationResponseSchema = z.undefined();
export type CurrentSessionRevocationResponse = z.infer<
  typeof currentSessionRevocationResponseSchema
>;

export const allSessionsRevocationResponseSchema = z.undefined();
export type AllSessionsRevocationResponse = z.infer<
  typeof allSessionsRevocationResponseSchema
>;
