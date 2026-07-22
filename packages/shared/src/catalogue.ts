import { z } from "zod";

import { cursorPageMetaSchema } from "./api.js";
import { currencySchema, localeSchema } from "./localization.js";
import { moneySchema } from "./money.js";

const nonEmptyTextSchema = z.string().trim().min(1);

export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase slug");
export type Slug = z.infer<typeof slugSchema>;

export const semanticVersionSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    "must be a semantic version",
  );
export type SemanticVersion = z.infer<typeof semanticVersionSchema>;

export const categorySlugSchema = z.enum([
  "wordpress",
  "elementor",
  "html",
  "shopify",
  "jamstack",
  "marketing",
  "cms",
  "ecommerce",
  "ui-templates",
  "plugins",
]);
export type CategorySlug = z.infer<typeof categorySlugSchema>;

export const publicationStateSchema = z.enum([
  "draft",
  "published",
  "delisted",
]);
export type PublicationState = z.infer<typeof publicationStateSchema>;

export const licenceIdentifierSchema = z.enum(["Regular", "Extended"]);
export type LicenceIdentifier = z.infer<typeof licenceIdentifierSchema>;

function hasUniqueLocales(items: readonly { locale: string }[]): boolean {
  return new Set(items.map(({ locale }) => locale)).size === items.length;
}

function hasUniquePositions(items: readonly { position: number }[]): boolean {
  return items.every(({ position }, index) => position === index);
}

const categoryTranslationSchema = z
  .object({
    locale: localeSchema,
    name: nonEmptyTextSchema,
    summary: nonEmptyTextSchema,
  })
  .strict();

export const localizedCategorySummarySchema = z
  .object({
    slug: categorySlugSchema,
    translations: z
      .array(categoryTranslationSchema)
      .length(localeSchema.options.length)
      .refine(
        hasUniqueLocales,
        "must contain one translation for every supported locale",
      ),
  })
  .strict();
export type LocalizedCategorySummary = z.infer<
  typeof localizedCategorySummarySchema
>;

const publicHttpUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "must use HTTP or HTTPS")
  .refine((value) => {
    const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1]?.toLowerCase();
    if (!authority || authority.includes("@")) return false;

    return !(
      /^(?:localhost|.+\.localhost|.+\.local)(?::\d+)?$/.test(authority) ||
      /^(?:0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d+)?$/.test(
        authority,
      ) ||
      /^\[(?:::1|f[cd][0-9a-f:]*|fe80[0-9a-f:]*)\](?::\d+)?$/.test(authority)
    );
  }, "must be a public URL without credentials");

const productCardTranslationSchema = z
  .object({
    locale: localeSchema,
    title: nonEmptyTextSchema,
    summary: nonEmptyTextSchema,
  })
  .strict();

const productDetailTranslationSchema = productCardTranslationSchema
  .extend({ description: nonEmptyTextSchema })
  .strict();

const localizedProductCardContentSchema = z
  .array(productCardTranslationSchema)
  .length(localeSchema.options.length)
  .refine(
    hasUniqueLocales,
    "must contain one translation for every supported locale",
  );

const localizedProductDetailContentSchema = z
  .array(productDetailTranslationSchema)
  .length(localeSchema.options.length)
  .refine(
    hasUniqueLocales,
    "must contain one translation for every supported locale",
  );

const licenceOptionSchema = z
  .object({
    identifier: licenceIdentifierSchema,
    prices: z
      .array(moneySchema)
      .length(currencySchema.options.length)
      .refine(
        (prices) =>
          new Set(prices.map(({ currency }) => currency)).size ===
          prices.length,
        "must contain one price for every supported currency",
      ),
  })
  .strict();
export type LicenceOption = z.infer<typeof licenceOptionSchema>;

export const licenceOptionsSchema = z
  .array(licenceOptionSchema)
  .length(licenceIdentifierSchema.options.length)
  .refine(
    (options) =>
      new Set(options.map(({ identifier }) => identifier)).size ===
      options.length,
    "must contain Regular and Extended licence options",
  );
export type LicenceOptions = z.infer<typeof licenceOptionsSchema>;

export const productCardSchema = z
  .object({
    id: z.string().uuid(),
    slug: slugSchema,
    publicationState: publicationStateSchema,
    category: categorySlugSchema,
    tags: z.array(slugSchema),
    translations: localizedProductCardContentSchema,
    currentVersion: semanticVersionSchema,
    thumbnailUrl: publicHttpUrlSchema,
    licenceOptions: licenceOptionsSchema,
  })
  .strict();
export type ProductCard = z.infer<typeof productCardSchema>;

const changelogEntrySchema = z
  .object({
    version: semanticVersionSchema,
    releasedAt: z.string().datetime({ offset: true }),
    translations: z
      .array(
        z
          .object({
            locale: localeSchema,
            notes: nonEmptyTextSchema,
          })
          .strict(),
      )
      .length(localeSchema.options.length)
      .refine(
        hasUniqueLocales,
        "must contain one translation for every supported locale",
      ),
  })
  .strict();

const compatibilitySchema = z
  .object({
    target: slugSchema,
    constraint: nonEmptyTextSchema,
  })
  .strict();

const specificationSchema = z
  .object({
    key: slugSchema,
    translations: z
      .array(
        z
          .object({
            locale: localeSchema,
            label: nonEmptyTextSchema,
            value: nonEmptyTextSchema,
          })
          .strict(),
      )
      .length(localeSchema.options.length)
      .refine(
        hasUniqueLocales,
        "must contain one translation for every supported locale",
      ),
  })
  .strict();

const mediaSchema = z
  .object({
    position: z.number().int().nonnegative().safe(),
    kind: z.enum(["image", "video"]),
    url: publicHttpUrlSchema,
    translations: z
      .array(
        z
          .object({
            locale: localeSchema,
            alt: nonEmptyTextSchema,
          })
          .strict(),
      )
      .length(localeSchema.options.length)
      .refine(
        hasUniqueLocales,
        "must contain one translation for every supported locale",
      ),
  })
  .strict();

const demoPageSchema = z
  .object({
    position: z.number().int().nonnegative().safe(),
    slug: slugSchema,
    previewUrl: publicHttpUrlSchema,
    translations: z
      .array(
        z
          .object({
            locale: localeSchema,
            title: nonEmptyTextSchema,
          })
          .strict(),
      )
      .length(localeSchema.options.length)
      .refine(
        hasUniqueLocales,
        "must contain one translation for every supported locale",
      ),
  })
  .strict();

export const productDetailResponseSchema = productCardSchema
  .omit({ translations: true })
  .extend({
    translations: localizedProductDetailContentSchema,
    changelog: z.array(changelogEntrySchema).min(1),
    compatibility: z.array(compatibilitySchema).min(1),
    specifications: z.array(specificationSchema).min(1),
    media: z
      .array(mediaSchema)
      .min(1)
      .refine(
        hasUniquePositions,
        "positions must be unique, contiguous, and ordered from zero",
      ),
    demoPages: z
      .array(demoPageSchema)
      .min(1)
      .refine(
        hasUniquePositions,
        "positions must be unique, contiguous, and ordered from zero",
      ),
    documentationUrl: publicHttpUrlSchema,
    isolatedPreviewUrl: publicHttpUrlSchema,
  })
  .strict();
export type ProductDetailResponse = z.infer<typeof productDetailResponseSchema>;

export const productCollectionResponseSchema = z
  .object({
    data: z.array(productCardSchema),
    meta: cursorPageMetaSchema,
  })
  .strict();
export type ProductCollectionResponse = z.infer<
  typeof productCollectionResponseSchema
>;
