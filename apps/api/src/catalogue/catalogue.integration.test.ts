import { VersioningType } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  Currency,
  LicenceIdentifier,
  Locale,
  PrismaClient,
  PublicationState,
  type Prisma,
} from "@prisma/client";
import { apiErrorSchema } from "@marketplace/shared/api";
import {
  categoryCollectionResponseSchema,
  productCollectionResponseSchema,
  productDetailResponseSchema,
  type ProductSort,
} from "@marketplace/shared/catalogue";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodValidationPipe } from "nestjs-zod";

import { ApiExceptionFilter } from "../common/filters/api-exception.filter.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { CatalogueModule } from "./catalogue.module.js";

const integrationDatabaseUrl =
  process.env.CATALOGUE_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

const ids = {
  owner: "20000000-0000-4000-8000-000000000001",
  seller: "20000000-0000-4000-8000-000000000002",
  elementorKits: "20000000-0000-4000-8000-000000000003",
  htmlPortfolio: "20000000-0000-4000-8000-000000000004",
} as const;

type ProductFixture = {
  ordinal: number;
  slug: string;
  categoryId: string;
  state: PublicationState;
  enTitle: string;
  viTitle: string;
  tags: readonly string[];
  compatibilityTarget: string;
  compatibilityConstraint: string;
  regularVnd: number;
  regularUsd: number;
  extendedVnd: number;
  extendedUsd: number;
  publishedAt: Date;
  updatedAt: Date;
};

function uuid(group: number, ordinal: number): string {
  return `${group.toString().padStart(8, "0")}-0000-4000-8000-${ordinal
    .toString()
    .padStart(12, "0")}`;
}

