-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('vi', 'en');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('VND', 'USD');

-- CreateEnum
CREATE TYPE "PublicationState" AS ENUM ('draft', 'published', 'delisted');

-- CreateEnum
CREATE TYPE "LicenceIdentifier" AS ENUM ('Regular', 'Extended');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('image', 'video');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_translations" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "publication_state" "PublicationState" NOT NULL DEFAULT 'draft',
    "current_version" VARCHAR(64),
    "thumbnail_url" TEXT NOT NULL,
    "documentation_url" TEXT NOT NULL,
    "isolated_preview_url" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_translations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "product_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_tags" (
    "product_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "product_tags_pkey" PRIMARY KEY ("product_id","tag_id")
);

-- CreateTable
CREATE TABLE "product_compatibility" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "target" VARCHAR(120) NOT NULL,
    "constraint" VARCHAR(255) NOT NULL,

    CONSTRAINT "product_compatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_specifications" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,

    CONSTRAINT "product_specifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_specification_translations" (
    "id" UUID NOT NULL,
    "specification_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "product_specification_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media_translations" (
    "id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "alt" TEXT NOT NULL,

    CONSTRAINT "product_media_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_demo_pages" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "preview_url" TEXT NOT NULL,

    CONSTRAINT "product_demo_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_demo_page_translations" (
    "id" UUID NOT NULL,
    "demo_page_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" VARCHAR(240) NOT NULL,

    CONSTRAINT "product_demo_page_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_versions" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "released_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_version_translations" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "product_version_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licence_options" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "identifier" "LicenceIdentifier" NOT NULL,

    CONSTRAINT "licence_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prices" (
    "id" UUID NOT NULL,
    "licence_option_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_slug_idx" ON "categories"("parent_id", "slug");

-- CreateIndex
CREATE INDEX "category_translations_locale_name_idx" ON "category_translations"("locale", "name");

-- CreateIndex
CREATE UNIQUE INDEX "category_translations_category_id_locale_key" ON "category_translations"("category_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_publication_state_category_id_published_at_id_idx" ON "products"("publication_state", "category_id", "published_at", "id");

-- CreateIndex
CREATE INDEX "products_seller_id_publication_state_created_at_idx" ON "products"("seller_id", "publication_state", "created_at");

-- CreateIndex
CREATE INDEX "product_translations_locale_title_idx" ON "product_translations"("locale", "title");

-- CreateIndex
CREATE UNIQUE INDEX "product_translations_product_id_locale_key" ON "product_translations"("product_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "product_tags_tag_id_product_id_idx" ON "product_tags"("tag_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_compatibility_product_id_target_key" ON "product_compatibility"("product_id", "target");

-- CreateIndex
CREATE UNIQUE INDEX "product_specifications_product_id_key_key" ON "product_specifications"("product_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "product_specification_translations_specification_id_locale_key" ON "product_specification_translations"("specification_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "product_media_product_id_position_key" ON "product_media"("product_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "product_media_translations_media_id_locale_key" ON "product_media_translations"("media_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "product_demo_pages_product_id_position_key" ON "product_demo_pages"("product_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "product_demo_pages_product_id_slug_key" ON "product_demo_pages"("product_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "product_demo_page_translations_demo_page_id_locale_key" ON "product_demo_page_translations"("demo_page_id", "locale");

-- CreateIndex
CREATE INDEX "product_versions_product_id_released_at_idx" ON "product_versions"("product_id", "released_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_versions_product_id_version_key" ON "product_versions"("product_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "product_version_translations_version_id_locale_key" ON "product_version_translations"("version_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "licence_options_product_id_identifier_key" ON "licence_options"("product_id", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "prices_licence_option_id_currency_key" ON "prices"("licence_option_id", "currency");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "seller_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_compatibility" ADD CONSTRAINT "product_compatibility_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specification_translations" ADD CONSTRAINT "product_specification_translations_specification_id_fkey" FOREIGN KEY ("specification_id") REFERENCES "product_specifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media_translations" ADD CONSTRAINT "product_media_translations_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "product_media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_demo_pages" ADD CONSTRAINT "product_demo_pages_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_demo_page_translations" ADD CONSTRAINT "product_demo_page_translations_demo_page_id_fkey" FOREIGN KEY ("demo_page_id") REFERENCES "product_demo_pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_version_translations" ADD CONSTRAINT "product_version_translations_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "product_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licence_options" ADD CONSTRAINT "licence_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_licence_option_id_fkey" FOREIGN KEY ("licence_option_id") REFERENCES "licence_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Native PostgreSQL constraints for invariants Prisma cannot express.
ALTER TABLE "categories"
    ADD CONSTRAINT "categories_not_self_parented_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
    ADD CONSTRAINT "categories_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "category_translations"
    ADD CONSTRAINT "category_translations_name_not_blank_check" CHECK (btrim("name") <> ''),
    ADD CONSTRAINT "category_translations_summary_not_blank_check" CHECK (btrim("summary") <> '');

ALTER TABLE "products"
    ADD CONSTRAINT "products_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    ADD CONSTRAINT "products_current_version_semver_check" CHECK (
        "current_version" IS NULL OR
        "current_version" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
    ),
    ADD CONSTRAINT "products_publication_fields_check" CHECK (
        "publication_state" = 'draft' OR
        ("published_at" IS NOT NULL AND "current_version" IS NOT NULL)
    ),
    ADD CONSTRAINT "products_urls_not_blank_check" CHECK (
        btrim("thumbnail_url") <> '' AND
        btrim("documentation_url") <> '' AND
        btrim("isolated_preview_url") <> ''
    );

ALTER TABLE "product_translations"
    ADD CONSTRAINT "product_translations_content_not_blank_check" CHECK (
        btrim("title") <> '' AND btrim("summary") <> '' AND btrim("description") <> ''
    );

ALTER TABLE "tags"
    ADD CONSTRAINT "tags_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "product_compatibility"
    ADD CONSTRAINT "product_compatibility_target_format_check" CHECK ("target" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    ADD CONSTRAINT "product_compatibility_constraint_not_blank_check" CHECK (btrim("constraint") <> '');

ALTER TABLE "product_specifications"
    ADD CONSTRAINT "product_specifications_key_format_check" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "product_specification_translations"
    ADD CONSTRAINT "product_specification_translations_content_not_blank_check" CHECK (
        btrim("label") <> '' AND btrim("value") <> ''
    );

ALTER TABLE "product_media"
    ADD CONSTRAINT "product_media_position_nonnegative_check" CHECK ("position" >= 0),
    ADD CONSTRAINT "product_media_url_not_blank_check" CHECK (btrim("url") <> '');

ALTER TABLE "product_media_translations"
    ADD CONSTRAINT "product_media_translations_alt_not_blank_check" CHECK (btrim("alt") <> '');

ALTER TABLE "product_demo_pages"
    ADD CONSTRAINT "product_demo_pages_position_nonnegative_check" CHECK ("position" >= 0),
    ADD CONSTRAINT "product_demo_pages_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    ADD CONSTRAINT "product_demo_pages_preview_url_not_blank_check" CHECK (btrim("preview_url") <> '');

ALTER TABLE "product_demo_page_translations"
    ADD CONSTRAINT "product_demo_page_translations_title_not_blank_check" CHECK (btrim("title") <> '');

ALTER TABLE "product_versions"
    ADD CONSTRAINT "product_versions_semver_check" CHECK (
        "version" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
    );

ALTER TABLE "product_version_translations"
    ADD CONSTRAINT "product_version_translations_notes_not_blank_check" CHECK (btrim("notes") <> '');

ALTER TABLE "prices"
    ADD CONSTRAINT "prices_amount_nonnegative_check" CHECK ("amount" >= 0);

-- A product's seller is server-controlled and immutable after first publication.
-- Published or delisted records cannot be hard-deleted; delisting preserves history.
CREATE FUNCTION "preserve_published_product_history"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND OLD."publication_state" <> 'draft' THEN
        RAISE EXCEPTION 'published product history cannot be deleted';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD."publication_state" <> 'draft' THEN
        IF NEW."seller_id" <> OLD."seller_id" THEN
            RAISE EXCEPTION 'published product ownership cannot be reassigned';
        END IF;
        IF NEW."publication_state" = 'draft' THEN
            RAISE EXCEPTION 'published product cannot return to draft';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "products_preserve_published_history_trigger"
BEFORE UPDATE OR DELETE ON "products"
FOR EACH ROW EXECUTE FUNCTION "preserve_published_product_history"();

-- PostgreSQL full-text and typo-tolerant search for bilingual catalogue copy.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE INDEX "product_translations_search_vector_idx"
ON "product_translations"
USING GIN (to_tsvector('simple', "title" || ' ' || "summary" || ' ' || "description"));

CREATE INDEX "product_translations_title_trigram_idx"
ON "product_translations"
USING GIN ("title" gin_trgm_ops);

CREATE INDEX "category_translations_name_trigram_idx"
ON "category_translations"
USING GIN ("name" gin_trgm_ops);

CREATE INDEX "products_published_category_lookup_idx"
ON "products" ("category_id", "published_at" DESC, "id")
WHERE "publication_state" = 'published';

CREATE INDEX "products_published_slug_lookup_idx"
ON "products" ("slug")
WHERE "publication_state" = 'published';

-- The approved v1 top-level taxonomy. These are catalogue data, not samples.
INSERT INTO "categories" ("id", "slug", "parent_id", "created_at", "updated_at") VALUES
    ('00000000-0000-4000-8000-000000000001', 'wordpress', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000002', 'elementor', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000003', 'html', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000004', 'shopify', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000005', 'jamstack', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000006', 'marketing', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000007', 'cms', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000008', 'ecommerce', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000009', 'ui-templates', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000010', 'plugins', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "category_translations" ("id", "category_id", "locale", "name", "summary") VALUES
    ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'vi', 'WordPress', 'Mẫu website và giao diện dành cho hệ sinh thái WordPress.'),
    ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'en', 'WordPress', 'Website templates and themes for the WordPress ecosystem.'),
    ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'vi', 'Elementor', 'Mẫu website kéo thả được xây dựng cho trình tạo trang Elementor.'),
    ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'en', 'Elementor', 'Drag-and-drop website templates built for the Elementor page builder.'),
    ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', 'vi', 'HTML', 'Mẫu website HTML sẵn sàng tuỳ chỉnh và triển khai.'),
    ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000003', 'en', 'HTML', 'HTML website templates ready to customise and deploy.'),
    ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000004', 'vi', 'Shopify', 'Mẫu cửa hàng trực tuyến được thiết kế cho nền tảng Shopify.'),
    ('10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000004', 'en', 'Shopify', 'Online storefront templates designed for the Shopify platform.'),
    ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000005', 'vi', 'Jamstack', 'Mẫu website hiện đại cho kiến trúc Jamstack và triển khai tĩnh.'),
    ('10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000005', 'en', 'Jamstack', 'Modern website templates for Jamstack and static deployments.'),
    ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000006', 'vi', 'Tiếp thị', 'Mẫu trang đích và website phục vụ chiến dịch tiếp thị.'),
    ('10000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000006', 'en', 'Marketing', 'Landing-page and website templates for marketing campaigns.'),
    ('10000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000007', 'vi', 'Hệ quản trị nội dung', 'Mẫu website dành cho các nền tảng quản trị nội dung.'),
    ('10000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000007', 'en', 'CMS', 'Website templates for content management platforms.'),
    ('10000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000008', 'vi', 'Thương mại điện tử', 'Mẫu cửa hàng và trải nghiệm mua sắm trực tuyến.'),
    ('10000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000008', 'en', 'eCommerce', 'Storefront templates and online shopping experiences.'),
    ('10000000-0000-4000-8000-000000000017', '00000000-0000-4000-8000-000000000009', 'vi', 'Mẫu giao diện UI', 'Bộ giao diện và màn hình mẫu cho sản phẩm số.'),
    ('10000000-0000-4000-8000-000000000018', '00000000-0000-4000-8000-000000000009', 'en', 'UI Templates', 'Interface kits and screen templates for digital products.'),
    ('10000000-0000-4000-8000-000000000019', '00000000-0000-4000-8000-000000000010', 'vi', 'Tiện ích mở rộng', 'Tiện ích bổ sung giúp mở rộng chức năng website.'),
    ('10000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000010', 'en', 'Plugins', 'Add-ons that extend website functionality.');
