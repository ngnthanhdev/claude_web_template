-- CreateEnum
CREATE TYPE "ReviewState" AS ENUM ('draft', 'in_review', 'approved');

-- CreateEnum
CREATE TYPE "BuildRunStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "BuildVerdict" AS ENUM ('pending', 'passed', 'failed');

-- AlterTable
ALTER TABLE "product_versions" ADD COLUMN     "review_state" "ReviewState" NOT NULL DEFAULT 'draft';

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "product_version_id" UUID NOT NULL,
    "storage_id" TEXT NOT NULL,
    "checksum" VARCHAR(128) NOT NULL,
    "signature" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "produced_at" TIMESTAMPTZ(3) NOT NULL,
    "factory_run_id" VARCHAR(128) NOT NULL,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_runs" (
    "id" UUID NOT NULL,
    "product_version_id" UUID NOT NULL,
    "status" "BuildRunStatus" NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "factory_run_id" VARCHAR(128) NOT NULL,
    "artifact_id" UUID,
    "qa_verdict" "BuildVerdict" NOT NULL DEFAULT 'pending',
    "scan_verdict" "BuildVerdict" NOT NULL DEFAULT 'pending',

    CONSTRAINT "build_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_product_version_id_key" ON "artifacts"("product_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "build_runs_product_version_id_factory_run_id_key" ON "build_runs"("product_version_id", "factory_run_id");

-- CreateIndex
CREATE INDEX "product_versions_product_id_review_state_idx" ON "product_versions"("product_id", "review_state");

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_product_version_id_fkey" FOREIGN KEY ("product_version_id") REFERENCES "product_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_runs" ADD CONSTRAINT "build_runs_product_version_id_fkey" FOREIGN KEY ("product_version_id") REFERENCES "product_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_runs" ADD CONSTRAINT "build_runs_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Native PostgreSQL constraints for invariants Prisma cannot express.
ALTER TABLE "artifacts"
    ADD CONSTRAINT "artifacts_storage_id_not_blank_check" CHECK (btrim("storage_id") <> ''),
    ADD CONSTRAINT "artifacts_checksum_not_blank_check" CHECK (btrim("checksum") <> ''),
    ADD CONSTRAINT "artifacts_signature_not_blank_check" CHECK (btrim("signature") <> ''),
    ADD CONSTRAINT "artifacts_factory_run_id_not_blank_check" CHECK (btrim("factory_run_id") <> ''),
    ADD CONSTRAINT "artifacts_size_bytes_positive_check" CHECK ("size_bytes" > 0);

ALTER TABLE "build_runs"
    ADD CONSTRAINT "build_runs_factory_run_id_not_blank_check" CHECK (btrim("factory_run_id") <> ''),
    ADD CONSTRAINT "build_runs_finished_at_state_check" CHECK (
        ("status" IN ('succeeded', 'failed')) = ("finished_at" IS NOT NULL)
    ),
    ADD CONSTRAINT "build_runs_succeeded_has_artifact_check" CHECK (
        "status" <> 'succeeded' OR "artifact_id" IS NOT NULL
    );

