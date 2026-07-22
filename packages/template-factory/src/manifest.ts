import { z } from "zod";

const slugSchema = z
  .string()
  .min(1, "must not be empty")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase slug");

export const semanticVersionSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    "must be a semantic version",
  );

const termsVersionSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD terms version");

const repositoryPathSchema = z
  .string()
  .min(1)
  .regex(/^\/(?!\/)(?!.*\.\.)[^?#]*$/, "must be a safe root-relative path");

export const templateCategorySchema = z.enum([
  "WordPress",
  "Elementor",
  "HTML",
  "Shopify",
  "Jamstack",
  "Marketing",
  "CMS",
  "eCommerce",
  "UI Templates",
  "Plugins",
]);

export const buildAdapterIdentitySchema = z
  .object({
    id: slugSchema,
    version: semanticVersionSchema,
  })
  .strict();

const licenseMetadataShape = {
  termsVersion: termsVersionSchema,
  termsPath: repositoryPathSchema,
  grants: z.array(slugSchema).min(1, "must declare at least one grant"),
};

const regularLicenseSchema = z
  .object({
    identifier: z.literal("Regular"),
    ...licenseMetadataShape,
  })
  .strict();

const extendedLicenseSchema = z
  .object({
    identifier: z.literal("Extended"),
    ...licenseMetadataShape,
  })
  .strict();

export const templateManifestSchema = z
  .object({
    manifestVersion: z.literal("1.0.0"),
    identity: z
      .object({
        id: slugSchema,
        name: z.string().trim().min(1, "must not be empty"),
        category: templateCategorySchema,
      })
      .strict(),
    version: semanticVersionSchema,
    compatibility: z
      .array(
        z
          .object({
            target: slugSchema,
            constraint: z.string().trim().min(1, "must not be empty"),
          })
          .strict(),
      )
      .min(1, "must declare at least one compatibility target"),
    licenses: z
      .object({
        regular: regularLicenseSchema,
        extended: extendedLicenseSchema,
      })
      .strict(),
    demoPages: z
      .array(
        z
          .object({
            id: slugSchema,
            title: z.string().trim().min(1, "must not be empty"),
            path: repositoryPathSchema,
          })
          .strict(),
      )
      .min(1, "must declare at least one demo page"),
    buildAdapter: buildAdapterIdentitySchema,
  })
  .strict();

export type TemplateCategory = z.infer<typeof templateCategorySchema>;
export type BuildAdapterIdentity = z.infer<typeof buildAdapterIdentitySchema>;
export type TemplateManifest = z.infer<typeof templateManifestSchema>;

export function parseTemplateManifest(input: unknown): TemplateManifest {
  return templateManifestSchema.parse(input);
}
