-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('reviewApproved', 'reviewRejected', 'productPublished', 'productDelisted', 'roleGranted', 'roleRevoked', 'mfaEnrolled', 'mfaRecoveryRegenerated');

-- CreateEnum
CREATE TYPE "AdminAuditTargetType" AS ENUM ('productVersion', 'product', 'userRole', 'adminMfaFactor');

-- CreateEnum
CREATE TYPE "AdminMfaFactorType" AS ENUM ('totp');

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "acting_admin_id" UUID NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "target_type" "AdminAuditTargetType" NOT NULL,
    "target_id" VARCHAR(64) NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "request_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_mfa_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "AdminMfaFactorType" NOT NULL,
    "encrypted_secret" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "factor_id" UUID NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_mfa_sessions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_mfa_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_acting_admin_id_created_at_id_idx" ON "admin_audit_logs"("acting_admin_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_type_target_id_created_at_idx" ON "admin_audit_logs"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_mfa_factors_user_id_type_key" ON "admin_mfa_factors"("user_id", "type");

-- CreateIndex
CREATE INDEX "admin_mfa_recovery_codes_factor_id_idx" ON "admin_mfa_recovery_codes"("factor_id");

-- CreateIndex
CREATE INDEX "admin_mfa_sessions_session_id_idx" ON "admin_mfa_sessions"("session_id");

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_acting_admin_id_fkey" FOREIGN KEY ("acting_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_mfa_factors" ADD CONSTRAINT "admin_mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_mfa_recovery_codes" ADD CONSTRAINT "admin_mfa_recovery_codes_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "admin_mfa_factors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_mfa_sessions" ADD CONSTRAINT "admin_mfa_sessions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Native PostgreSQL constraints for invariants Prisma cannot express.
ALTER TABLE "admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_target_id_not_blank_check" CHECK (btrim("target_id") <> ''),
    ADD CONSTRAINT "admin_audit_logs_request_id_not_blank_check" CHECK ("request_id" IS NULL OR btrim("request_id") <> '');

ALTER TABLE "admin_mfa_factors"
    ADD CONSTRAINT "admin_mfa_factors_encrypted_secret_not_blank_check" CHECK (btrim("encrypted_secret") <> '');

ALTER TABLE "admin_mfa_recovery_codes"
    ADD CONSTRAINT "admin_mfa_recovery_codes_code_hash_not_blank_check" CHECK (btrim("code_hash") <> '');

-- Seed the admin/seller roles that the admin surface and seller authoring
-- rely on. Idempotent: re-running this insert on an already-seeded
-- database is a no-op. No admin user is granted here — the first-admin
-- bootstrap is a separate, later startup path.
INSERT INTO "roles" ("id", "key", "created_at", "updated_at") VALUES
    ('20000000-0000-4000-8000-000000000001', 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('20000000-0000-4000-8000-000000000002', 'seller', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