async function createCompleteProduct(
  tx: Prisma.TransactionClient,
  fixture: ProductFixture,
): Promise<void> {
  const productId = uuid(30, fixture.ordinal);
  const versionId = uuid(31, fixture.ordinal);
  const specificationId = uuid(32, fixture.ordinal);
  const mediaId = uuid(33, fixture.ordinal);
  const demoId = uuid(34, fixture.ordinal);
  const regularLicenceId = uuid(35, fixture.ordinal * 10 + 1);
  const extendedLicenceId = uuid(35, fixture.ordinal * 10 + 2);

  await tx.product.create({
    data: {
      id: productId,
      sellerId: ids.seller,
      categoryId: fixture.categoryId,
      slug: fixture.slug,
      thumbnailUrl: `https://assets.example.com/${fixture.slug}/thumbnail.webp`,
      documentationUrl: `https://docs.example.com/${fixture.slug}`,
      isolatedPreviewUrl: `https://preview.example.com/${fixture.slug}`,
      publishedAt: fixture.publishedAt,
      translations: {
        create: [
          {
            id: uuid(40, fixture.ordinal * 10 + 1),
            locale: Locale.vi,
            title: fixture.viTitle,
            summary: `Tóm tắt ${fixture.viTitle}`,
            description: `Mô tả chi tiết ${fixture.viTitle}`,
          },
          {
            id: uuid(40, fixture.ordinal * 10 + 2),
            locale: Locale.en,
            title: fixture.enTitle,
            summary: `Summary for ${fixture.enTitle}`,
            description: `Detailed description for ${fixture.enTitle}`,
          },
        ],
      },
      tags: {
        create: fixture.tags.map((slug) => ({
          tag: { connect: { slug } },
        })),
      },
    },
  });

  await tx.productVersion.create({
    data: {
      id: versionId,
      productId,
      version: "1.0.0",
      releasedAt: fixture.publishedAt,
      translations: {
        create: [
          {
            id: uuid(41, fixture.ordinal * 10 + 1),
            locale: Locale.vi,
            notes: "Phát hành đầu tiên",
          },
          {
            id: uuid(41, fixture.ordinal * 10 + 2),
            locale: Locale.en,
            notes: "Initial release",
          },
        ],
      },
    },
  });
  await tx.productCompatibility.create({
    data: {
      id: uuid(42, fixture.ordinal),
      productId,
      target: fixture.compatibilityTarget,
      constraint: fixture.compatibilityConstraint,
    },
  });
  await tx.productSpecification.create({
    data: {
      id: specificationId,
      productId,
      key: "framework",
      translations: {
        create: [
          {
            id: uuid(43, fixture.ordinal * 10 + 1),
            locale: Locale.vi,
            label: "Nền tảng",
            value: fixture.compatibilityTarget,
          },
          {
            id: uuid(43, fixture.ordinal * 10 + 2),
            locale: Locale.en,
            label: "Framework",
            value: fixture.compatibilityTarget,
          },
        ],
      },
    },
  });
  await tx.productMedia.create({
    data: {
      id: mediaId,
      productId,
      position: 0,
      kind: "image",
      url: `https://assets.example.com/${fixture.slug}/screen.webp`,
      translations: {
        create: [
          {
            id: uuid(44, fixture.ordinal * 10 + 1),
            locale: Locale.vi,
            alt: `Ảnh ${fixture.viTitle}`,
          },
          {
            id: uuid(44, fixture.ordinal * 10 + 2),
            locale: Locale.en,
            alt: `${fixture.enTitle} screenshot`,
          },
        ],
      },
    },
  });
  await tx.productDemoPage.create({
    data: {
      id: demoId,
      productId,
      position: 0,
      slug: "home",
      previewUrl: `https://preview.example.com/${fixture.slug}/home`,
      translations: {
        create: [
          {
            id: uuid(45, fixture.ordinal * 10 + 1),
            locale: Locale.vi,
            title: "Trang chủ",
          },
          {
            id: uuid(45, fixture.ordinal * 10 + 2),
            locale: Locale.en,
            title: "Home",
          },
        ],
      },
    },
  });
  await tx.licenceOption.create({
    data: {
      id: regularLicenceId,
      productId,
      identifier: LicenceIdentifier.Regular,
      prices: {
        create: [
          {
            id: uuid(46, fixture.ordinal * 100 + 1),
            currency: Currency.VND,
            amount: fixture.regularVnd,
          },
          {
            id: uuid(46, fixture.ordinal * 100 + 2),
            currency: Currency.USD,
            amount: fixture.regularUsd,
          },
        ],
      },
    },
  });
  await tx.licenceOption.create({
    data: {
      id: extendedLicenceId,
      productId,
      identifier: LicenceIdentifier.Extended,
      prices: {
        create: [
          {
            id: uuid(46, fixture.ordinal * 100 + 3),
            currency: Currency.VND,
            amount: fixture.extendedVnd,
          },
          {
            id: uuid(46, fixture.ordinal * 100 + 4),
            currency: Currency.USD,
            amount: fixture.extendedUsd,
          },
        ],
      },
    },
  });

  if (fixture.state === PublicationState.draft) return;
  await tx.product.update({
    where: { id: productId },
    data: {
      currentVersion: "1.0.0",
      publicationState: PublicationState.published,
      publishedAt: fixture.publishedAt,
      updatedAt: fixture.updatedAt,
    },
  });
  if (fixture.state === PublicationState.delisted) {
    await tx.product.update({
      where: { id: productId },
      data: {
        publicationState: PublicationState.delisted,
        updatedAt: fixture.updatedAt,
      },
    });
  }
}

