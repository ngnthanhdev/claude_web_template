import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  apiErrorSchema,
} from "@marketplace/shared/api";
import {
  categoryCollectionResponseSchema,
  categorySlugSchema,
  productCollectionQuerySchema,
  productCollectionResponseSchema,
  productDetailResponseSchema,
  type ProductCollectionQuery,
  type ProductSort,
} from "@marketplace/shared/catalogue";
import { PublicationState } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodValidationPipe } from "nestjs-zod";
import { ZodError } from "zod";

import { ApiExceptionFilter } from "../common/filters/api-exception.filter.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { CatalogueController } from "./catalogue.controller.js";
import {
  CatalogueCursor,
  CatalogueCursorValidationError,
  type CatalogueCursorTuple,
} from "./catalogue-cursor.js";
import { CatalogueService } from "./catalogue.service.js";

const emptyCategories = categoryCollectionResponseSchema.parse({
  data: [],
  meta: { nextCursor: null, hasMore: false },
});
const emptyProducts = productCollectionResponseSchema.parse({
  data: [],
  meta: { nextCursor: null, hasMore: false },
});

describe("CatalogueController", () => {
  let app: NestFastifyApplication;
  const service = {
    findCategories: vi.fn().mockResolvedValue(emptyCategories),
    findProducts: vi.fn().mockResolvedValue(emptyProducts),
    findProductBySlug: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogueController],
      providers: [{ provide: CatalogueService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("delegates strict, normalized collection queries", async () => {
    await request(app.getHttpServer())
      .get(
        "/v1/products?locale=vi&currency=VND&licence=Regular&q=%20landing%20%20page%20&technology=react&technology=vue",
      )
      .expect(200);

    expect(service.findProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "vi",
        currency: "VND",
        licence: "Regular",
        q: "landing page",
        sort: "relevance",
        technology: ["react", "vue"],
        limit: 24,
      }),
    );
  });

  it.each([
    "locale=vi&extra=true",
    "locale=vi&currency=VND&licence=Regular&unknown=value",
    "locale=vi&currency=VND&licence=Regular&minPrice=50&maxPrice=10",
    "locale=vi&currency=VND&licence=Regular&limit=49",
  ])("returns the shared 422 envelope for invalid query: %s", async (query) => {
    const path = query.includes("currency")
      ? `/v1/products?${query}`
      : `/v1/categories?${query}`;
    const response = await request(app.getHttpServer()).get(path).expect(422);

    expect(apiErrorSchema.parse(JSON.parse(response.text))).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("validates product slugs before service lookup", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/products/Not-A-Slug")
      .query({ locale: "en", currency: "USD", licence: "Regular" })
      .expect(422);

    expect(apiErrorSchema.parse(JSON.parse(response.text))).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(service.findProductBySlug).not.toHaveBeenCalled();
  });
});

const baseQuery = productCollectionQuerySchema.parse(
  new URLSearchParams("locale=en&currency=USD&licence=Regular&limit=2"),
);

const cursorTuples = {
  relevance: {
    sort: "relevance",
    rank: "0.875",
    publishedAt: "2026-07-21T12:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000101",
  },
  newest: {
    sort: "newest",
    publishedAt: "2026-07-21T12:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000101",
  },
  "recently-updated": {
    sort: "recently-updated",
    updatedAt: "2026-07-21T12:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000101",
  },
  "price-asc": {
    sort: "price-asc",
    amount: 2900,
    id: "00000000-0000-4000-8000-000000000101",
  },
  "price-desc": {
    sort: "price-desc",
    amount: 2900,
    id: "00000000-0000-4000-8000-000000000101",
  },
  "title-asc": {
    sort: "title-asc",
    title: "aurora commerce",
    id: "00000000-0000-4000-8000-000000000101",
  },
} satisfies Record<ProductSort, CatalogueCursorTuple>;

describe("CatalogueCursor", () => {
  const signingSecret = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";
  const cursor = new CatalogueCursor(signingSecret);

  it.each(Object.entries(cursorTuples))(
    "round-trips the %s ordering family without exposing its secret",
    (_sort, tuple) => {
      const matchingQuery = { ...baseQuery, sort: tuple.sort };
      const token = cursor.encode(matchingQuery, tuple);

      expect(cursor.decode(token, matchingQuery)).toEqual(tuple);
      expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(token).not.toContain(signingSecret);
    },
  );

  it("rejects cursor tampering and reuse under another normalized query", () => {
    const token = cursor.encode(baseQuery, cursorTuples.newest);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    const otherQuery: ProductCollectionQuery = {
      ...baseQuery,
      category: ["wordpress"],
    };

    expect(() => cursor.decode(tampered, baseQuery)).toThrow(
      CatalogueCursorValidationError,
    );
    expect(() => cursor.decode(token, otherQuery)).toThrow(
      CatalogueCursorValidationError,
    );
  });

  it("rejects weak signing secrets", () => {
    expect(() => new CatalogueCursor("too-short")).toThrow(
      /canonical base64url for 32 bytes/i,
    );
  });
});

describe("CatalogueService boundaries", () => {
  const prisma = {
    category: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
    productCompatibility: { findMany: vi.fn() },
    product: { findFirst: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const cursors = {
    encode: vi.fn(),
    decode: vi.fn(),
  };
  let catalogue: CatalogueService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogueService,
        { provide: PrismaService, useValue: prisma },
        { provide: CatalogueCursor, useValue: cursors },
      ],
    }).compile();
    catalogue = moduleRef.get(CatalogueService);
  });

  it("fails closed when persistence cannot map a complete public response", async () => {
    prisma.category.findMany.mockResolvedValue(
      categorySlugSchema.options.map((slug, index) => ({
        slug,
        translations:
          index === 0
            ? [{ locale: "en", name: "Incomplete", summary: "Incomplete" }]
            : [
                { locale: "en", name: slug, summary: `${slug} summary` },
                { locale: "vi", name: slug, summary: `Tóm tắt ${slug}` },
              ],
      })),
    );

    await expect(catalogue.findCategories({ locale: "en" })).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("rejects unknown controlled vocabulary before database execution", async () => {
    prisma.tag.findMany.mockResolvedValue([]);
    const query: ProductCollectionQuery = {
      ...baseQuery,
      technology: ["not-in-vocabulary"],
    };

    await expect(catalogue.findProducts(query)).rejects.toMatchObject({
      message: expect.stringMatching(/validation/i),
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("keeps facet vocabularies dimensioned so one tag cannot satisfy two facets", async () => {
    prisma.tag.findMany
      .mockResolvedValueOnce([{ slug: "technology-react" }])
      .mockResolvedValueOnce([]);
    const query: ProductCollectionQuery = {
      ...baseQuery,
      technology: ["react"],
      industry: ["react"],
    };

    await expect(catalogue.findProducts(query)).rejects.toMatchObject({
      message: expect.stringMatching(/validation/i),
    });
    expect(prisma.tag.findMany).toHaveBeenNthCalledWith(1, {
      where: { slug: { in: ["technology-react"] } },
      select: { slug: true },
    });
    expect(prisma.tag.findMany).toHaveBeenNthCalledWith(2, {
      where: { slug: { in: ["industry-react"] } },
      select: { slug: true },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("scopes detail lookup to published products and hides a missing slug", async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(catalogue.findProductBySlug("missing-product")).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: "missing-product",
          publicationState: PublicationState.published,
        }),
      }),
    );
  });
});

describe("shared response fixtures", () => {
  it("keeps database-derived success fixtures schema-valid", () => {
    expect(productDetailResponseSchema.safeParse({}).success).toBe(false);
  });
});
