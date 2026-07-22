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

const repeatableProductQueryKeys = new Set([
  "category",
  "subcategory",
  "technology",
  "templateType",
  "pageType",
  "industry",
  "feature",
  "compatibility",
]);

function collectUrlSearchParams(input: unknown): unknown {
  if (!(input instanceof URLSearchParams)) return input;

  const query = new Map<string, string | string[]>();
  input.forEach((value, key) => {
    const current = query.get(key);
    if (current === undefined) {
      query.set(key, value);
    } else if (typeof current === "string") {
      query.set(key, [current, value]);
    } else {
      current.push(value);
    }
  });
  return Object.fromEntries(query);
}

function normalizeRepeatableProductQueryValues(input: unknown): unknown {
  const collected = collectUrlSearchParams(input);
  if (
    typeof collected !== "object" ||
    collected === null ||
    Array.isArray(collected)
  ) {
    return collected;
  }

  return Object.fromEntries(
    Object.entries(collected).map(([key, value]) => [
      key,
      repeatableProductQueryKeys.has(key) && typeof value === "string"
        ? [value]
        : value,
    ]),
  );
}

const canonicalQueryIntegerSchema = z
  .union([
    z.number().int().safe(),
    z
      .string()
      .regex(/^(?:0|[1-9]\d*)$/, "must be a canonical non-negative integer")
      .transform(Number),
  ])
  .pipe(z.number().int().nonnegative().safe());

const normalizedSearchQuerySchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .transform((value) => (value === "" ? undefined : value))
  .pipe(z.string().min(2).max(100).optional());

const controlledFacetSchema = z.array(slugSchema).min(1).max(20);

export const compatibilityFilterSchema = z.string().refine((value) => {
  const [target, versionBand, extra] = value.split("@");
  return (
    extra === undefined &&
    slugSchema.safeParse(target).success &&
    /^(?:0|[1-9]\d*)\.(?:x|(?:0|[1-9]\d*)\.x)$/.test(versionBand ?? "")
  );
}, "must use <target>@<major>.x or <target>@<major>.<minor>.x");
export type CompatibilityFilter = z.infer<typeof compatibilityFilterSchema>;

const compatibilityFiltersSchema = z
  .array(compatibilityFilterSchema)
  .min(1)
  .max(20);

export const productSortSchema = z.enum([
  "relevance",
  "newest",
  "recently-updated",
  "price-asc",
  "price-desc",
  "title-asc",
]);
export type ProductSort = z.infer<typeof productSortSchema>;

export const updatedWithinSchema = z.enum(["30d", "90d", "1y"]);
export type UpdatedWithin = z.infer<typeof updatedWithinSchema>;

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

export const categoryCollectionQuerySchema = z.preprocess(
  collectUrlSearchParams,
  z.object({ locale: localeSchema }).strict(),
);
export type CategoryCollectionQuery = z.infer<
  typeof categoryCollectionQuerySchema
>;

export const categoryCollectionResponseSchema = z
  .object({
    data: z.array(localizedCategorySummarySchema),
    meta: cursorPageMetaSchema,
  })
  .strict();
export type CategoryCollectionResponse = z.infer<
  typeof categoryCollectionResponseSchema
>;

function isNonPublicIpv4(octets: readonly number[]): boolean {
  const [first, second, third] = octets;
  if (first === undefined || second === undefined || third === undefined) {
    return true;
  }

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  );
}

function parseCanonicalIpv4(hostname: string): readonly number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null;

  const octets = hostname.split(".").map(Number);
  return octets.length === 4 && octets.every((octet) => octet <= 255)
    ? octets
    : null;
}

function parseMappedIpv4(hostname: string): readonly number[] | null {
  const address =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  if (!address.startsWith("::ffff:")) return null;

  const words = address.slice("::ffff:".length).split(":");
  const [highText, lowText] = words;
  if (words.length !== 2 || !highText || !lowText) return null;

  const high = Number.parseInt(highText, 16);
  const low = Number.parseInt(lowText, 16);
  if (!Number.isInteger(high) || !Number.isInteger(low)) return null;

  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function isNonPublicHostname(hostname: string): boolean {
  const canonicalHostname = hostname.toLowerCase().replace(/\.$/, "");
  if (
    canonicalHostname === "localhost" ||
    canonicalHostname.endsWith(".localhost") ||
    canonicalHostname.endsWith(".local")
  ) {
    return true;
  }

  const ipv4 = parseCanonicalIpv4(canonicalHostname);
  if (ipv4) return isNonPublicIpv4(ipv4);

  const mappedIpv4 = parseMappedIpv4(canonicalHostname);
  if (mappedIpv4) return isNonPublicIpv4(mappedIpv4);

  const ipv6 = canonicalHostname.replace(/^\[|\]$/g, "");
  return (
    ipv6 === "::" ||
    ipv6 === "::1" ||
    /^f[cd][0-9a-f]{2}(?::|$)/.test(ipv6) ||
    /^f(?:e[89ab])(?=[0-9a-f])/.test(ipv6) ||
    /^ff[0-9a-f]{2}(?::|$)/.test(ipv6) ||
    ipv6.startsWith("2001:db8:")
  );
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      !isNonPublicHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

const publicHttpUrlSchema = z
  .string()
  .url()
  .refine(isPublicHttpUrl, "must be a public HTTP(S) URL without credentials");

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

const productCollectionQueryObjectSchema = z
  .object({
    locale: localeSchema,
    currency: currencySchema,
    licence: licenceIdentifierSchema,
    q: normalizedSearchQuerySchema.optional(),
    category: controlledFacetSchema.optional(),
    subcategory: controlledFacetSchema.optional(),
    technology: controlledFacetSchema.optional(),
    templateType: controlledFacetSchema.optional(),
    pageType: controlledFacetSchema.optional(),
    industry: controlledFacetSchema.optional(),
    feature: controlledFacetSchema.optional(),
    compatibility: compatibilityFiltersSchema.optional(),
    updatedWithin: updatedWithinSchema.optional(),
    minPrice: canonicalQueryIntegerSchema.optional(),
    maxPrice: canonicalQueryIntegerSchema.optional(),
    sort: productSortSchema.optional(),
    limit: canonicalQueryIntegerSchema
      .pipe(z.number().min(1).max(48))
      .default(24),
    cursor: z.string().min(1).optional(),
  })
  .strict()
  .superRefine(({ minPrice, maxPrice }, context) => {
    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minPrice must be less than or equal to maxPrice",
        path: ["maxPrice"],
      });
    }
  })
  .transform((query) => {
    if (query.q === undefined) {
      const { q: _emptySearch, ...queryWithoutEmptySearch } = query;
      return {
        ...queryWithoutEmptySearch,
        sort: query.sort ?? "newest",
      };
    }

    return { ...query, sort: query.sort ?? "relevance" };
  });

/**
 * Each facet array is ORed within its field; populated fields are ANDed
 * across the query. Facet membership is validated against the catalogue DB.
 */
export const productCollectionQuerySchema = z.preprocess(
  normalizeRepeatableProductQueryValues,
  productCollectionQueryObjectSchema,
);
export type ProductCollectionQuery = z.infer<
  typeof productCollectionQuerySchema
>;

export const productCollectionResponseSchema = z
  .object({
    data: z.array(productCardSchema),
    meta: cursorPageMetaSchema,
  })
  .strict();
export type ProductCollectionResponse = z.infer<
  typeof productCollectionResponseSchema
>;