async function seedCatalogue(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: { id: ids.owner, normalizedEmail: "catalogue@example.com" },
    });
    await tx.sellerProfile.create({
      data: { id: ids.seller, ownerId: ids.owner, slug: "kitvera" },
    });
    await tx.category.createMany({
      data: [
        {
          id: ids.elementorKits,
          slug: "elementor-kits",
          parentId: "00000000-0000-4000-8000-000000000002",
        },
        {
          id: ids.htmlPortfolio,
          slug: "html-portfolio",
          parentId: "00000000-0000-4000-8000-000000000003",
        },
      ],
    });
    await tx.tag.createMany({
      data: [
        { slug: "technology-react" },
        { slug: "technology-vue" },
        { slug: "page-type-landing-page" },
        { slug: "page-type-portfolio" },
        { slug: "industry-saas" },
        { slug: "industry-agency" },
        { slug: "feature-fast-loading" },
      ],
    });

    const now = Date.now();
    await createCompleteProduct(tx, {
      ordinal: 1,
      slug: "aurora-landing",
      categoryId: ids.elementorKits,
      state: PublicationState.published,
      enTitle: "Aurora Landing Template",
      viTitle: "Mẫu Ánh Dương",
      tags: [
        "technology-react",
        "page-type-landing-page",
        "industry-saas",
        "feature-fast-loading",
      ],
      compatibilityTarget: "wordpress",
      compatibilityConstraint: "6.x",
      regularVnd: 1_000_000,
      regularUsd: 49,
      extendedVnd: 2_000_000,
      extendedUsd: 99,
      publishedAt: new Date(now - 2 * 86_400_000),
      updatedAt: new Date(now - 12 * 3_600_000),
    });
    await createCompleteProduct(tx, {
      ordinal: 2,
      slug: "cobalt-portfolio",
      categoryId: ids.htmlPortfolio,
      state: PublicationState.published,
      enTitle: "Cobalt Portfolio Template",
      viTitle: "Mẫu Hồ Sơ Cobalt",
      tags: [
        "technology-vue",
        "page-type-portfolio",
        "industry-agency",
      ],
      compatibilityTarget: "html5",
      compatibilityConstraint: "1.x",
      regularVnd: 2_000_000,
      regularUsd: 79,
      extendedVnd: 3_000_000,
      extendedUsd: 159,
      publishedAt: new Date(now - 86_400_000),
      updatedAt: new Date(now - 40 * 86_400_000),
    });
    await createCompleteProduct(tx, {
      ordinal: 3,
      slug: "private-draft",
      categoryId: ids.elementorKits,
      state: PublicationState.draft,
      enTitle: "Private Draft Template",
      viTitle: "Mẫu nháp riêng tư",
      tags: ["technology-react", "industry-saas"],
      compatibilityTarget: "wordpress",
      compatibilityConstraint: "6.x",
      regularVnd: 100,
      regularUsd: 1,
      extendedVnd: 200,
      extendedUsd: 2,
      publishedAt: new Date(now),
      updatedAt: new Date(now),
    });
    await createCompleteProduct(tx, {
      ordinal: 4,
      slug: "retired-template",
      categoryId: ids.elementorKits,
      state: PublicationState.delisted,
      enTitle: "Retired Template",
      viTitle: "Mẫu đã gỡ",
      tags: ["technology-react", "page-type-landing-page"],
      compatibilityTarget: "wordpress",
      compatibilityConstraint: "6.x",
      regularVnd: 500_000,
      regularUsd: 19,
      extendedVnd: 900_000,
      extendedUsd: 39,
      publishedAt: new Date(now - 3 * 86_400_000),
      updatedAt: new Date(now - 2 * 86_400_000),
    });
  });
}

