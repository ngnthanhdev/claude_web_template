import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PublicationState } from "@prisma/client";
import {
  categoryCollectionResponseSchema,
  categorySlugSchema,
  productCollectionResponseSchema,
  productDetailResponseSchema,
  type CategoryCollectionQuery,
  type ProductCollectionQuery,
  type ProductSort,
} from "@marketplace/shared/catalogue";
import { ZodError } from "zod";
import { ZodValidationException } from "nestjs-zod";

import { PrismaService } from "../prisma/prisma.service.js";
import {
  CatalogueCursor,
  CatalogueCursorValidationError,
  type CatalogueCursorTuple,
} from "./catalogue-cursor.js";

const cardInclude = {
  translations: true,
  tags: { include: { tag: true } },
  licenceOptions: { include: { prices: true } },
} satisfies Prisma.ProductInclude;

const detailInclude = {
  ...cardInclude,
  compatibility: true,
  specifications: { include: { translations: true } },
  media: { include: { translations: true } },
  demoPages: { include: { translations: true } },
  versions: { include: { translations: true } },
} satisfies Prisma.ProductInclude;

type CardRow = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;
type DetailRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

type CandidateRow = {
  id: string;
  root_slug: string;
  published_at: Date;
  updated_at: Date;
  amount: number;
  normalized_title: string;
  rank_value: string;
};

type RootRow = { root_slug: string };

type TagFacetKey =
  | "technology"
  | "templateType"
  | "pageType"
  | "industry"
  | "feature";

const tagFacetKeys = [
  "technology",
  "templateType",
  "pageType",
  "industry",
  "feature",
] satisfies readonly TagFacetKey[];

const accentCharacters =
  "áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ";
const plainCharacters =
  "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd";

