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
CREATE UNIQUE INDEX "products_id_current_version_key" ON "products"("id", "current_version");

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
ALTER TABLE "products" ADD CONSTRAINT "products_id_current_version_fkey" FOREIGN KEY ("id", "current_version") REFERENCES "product_versions"("product_id", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;

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

-- Every category may have descendants, but every hierarchy must terminate at
-- one of the ten stable public roots. The approved roots themselves are
-- immutable so a product's public category group remains deterministic.
CREATE FUNCTION "enforce_approved_category_root"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    approved_roots CONSTANT TEXT[] := ARRAY[
        'wordpress', 'elementor', 'html', 'shopify', 'jamstack',
        'marketing', 'cms', 'ecommerce', 'ui-templates', 'plugins'
    ];
    root_slug TEXT;
    has_cycle BOOLEAN := FALSE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD."parent_id" IS NULL AND OLD."slug" = ANY(approved_roots) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'approved top-level category roots cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD."parent_id" IS NULL
       AND OLD."slug" = ANY(approved_roots)
       AND (NEW."parent_id" IS NOT NULL OR NEW."slug" <> OLD."slug") THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'approved top-level category roots cannot be renamed or reparented';
    END IF;

    IF NEW."parent_id" IS NULL THEN
        root_slug := NEW."slug";
    ELSE
        WITH RECURSIVE ancestors AS (
            SELECT
                category."id",
                category."parent_id",
                category."slug",
                ARRAY[NEW."id", category."id"]::UUID[] AS path,
                category."id" = NEW."id" AS cycle
            FROM "categories" AS category
            WHERE category."id" = NEW."parent_id"

            UNION ALL

            SELECT
                parent."id",
                parent."parent_id",
                parent."slug",
                ancestors.path || parent."id",
                parent."id" = ANY(ancestors.path)
            FROM "categories" AS parent
            JOIN ancestors ON parent."id" = ancestors."parent_id"
            WHERE NOT ancestors.cycle
        )
        SELECT
            COALESCE(bool_or(ancestors.cycle), FALSE),
            max(ancestors."slug") FILTER (WHERE ancestors."parent_id" IS NULL)
        INTO has_cycle, root_slug
        FROM ancestors;
    END IF;

    IF has_cycle OR root_slug IS NULL OR NOT (root_slug = ANY(approved_roots)) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'category hierarchy must terminate at an approved top-level root';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "categories_enforce_approved_root_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "categories"
FOR EACH ROW EXECUTE FUNCTION "enforce_approved_category_root"();

-- Publication is a database-enforced transition: the complete public card
-- and detail response must be constructible before a product leaves draft.
CREATE FUNCTION "assert_product_publication_ready"("target_product_id" UUID) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    product_state "PublicationState";
    selected_version VARCHAR(64);
    row_count BIGINT;
    vi_count BIGINT;
    en_count BIGINT;
    first_position INTEGER;
    last_position INTEGER;
BEGIN
    SELECT "publication_state", "current_version"
    INTO product_state, selected_version
    FROM "products"
    WHERE "id" = target_product_id;

    IF NOT FOUND OR product_state = 'draft' THEN
        RETURN;
    END IF;

    IF selected_version IS NULL OR NOT EXISTS (
        SELECT 1
        FROM "product_versions"
        WHERE "product_id" = target_product_id AND "version" = selected_version
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'published product requires a current version owned by that product';
    END IF;

    SELECT
        count(*),
        count(*) FILTER (WHERE "locale" = 'vi'),
        count(*) FILTER (WHERE "locale" = 'en')
    INTO row_count, vi_count, en_count
    FROM "product_translations"
    WHERE "product_id" = target_product_id;
    IF row_count <> 2 OR vi_count <> 1 OR en_count <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'published product requires complete vi/en translations';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "product_versions" WHERE "product_id" = target_product_id
    ) OR EXISTS (
        SELECT 1
        FROM "product_versions" AS version
        LEFT JOIN "product_version_translations" AS translation
            ON translation."version_id" = version."id"
        WHERE version."product_id" = target_product_id
        GROUP BY version."id"
        HAVING count(translation."id") <> 2
            OR count(translation."id") FILTER (WHERE translation."locale" = 'vi') <> 1
            OR count(translation."id") FILTER (WHERE translation."locale" = 'en') <> 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'published product requires bilingual changelog notes for every version';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "product_compatibility" WHERE "product_id" = target_product_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'published product requires compatibility data';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "product_specifications" WHERE "product_id" = target_product_id
    ) OR EXISTS (
        SELECT 1
        FROM "product_specifications" AS specification
        LEFT JOIN "product_specification_translations" AS translation
            ON translation."specification_id" = specification."id"
        WHERE specification."product_id" = target_product_id
        GROUP BY specification."id"
        HAVING count(translation."id") <> 2
            OR count(translation."id") FILTER (WHERE translation."locale" = 'vi') <> 1
            OR count(translation."id") FILTER (WHERE translation."locale" = 'en') <> 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'published product requires localized specifications';
    END IF;

    SELECT count(*), min("position"), max("position")
    INTO row_count, first_position, last_position
    FROM "product_media"
    WHERE "product_id" = target_product_id;
    IF row_count = 0 OR first_position <> 0 OR last_position <> row_count - 1 OR EXISTS (
        SELECT 1
        FROM "product_media" AS media
        LEFT JOIN "product_media_translations" AS translation
            ON translation."media_id" = media."id"
        WHERE media."product_id" = target_product_id
        GROUP BY media."id"
        HAVING count(translation."id") <> 2
            OR count(translation."id") FILTER (WHERE translation."locale" = 'vi') <> 1
            OR count(translation."id") FILTER (WHERE translation."locale" = 'en') <> 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'published product requires contiguous localized media';
    END IF;

    SELECT count(*), min("position"), max("position")
    INTO row_count, first_position, last_position
    FROM "product_demo_pages"
    WHERE "product_id" = target_product_id;
    IF row_count = 0 OR first_position <> 0 OR last_position <> row_count - 1 OR EXISTS (
        SELECT 1
        FROM "product_demo_pages" AS demo
        LEFT JOIN "product_demo_page_translations" AS translation
            ON translation."demo_page_id" = demo."id"
        WHERE demo."product_id" = target_product_id
        GROUP BY demo."id"
        HAVING count(translation."id") <> 2
            OR count(translation."id") FILTER (WHERE translation."locale" = 'vi') <> 1
            OR count(translation."id") FILTER (WHERE translation."locale" = 'en') <> 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'published product requires contiguous localized demo pages';
    END IF;

    IF (SELECT count(*) FROM "licence_options" WHERE "product_id" = target_product_id) <> 2
       OR EXISTS (
            SELECT 1
            FROM "licence_options" AS licence
            LEFT JOIN "prices" AS price ON price."licence_option_id" = licence."id"
            WHERE licence."product_id" = target_product_id
            GROUP BY licence."id"
            HAVING count(price."id") <> 2
                OR count(price."id") FILTER (WHERE price."currency" = 'VND') <> 1
                OR count(price."id") FILTER (WHERE price."currency" = 'USD') <> 1
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'published product requires Regular/Extended licences with VND/USD prices';
    END IF;
END;
$$;

-- Resolve the owning product for any catalogue row and re-check readiness at
-- transaction commit. This prevents post-publication deletes or partial edits
-- while still allowing an atomic transaction to add a complete new version.
CREATE FUNCTION "enforce_product_publication_readiness"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    old_product_id UUID;
    new_product_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'products' THEN
        IF TG_OP <> 'INSERT' THEN old_product_id := OLD."id"; END IF;
        IF TG_OP <> 'DELETE' THEN new_product_id := NEW."id"; END IF;
    ELSIF TG_TABLE_NAME IN (
        'product_translations', 'product_compatibility', 'product_specifications',
        'product_media', 'product_demo_pages', 'product_versions', 'licence_options'
    ) THEN
        IF TG_OP <> 'INSERT' THEN old_product_id := OLD."product_id"; END IF;
        IF TG_OP <> 'DELETE' THEN new_product_id := NEW."product_id"; END IF;
    ELSIF TG_TABLE_NAME = 'product_specification_translations' THEN
        IF TG_OP <> 'INSERT' THEN
            SELECT "product_id" INTO old_product_id FROM "product_specifications" WHERE "id" = OLD."specification_id";
        END IF;
        IF TG_OP <> 'DELETE' THEN
            SELECT "product_id" INTO new_product_id FROM "product_specifications" WHERE "id" = NEW."specification_id";
        END IF;
    ELSIF TG_TABLE_NAME = 'product_media_translations' THEN
        IF TG_OP <> 'INSERT' THEN
            SELECT "product_id" INTO old_product_id FROM "product_media" WHERE "id" = OLD."media_id";
        END IF;
        IF TG_OP <> 'DELETE' THEN
            SELECT "product_id" INTO new_product_id FROM "product_media" WHERE "id" = NEW."media_id";
        END IF;
    ELSIF TG_TABLE_NAME = 'product_demo_page_translations' THEN
        IF TG_OP <> 'INSERT' THEN
            SELECT "product_id" INTO old_product_id FROM "product_demo_pages" WHERE "id" = OLD."demo_page_id";
        END IF;
        IF TG_OP <> 'DELETE' THEN
            SELECT "product_id" INTO new_product_id FROM "product_demo_pages" WHERE "id" = NEW."demo_page_id";
        END IF;
    ELSIF TG_TABLE_NAME = 'product_version_translations' THEN
        IF TG_OP <> 'INSERT' THEN
            SELECT "product_id" INTO old_product_id FROM "product_versions" WHERE "id" = OLD."version_id";
        END IF;
        IF TG_OP <> 'DELETE' THEN
            SELECT "product_id" INTO new_product_id FROM "product_versions" WHERE "id" = NEW."version_id";
        END IF;
    ELSIF TG_TABLE_NAME = 'prices' THEN
        IF TG_OP <> 'INSERT' THEN
            SELECT "product_id" INTO old_product_id FROM "licence_options" WHERE "id" = OLD."licence_option_id";
        END IF;
        IF TG_OP <> 'DELETE' THEN
            SELECT "product_id" INTO new_product_id FROM "licence_options" WHERE "id" = NEW."licence_option_id";
        END IF;
    END IF;

    IF old_product_id IS NOT NULL THEN
        PERFORM "assert_product_publication_ready"(old_product_id);
    END IF;
    IF new_product_id IS NOT NULL AND new_product_id IS DISTINCT FROM old_product_id THEN
        PERFORM "assert_product_publication_ready"(new_product_id);
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "products_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "products"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "product_translations_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "product_translations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "product_compatibility_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "product_compatibility"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "product_specifications_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "product_specifications"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "product_specification_translations_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "product_specification_translations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "product_media_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "product_media"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "product_media_translations_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "product_media_translations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "product_demo_pages_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "product_demo_pages"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "product_demo_page_translations_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "product_demo_page_translations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "product_versions_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "product_versions"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "product_version_translations_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "product_version_translations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "licence_options_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "licence_options"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

CREATE CONSTRAINT TRIGGER "prices_publication_readiness_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "prices"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "enforce_product_publication_readiness"();

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