describeWithPostgres("Catalogue PostgreSQL integration", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) return;
    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();
    await seedCatalogue(prisma);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({
            CATALOGUE_CURSOR_SIGNING_SECRET:
              "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY",
          })],
        }),
        PrismaModule,
        CatalogueModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 30_000);

  afterAll(async () => {
    if (integrationDatabaseUrl === undefined) return;
    await app.close();
    await prisma.$disconnect();
  });

  it("returns deterministic seeded roots with complete bilingual translations", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/categories?locale=vi")
      .expect(200);
    const body = categoryCollectionResponseSchema.parse(
      JSON.parse(response.text),
    );

    expect(body.data).toHaveLength(10);
    expect(body.data.map(({ slug }) => slug)).toEqual([
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
    expect(body.data.every(({ translations }) => translations.length === 2)).toBe(true);
  });

  it("returns only published products and maps collection/detail through shared schemas", async () => {
    const collectionResponse = await request(app.getHttpServer())
      .get("/v1/products?locale=en&currency=USD&licence=Regular&limit=48")
      .expect(200);
    const collection = productCollectionResponseSchema.parse(
      JSON.parse(collectionResponse.text),
    );

    expect(collection.data.map(({ slug }) => slug).sort()).toEqual([
      "aurora-landing",
      "cobalt-portfolio",
    ]);
    expect(collectionResponse.text).not.toContain("sellerId");
    expect(collectionResponse.text).not.toContain("normalizedEmail");

    const detailResponse = await request(app.getHttpServer())
      .get("/v1/products/aurora-landing")
      .expect(200);
    const detail = productDetailResponseSchema.parse(
      JSON.parse(detailResponse.text),
    );
    expect(detail.slug).toBe("aurora-landing");
    expect(detail.translations).toHaveLength(2);
    expect(detail.licenceOptions).toHaveLength(2);
  });

  it.each(["private-draft", "retired-template", "unknown-product"])(
    "hides the non-public product %s behind 404",
    async (slug) => {
      await request(app.getHttpServer())
        .get(`/v1/products/${slug}`)
        .expect(404);
    },
  );

  it("implements OR-within and AND-across controlled facets", async () => {
    const orResponse = await request(app.getHttpServer())
      .get(
        "/v1/products?locale=en&currency=USD&licence=Regular&technology=react&technology=vue",
      )
      .expect(200);
    const orBody = productCollectionResponseSchema.parse(JSON.parse(orResponse.text));
    expect(orBody.data).toHaveLength(2);

    const andResponse = await request(app.getHttpServer())
      .get(
        "/v1/products?locale=en&currency=USD&licence=Regular&technology=react&pageType=portfolio",
      )
      .expect(200);
    const andBody = productCollectionResponseSchema.parse(
      JSON.parse(andResponse.text),
    );
    expect(andBody.data).toEqual([]);

    const multiDimensionResponse = await request(app.getHttpServer())
      .get(
        "/v1/products?locale=en&currency=USD&licence=Regular&technology=react&industry=saas&pageType=landing-page&feature=fast-loading",
      )
      .expect(200);
    expect(
      productCollectionResponseSchema.parse(
        JSON.parse(multiDimensionResponse.text),
      ).data.map(({ slug }) => slug),
    ).toEqual(["aurora-landing"]);

    const categoryResponse = await request(app.getHttpServer())
      .get(
        "/v1/products?locale=en&currency=USD&licence=Regular&category=elementor&subcategory=elementor-kits&industry=saas&compatibility=wordpress%406.x",
      )
      .expect(200);
    expect(
      productCollectionResponseSchema.parse(JSON.parse(categoryResponse.text)).data.map(
        ({ slug }) => slug,
      ),
    ).toEqual(["aurora-landing"]);
  });

  it("uses locale search plus selected licence/currency price ranges without leakage", async () => {
    const accentResponse = await request(app.getHttpServer())
      .get(
        "/v1/products?locale=vi&currency=VND&licence=Regular&q=anh%20duong",
      )
      .expect(200);
    expect(
      productCollectionResponseSchema.parse(JSON.parse(accentResponse.text)).data.map(
        ({ slug }) => slug,
      ),
    ).toEqual(["aurora-landing"]);

    const localeResponse = await request(app.getHttpServer())
      .get(
        "/v1/products?locale=en&currency=USD&licence=Regular&q=anh%20duong",
      )
      .expect(200);
    expect(
      productCollectionResponseSchema.parse(JSON.parse(localeResponse.text)).data,
    ).toEqual([]);

    const vndResponse = await request(app.getHttpServer())
      .get(
        "/v1/products?locale=en&currency=VND&licence=Regular&minPrice=1500000",
      )
      .expect(200);
    expect(
      productCollectionResponseSchema.parse(JSON.parse(vndResponse.text)).data.map(
        ({ slug }) => slug,
      ),
    ).toEqual(["cobalt-portfolio"]);

    const extendedUsdResponse = await request(app.getHttpServer())
      .get(
        "/v1/products?locale=en&currency=USD&licence=Extended&maxPrice=100",
      )
      .expect(200);
    expect(
      productCollectionResponseSchema.parse(
        JSON.parse(extendedUsdResponse.text),
      ).data.map(({ slug }) => slug),
    ).toEqual(["aurora-landing"]);

    const recentlyUpdatedResponse = await request(app.getHttpServer())
      .get(
        "/v1/products?locale=en&currency=USD&licence=Regular&updatedWithin=30d",
      )
      .expect(200);
    expect(
      productCollectionResponseSchema.parse(
        JSON.parse(recentlyUpdatedResponse.text),
      ).data.map(({ slug }) => slug),
    ).toEqual(["aurora-landing"]);
  });

  it.each([
    "technology=unknown-tag",
    "subcategory=unknown-subcategory",
    "compatibility=unknown-target%401.x",
  ])("rejects unknown dynamic vocabulary: %s", async (facet) => {
    const response = await request(app.getHttpServer())
      .get(
        `/v1/products?locale=en&currency=USD&licence=Regular&${facet}`,
      )
      .expect(422);
    expect(apiErrorSchema.parse(JSON.parse(response.text))).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects reuse of a valid technology value in the industry dimension", async () => {
    const response = await request(app.getHttpServer())
      .get(
        "/v1/products?locale=en&currency=USD&licence=Regular&technology=react&industry=react",
      )
      .expect(422);
    expect(apiErrorSchema.parse(JSON.parse(response.text))).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it.each([
    ["relevance", "&q=template"],
    ["newest", ""],
    ["recently-updated", ""],
    ["price-asc", ""],
    ["price-desc", ""],
    ["title-asc", ""],
  ] satisfies readonly (readonly [ProductSort, string])[])(
    "continues the deterministic %s sort with an authenticated cursor",
    async (sort, extra) => {
      const base = `/v1/products?locale=en&currency=USD&licence=Regular&limit=1&sort=${sort}${extra}`;
      const firstResponse = await request(app.getHttpServer()).get(base).expect(200);
      const first = productCollectionResponseSchema.parse(
        JSON.parse(firstResponse.text),
      );
      expect(first.meta.hasMore).toBe(true);
      expect(first.meta.nextCursor).not.toBeNull();

      const secondResponse = await request(app.getHttpServer())
        .get(`${base}&cursor=${encodeURIComponent(first.meta.nextCursor ?? "")}`)
        .expect(200);
      const second = productCollectionResponseSchema.parse(
        JSON.parse(secondResponse.text),
      );
      expect(second.data).toHaveLength(1);
      expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
      expect(second.meta.hasMore).toBe(false);
    },
  );

  it("rejects modified and cross-filter cursor replay with 422", async () => {
    const base =
      "/v1/products?locale=en&currency=USD&licence=Regular&limit=1&sort=newest";
    const firstResponse = await request(app.getHttpServer()).get(base).expect(200);
    const first = productCollectionResponseSchema.parse(
      JSON.parse(firstResponse.text),
    );
    const cursor = first.meta.nextCursor ?? "";
    const tampered = `${cursor.slice(0, -1)}${cursor.endsWith("a") ? "b" : "a"}`;

    for (const path of [
      `${base}&cursor=${encodeURIComponent(tampered)}`,
      `${base}&category=html&cursor=${encodeURIComponent(cursor)}`,
    ]) {
      const response = await request(app.getHttpServer()).get(path).expect(422);
      expect(apiErrorSchema.parse(JSON.parse(response.text))).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });
});