function invalidRequest(path: (string | number)[], message: string): never {
  throw new ZodValidationException(
    new ZodError([{ code: "custom", path, message }]),
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .toLocaleLowerCase("en-US");
}

function tupleFromRow(sort: ProductSort, row: CandidateRow): CatalogueCursorTuple {
  switch (sort) {
    case "relevance":
      return {
        sort,
        rank: row.rank_value,
        publishedAt: row.published_at.toISOString(),
        id: row.id,
      };
    case "newest":
      return { sort, publishedAt: row.published_at.toISOString(), id: row.id };
    case "recently-updated":
      return { sort, updatedAt: row.updated_at.toISOString(), id: row.id };
    case "price-asc":
    case "price-desc":
      return { sort, amount: row.amount, id: row.id };
    case "title-asc":
      return { sort, title: row.normalized_title, id: row.id };
  }
}

function cursorPredicate(tuple: CatalogueCursorTuple | undefined): Prisma.Sql {
  if (tuple === undefined) return Prisma.empty;

  switch (tuple.sort) {
    case "relevance":
      return Prisma.sql`WHERE
        "rank_value" < ${tuple.rank}::double precision
        OR ("rank_value" = ${tuple.rank}::double precision AND "published_at" < ${tuple.publishedAt}::timestamptz)
        OR ("rank_value" = ${tuple.rank}::double precision AND "published_at" = ${tuple.publishedAt}::timestamptz AND "id" < ${tuple.id}::uuid)`;
    case "newest":
      return Prisma.sql`WHERE
        "published_at" < ${tuple.publishedAt}::timestamptz
        OR ("published_at" = ${tuple.publishedAt}::timestamptz AND "id" < ${tuple.id}::uuid)`;
    case "recently-updated":
      return Prisma.sql`WHERE
        "updated_at" < ${tuple.updatedAt}::timestamptz
        OR ("updated_at" = ${tuple.updatedAt}::timestamptz AND "id" < ${tuple.id}::uuid)`;
    case "price-asc":
      return Prisma.sql`WHERE
        "amount" > ${tuple.amount}
        OR ("amount" = ${tuple.amount} AND "id" > ${tuple.id}::uuid)`;
    case "price-desc":
      return Prisma.sql`WHERE
        "amount" < ${tuple.amount}
        OR ("amount" = ${tuple.amount} AND "id" < ${tuple.id}::uuid)`;
    case "title-asc":
      return Prisma.sql`WHERE
        "normalized_title" > ${tuple.title}
        OR ("normalized_title" = ${tuple.title} AND "id" > ${tuple.id}::uuid)`;
  }
}

function orderBy(sort: ProductSort): Prisma.Sql {
  switch (sort) {
    case "relevance":
      return Prisma.sql`ORDER BY "rank_value" DESC, "published_at" DESC, "id" DESC`;
    case "newest":
      return Prisma.sql`ORDER BY "published_at" DESC, "id" DESC`;
    case "recently-updated":
      return Prisma.sql`ORDER BY "updated_at" DESC, "id" DESC`;
    case "price-asc":
      return Prisma.sql`ORDER BY "amount" ASC, "id" ASC`;
    case "price-desc":
      return Prisma.sql`ORDER BY "amount" DESC, "id" DESC`;
    case "title-asc":
      return Prisma.sql`ORDER BY "normalized_title" ASC, "id" ASC`;
  }
}

function compatibilityCondition(value: string): Prisma.Sql {
  const [target, band] = value.split("@");
  if (target === undefined || band === undefined) {
    return Prisma.sql`FALSE`;
  }
  const numericPrefix = band.replace(/\.x$/, "");
  const escapedPrefix = numericPrefix.replace(".", "\\.");
  const occurrence = `(^|[^0-9])${escapedPrefix}([.][0-9]+)?([^0-9]|$)`;
  return Prisma.sql`(
    "compatibility"."target" = ${target}
    AND (
      "compatibility"."constraint" = ${band}
      OR "compatibility"."constraint" LIKE ${`%${band}%`}
      OR "compatibility"."constraint" ~ ${occurrence}
    )
  )`;
}

function mapLicenceOptions(row: CardRow) {
  return [...row.licenceOptions]
    .sort((left, right) => left.identifier.localeCompare(right.identifier))
    .map((option) => ({
      identifier: option.identifier,
      prices: [...option.prices]
        .sort((left, right) => left.currency.localeCompare(right.currency))
        .map(({ amount, currency }) => ({ amount, currency })),
    }));
}

function mapCard(row: CardRow, rootSlug: string) {
  return {
    id: row.id,
    slug: row.slug,
    publicationState: row.publicationState,
    category: rootSlug,
    tags: uniqueSorted(row.tags.map(({ tag }) => tag.slug)),
    translations: [...row.translations]
      .sort((left, right) => left.locale.localeCompare(right.locale))
      .map(({ locale, title, summary }) => ({ locale, title, summary })),
    currentVersion: row.currentVersion,
    thumbnailUrl: row.thumbnailUrl,
    licenceOptions: mapLicenceOptions(row),
  };
}

function mapDetail(row: DetailRow, rootSlug: string) {
  return {
    ...mapCard(row, rootSlug),
    translations: [...row.translations]
      .sort((left, right) => left.locale.localeCompare(right.locale))
      .map(({ locale, title, summary, description }) => ({
        locale,
        title,
        summary,
        description,
      })),
    changelog: [...row.versions]
      .sort((left, right) => right.releasedAt.getTime() - left.releasedAt.getTime())
      .map(({ version, releasedAt, translations }) => ({
        version,
        releasedAt: releasedAt.toISOString(),
        translations: [...translations]
          .sort((left, right) => left.locale.localeCompare(right.locale))
          .map(({ locale, notes }) => ({ locale, notes })),
      })),
    compatibility: [...row.compatibility]
      .sort((left, right) => left.target.localeCompare(right.target))
      .map(({ target, constraint }) => ({ target, constraint })),
    specifications: [...row.specifications]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map(({ key, translations }) => ({
        key,
        translations: [...translations]
          .sort((left, right) => left.locale.localeCompare(right.locale))
          .map(({ locale, label, value }) => ({ locale, label, value })),
      })),
    media: [...row.media]
      .sort((left, right) => left.position - right.position)
      .map(({ position, kind, url, translations }) => ({
        position,
        kind,
        url,
        translations: [...translations]
          .sort((left, right) => left.locale.localeCompare(right.locale))
          .map(({ locale, alt }) => ({ locale, alt })),
      })),
    demoPages: [...row.demoPages]
      .sort((left, right) => left.position - right.position)
      .map(({ position, slug, previewUrl, translations }) => ({
        position,
        slug,
        previewUrl,
        translations: [...translations]
          .sort((left, right) => left.locale.localeCompare(right.locale))
          .map(({ locale, title }) => ({ locale, title })),
      })),
    documentationUrl: row.documentationUrl,
    isolatedPreviewUrl: row.isolatedPreviewUrl,
  };
}

@Injectable()
export class CatalogueService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CatalogueCursor) private readonly cursors: CatalogueCursor,
  ) {}

  async findCategories(query: CategoryCollectionQuery) {
    void query.locale;
    const rows = await this.prisma.category.findMany({
      where: {
        parentId: null,
        slug: { in: [...categorySlugSchema.options] },
      },
      select: {
        slug: true,
        translations: { select: { locale: true, name: true, summary: true } },
      },
    });
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    const data = categorySlugSchema.options.map((slug) => {
      const row = bySlug.get(slug);
      if (row === undefined) {
        throw new Error(`Missing seeded public category: ${slug}`);
      }
      return {
        slug,
        translations: [...row.translations]
          .sort((left, right) => left.locale.localeCompare(right.locale))
          .map(({ locale, name, summary }) => ({ locale, name, summary })),
      };
    });

    return categoryCollectionResponseSchema.parse({
      data,
      meta: { nextCursor: null, hasMore: false },
    });
  }

  async findProducts(query: ProductCollectionQuery) {
    await this.validateDynamicVocabulary(query);

    let cursorTuple: CatalogueCursorTuple | undefined;
    if (query.cursor !== undefined) {
      try {
        cursorTuple = this.cursors.decode(query.cursor, query);
      } catch (error: unknown) {
        if (error instanceof CatalogueCursorValidationError) {
          invalidRequest(["cursor"], "Invalid catalogue cursor");
        }
        throw error;
      }
    }

    const clauses: Prisma.Sql[] = [
      Prisma.sql`"product"."publication_state" = 'published'::"PublicationState"`,
      Prisma.sql`"product"."published_at" IS NOT NULL`,
      Prisma.sql`"product"."current_version" IS NOT NULL`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM "product_versions" AS "current_version"
        WHERE "current_version"."product_id" = "product"."id"
          AND "current_version"."version" = "product"."current_version"
      )`,
      Prisma.sql`(
        SELECT count(DISTINCT "translation"."locale")
        FROM "product_translations" AS "translation"
        WHERE "translation"."product_id" = "product"."id"
      ) = 2`,
    ];

    if (query.category !== undefined) {
      clauses.push(
        Prisma.sql`"category_tree"."root_slug" IN (${Prisma.join(uniqueSorted(query.category))})`,
      );
    }
    if (query.subcategory !== undefined) {
      clauses.push(
        Prisma.sql`"category_tree"."path_slugs" && ARRAY[${Prisma.join(uniqueSorted(query.subcategory))}]::text[]`,
      );
    }
    for (const key of tagFacetKeys) {
      const values = query[key];
      if (values === undefined) continue;
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM "product_tags" AS "facet_product_tag"
        JOIN "tags" AS "facet_tag" ON "facet_tag"."id" = "facet_product_tag"."tag_id"
        WHERE "facet_product_tag"."product_id" = "product"."id"
          AND "facet_tag"."slug" IN (${Prisma.join(uniqueSorted(values))})
      )`);
    }
    if (query.compatibility !== undefined) {
      const compatibility = query.compatibility.map(compatibilityCondition);
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM "product_compatibility" AS "compatibility"
        WHERE "compatibility"."product_id" = "product"."id"
          AND (${Prisma.join(compatibility, " OR ")})
      )`);
    }
    if (query.updatedWithin !== undefined) {
      const interval = {
        "30d": "30 days",
        "90d": "90 days",
        "1y": "1 year",
      }[query.updatedWithin];
      clauses.push(
        Prisma.sql`"product"."updated_at" >= CURRENT_TIMESTAMP - ${interval}::interval`,
      );
    }
    if (query.minPrice !== undefined) {
      clauses.push(Prisma.sql`"selected_price"."amount" >= ${query.minPrice}`);
    }
    if (query.maxPrice !== undefined) {
      clauses.push(Prisma.sql`"selected_price"."amount" <= ${query.maxPrice}`);
    }

    const tagText = Prisma.sql`COALESCE((
      SELECT string_agg("search_tag"."slug", ' ' ORDER BY "search_tag"."slug")
      FROM "product_tags" AS "search_product_tag"
      JOIN "tags" AS "search_tag" ON "search_tag"."id" = "search_product_tag"."tag_id"
      WHERE "search_product_tag"."product_id" = "product"."id"
    ), '')`;
    let rank = Prisma.sql`0::double precision`;
    if (query.q !== undefined) {
      const normalized = normalizeSearch(query.q);
      const normalizedPattern = `%${normalized}%`;
      const searchDocument = Prisma.sql`to_tsvector(
        'simple',
        "localized"."title" || ' ' || "localized"."summary" || ' ' || "localized"."description"
      )`;
      clauses.push(Prisma.sql`(
        ${searchDocument} @@ websearch_to_tsquery('simple', ${query.q})
        OR "localized"."title" % ${query.q}
        OR translate(
          lower("localized"."title" || ' ' || "localized"."summary" || ' ' || "localized"."description" || ' ' || "root_translation"."name" || ' ' || ${tagText}),
          ${accentCharacters},
          ${plainCharacters}
        ) LIKE ${normalizedPattern}
      )`);
      rank = Prisma.sql`(
        ts_rank(
          setweight(to_tsvector('simple', "localized"."title"), 'A') ||
          setweight(to_tsvector('simple', "root_translation"."name" || ' ' || ${tagText}), 'A') ||
          setweight(to_tsvector('simple', "localized"."summary"), 'B') ||
          setweight(to_tsvector('simple', "localized"."description"), 'C'),
          websearch_to_tsquery('simple', ${query.q})
        ) + similarity(lower("localized"."title"), lower(${query.q}))
      )::double precision`;
    }

    const rows = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      WITH RECURSIVE "category_tree" AS (
        SELECT
          "category"."id",
          "category"."parent_id",
          "category"."slug",
          "category"."slug" AS "root_slug",
          ARRAY["category"."slug"]::text[] AS "path_slugs"
        FROM "categories" AS "category"
        WHERE "category"."parent_id" IS NULL
        UNION ALL
        SELECT
          "child"."id",
          "child"."parent_id",
          "child"."slug",
          "category_tree"."root_slug",
          "category_tree"."path_slugs" || "child"."slug"
        FROM "categories" AS "child"
        JOIN "category_tree" ON "category_tree"."id" = "child"."parent_id"
      ),
      "candidates" AS (
        SELECT
          "product"."id",
          "category_tree"."root_slug",
          "product"."published_at",
          "product"."updated_at",
          "selected_price"."amount",
          lower("localized"."title") AS "normalized_title",
          ${rank} AS "rank_value"
        FROM "products" AS "product"
        JOIN "category_tree" ON "category_tree"."id" = "product"."category_id"
        JOIN "categories" AS "root_category" ON "root_category"."slug" = "category_tree"."root_slug" AND "root_category"."parent_id" IS NULL
        JOIN "category_translations" AS "root_translation" ON "root_translation"."category_id" = "root_category"."id" AND "root_translation"."locale" = ${query.locale}::"Locale"
        JOIN "product_translations" AS "localized" ON "localized"."product_id" = "product"."id" AND "localized"."locale" = ${query.locale}::"Locale"
        JOIN "licence_options" AS "selected_licence" ON "selected_licence"."product_id" = "product"."id" AND "selected_licence"."identifier" = ${query.licence}::"LicenceIdentifier"
        JOIN "prices" AS "selected_price" ON "selected_price"."licence_option_id" = "selected_licence"."id" AND "selected_price"."currency" = ${query.currency}::"Currency"
        WHERE ${Prisma.join(clauses, " AND ")}
      )
      SELECT
        "id",
        "root_slug",
        "published_at",
        "updated_at",
        "amount",
        "normalized_title",
        "rank_value"::text
      FROM "candidates"
      ${cursorPredicate(cursorTuple)}
      ${orderBy(query.sort)}
      LIMIT ${query.limit + 1}
    `);

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: pageRows.map(({ id }) => id) },
        publicationState: PublicationState.published,
      },
      include: cardInclude,
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const rootById = new Map(pageRows.map((row) => [row.id, row.root_slug]));
    const data = pageRows.map(({ id }) => {
      const product = productById.get(id);
      const rootSlug = rootById.get(id);
      if (product === undefined || rootSlug === undefined) {
        throw new Error("Catalogue changed while a product page was being read");
      }
      return mapCard(product, rootSlug);
    });
    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last !== undefined
        ? this.cursors.encode(query, tupleFromRow(query.sort, last))
        : null;

    return productCollectionResponseSchema.parse({
      data,
      meta: { nextCursor, hasMore },
    });
  }

  async findProductBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        publicationState: PublicationState.published,
        currentVersion: { not: null },
      },
      include: detailInclude,
    });
    if (product === null) throw new NotFoundException("Product not found");

    const roots = await this.prisma.$queryRaw<RootRow[]>(Prisma.sql`
      WITH RECURSIVE "ancestors" AS (
        SELECT "id", "parent_id", "slug"
        FROM "categories"
        WHERE "id" = ${product.categoryId}::uuid
        UNION ALL
        SELECT "parent"."id", "parent"."parent_id", "parent"."slug"
        FROM "categories" AS "parent"
        JOIN "ancestors" ON "ancestors"."parent_id" = "parent"."id"
      )
      SELECT "slug" AS "root_slug"
      FROM "ancestors"
      WHERE "parent_id" IS NULL
      LIMIT 1
    `);
    const root = roots[0];
    if (root === undefined) throw new Error("Product category has no public root");

    return productDetailResponseSchema.parse(mapDetail(product, root.root_slug));
  }

  private async validateDynamicVocabulary(
    query: ProductCollectionQuery,
  ): Promise<void> {
    if (query.subcategory !== undefined) {
      const requested = uniqueSorted(query.subcategory);
      const rows = await this.prisma.category.findMany({
        where: { slug: { in: requested }, parentId: { not: null } },
        select: { slug: true },
      });
      const known = new Set(rows.map(({ slug }) => slug));
      const unknown = requested.find((slug) => !known.has(slug));
      if (unknown !== undefined) {
        invalidRequest(["subcategory"], `Unknown subcategory: ${unknown}`);
      }
    }

    for (const key of tagFacetKeys) {
      const values = query[key];
      if (values === undefined) continue;
      const requested = uniqueSorted(values);
      const rows = await this.prisma.tag.findMany({
        where: { slug: { in: requested } },
        select: { slug: true },
      });
      const known = new Set(rows.map(({ slug }) => slug));
      const unknown = requested.find((slug) => !known.has(slug));
      if (unknown !== undefined) {
        invalidRequest([key], `Unknown ${key} value: ${unknown}`);
      }
    }

    if (query.compatibility !== undefined) {
      const targets = uniqueSorted(
        query.compatibility.flatMap((value) => {
          const target = value.split("@")[0];
          return target === undefined ? [] : [target];
        }),
      );
      const rows = await this.prisma.productCompatibility.findMany({
        where: { target: { in: targets } },
        distinct: ["target"],
        select: { target: true },
      });
      const known = new Set(rows.map(({ target }) => target));
      const unknown = targets.find((target) => !known.has(target));
      if (unknown !== undefined) {
        invalidRequest(["compatibility"], `Unknown compatibility target: ${unknown}`);
      }
    }
  }
}
