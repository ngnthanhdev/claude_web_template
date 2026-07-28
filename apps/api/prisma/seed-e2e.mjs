// Disposable-database seed for the Playwright e2e / completion-gate run only.
//
// The public catalogue API is read-only (no write endpoints), so the e2e suite
// needs its fixture rows inserted at the Prisma level. The ten root categories
// (incl. "wordpress") and their bilingual translations already exist from the
// `catalogue_read_model` migration; this only adds a seller plus the published
// products the specs drive against (SEEDED_CATEGORY="wordpress",
// MIN_SEEDED_PRODUCTS_IN_CATEGORY=3 — see apps/web/e2e/fixtures/test-catalogue.ts).
//
// Plain ESM (.mjs) on purpose: apps/api ships no tsx/ts-node, so this runs with
// a bare `node prisma/seed-e2e.mjs` against a DATABASE_URL pointing at a
// throwaway database. Never point it at a shared or production database.
import {
  Currency,
  LicenceIdentifier,
  Locale,
  PrismaClient,
  PublicationState,
} from "@prisma/client";

// Seeded by the catalogue_read_model migration as a root category.
const WORDPRESS_ROOT_ID = "00000000-0000-4000-8000-000000000001";

const SELLER_OWNER_ID = "a0000000-0000-4000-8000-000000000001";
const SELLER_PROFILE_ID = "a0000000-0000-4000-8000-000000000002";

// First slug word doubles as the search term the en browse spec derives
// (deriveSearchTermFromSlug), so each title contains it for the trigram search.
const PRODUCTS = [
  {
    id: "b0000000-0000-4000-8000-000000000001",
    slug: "aurora-storefront",
    en: "Aurora Storefront",
    vi: "Mẫu Aurora Storefront",
  },
  {
    id: "b0000000-0000-4000-8000-000000000002",
    slug: "lumen-journal",
    en: "Lumen Journal",
    vi: "Mẫu Lumen Journal",
  },
  {
    id: "b0000000-0000-4000-8000-000000000003",
    slug: "vertex-portfolio",
    en: "Vertex Portfolio",
    vi: "Mẫu Vertex Portfolio",
  },
];

function productData({ id, slug, en, vi }) {
  return {
    id,
    sellerId: SELLER_PROFILE_ID,
    categoryId: WORDPRESS_ROOT_ID,
    slug,
    thumbnailUrl: `https://assets.example.com/${slug}/thumbnail.webp`,
    documentationUrl: `https://docs.example.com/${slug}`,
    isolatedPreviewUrl: `https://preview.example.com/${slug}`,
    translations: {
      create: [
        {
          locale: Locale.vi,
          title: vi,
          summary: `Tóm tắt cho ${vi}`,
          description: `Mô tả chi tiết cho ${vi} — mẫu website WordPress.`,
        },
        {
          locale: Locale.en,
          title: en,
          summary: `Summary for ${en}`,
          description: `Detailed description for ${en} — a WordPress website template.`,
        },
      ],
    },
    versions: {
      create: [
        {
          version: "1.0.0",
          releasedAt: new Date("2026-07-01T00:00:00.000Z"),
          translations: {
            create: [
              { locale: Locale.vi, notes: "Phát hành đầu tiên" },
              { locale: Locale.en, notes: "Initial release" },
            ],
          },
        },
      ],
    },
    compatibility: { create: [{ target: "wordpress", constraint: "6.x" }] },
    specifications: {
      create: [
        {
          key: "framework",
          translations: {
            create: [
              { locale: Locale.vi, label: "Nền tảng", value: "WordPress" },
              { locale: Locale.en, label: "Framework", value: "WordPress" },
            ],
          },
        },
      ],
    },
    media: {
      create: [
        {
          position: 0,
          kind: "image",
          url: `https://assets.example.com/${slug}/screen.webp`,
          translations: {
            create: [
              { locale: Locale.vi, alt: `Ảnh ${vi}` },
              { locale: Locale.en, alt: `${en} screenshot` },
            ],
          },
        },
      ],
    },
    demoPages: {
      create: [
        {
          position: 0,
          slug: "home",
          previewUrl: `https://preview.example.com/${slug}/home`,
          translations: {
            create: [
              { locale: Locale.vi, title: "Trang chủ" },
              { locale: Locale.en, title: "Home" },
            ],
          },
        },
      ],
    },
    licenceOptions: {
      create: [
        {
          identifier: LicenceIdentifier.Regular,
          prices: {
            create: [
              { currency: Currency.VND, amount: 1_000_000 },
              { currency: Currency.USD, amount: 49 },
            ],
          },
        },
        {
          identifier: LicenceIdentifier.Extended,
          prices: {
            create: [
              { currency: Currency.VND, amount: 2_000_000 },
              { currency: Currency.USD, amount: 99 },
            ],
          },
        },
      ],
    },
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.user.create({
      data: { id: SELLER_OWNER_ID, normalizedEmail: "e2e-seller@example.com" },
    });
    await prisma.sellerProfile.create({
      data: {
        id: SELLER_PROFILE_ID,
        ownerId: SELLER_OWNER_ID,
        slug: "e2e-templates",
      },
    });

    for (const product of PRODUCTS) {
      await prisma.product.create({ data: productData(product) });
      await prisma.product.update({
        where: { id: product.id },
        data: {
          currentVersion: "1.0.0",
          publicationState: PublicationState.published,
          publishedAt: new Date("2026-07-02T00:00:00.000Z"),
        },
      });
    }

    const published = await prisma.product.count({
      where: {
        publicationState: PublicationState.published,
        categoryId: WORDPRESS_ROOT_ID,
      },
    });
    console.log(`Seeded ${published} published product(s) under "wordpress".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
