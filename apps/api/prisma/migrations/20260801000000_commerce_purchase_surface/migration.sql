-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'settled', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('pending', 'settled', 'failed');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('sandbox');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "subtotal_minor" INTEGER NOT NULL,
    "discount_minor" INTEGER NOT NULL,
    "total_minor" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_snapshots" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "licence_identifier" "LicenceIdentifier" NOT NULL,
    "title_snapshot" VARCHAR(240) NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,

    CONSTRAINT "order_item_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'sandbox',
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ(3),

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "order_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_events" (
    "id" UUID NOT NULL,
    "entitlement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_ip_digest" VARCHAR(64) NOT NULL,

    CONSTRAINT "download_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_id_idx" ON "orders"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "order_item_snapshots_order_id_idx" ON "order_item_snapshots"("order_id");

-- CreateIndex
CREATE INDEX "payment_attempts_order_id_idx" ON "payment_attempts"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_user_id_product_id_key" ON "entitlements"("user_id", "product_id");

-- CreateIndex
CREATE INDEX "entitlements_user_id_created_at_id_idx" ON "entitlements"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "download_events_entitlement_id_issued_at_id_idx" ON "download_events"("entitlement_id", "issued_at", "id");

-- CreateIndex
CREATE INDEX "download_events_user_id_issued_at_id_idx" ON "download_events"("user_id", "issued_at", "id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_snapshots" ADD CONSTRAINT "order_item_snapshots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_snapshots" ADD CONSTRAINT "order_item_snapshots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Native PostgreSQL constraints for invariants Prisma cannot express.
ALTER TABLE "orders"
    ADD CONSTRAINT "orders_idempotency_key_not_blank_check" CHECK (btrim("idempotency_key") <> ''),
    ADD CONSTRAINT "orders_amounts_check" CHECK (
        "subtotal_minor" >= 0
        AND "discount_minor" >= 0
        AND "discount_minor" <= "subtotal_minor"
        AND "total_minor" = "subtotal_minor" - "discount_minor"
    ),
    ADD CONSTRAINT "orders_settled_at_state_check" CHECK (
        ("status" = 'settled') = ("settled_at" IS NOT NULL)
    );

ALTER TABLE "order_item_snapshots"
    ADD CONSTRAINT "order_item_snapshots_title_not_blank_check" CHECK (btrim("title_snapshot") <> ''),
    ADD CONSTRAINT "order_item_snapshots_unit_price_minor_check" CHECK ("unit_price_minor" >= 0);

ALTER TABLE "payment_attempts"
    ADD CONSTRAINT "payment_attempts_settled_at_state_check" CHECK (
        ("status" = 'settled') = ("settled_at" IS NOT NULL)
    );

ALTER TABLE "download_events"
    ADD CONSTRAINT "download_events_source_ip_digest_check" CHECK (
        "source_ip_digest" ~ '^[A-Za-z0-9_-]{43}$'
        OR "source_ip_digest" ~ '^[0-9a-f]{64}$'
    );
