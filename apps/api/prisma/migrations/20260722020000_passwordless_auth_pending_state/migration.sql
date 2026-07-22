-- Add the pending-redemption context as nullable first so existing token rows
-- can be upgraded without dropping identity or catalogue data.
ALTER TABLE "magic_link_tokens"
    ADD COLUMN "normalized_email" VARCHAR(320),
    ADD COLUMN "locale" "Locale",
    ADD COLUMN "return_to" VARCHAR(2048);

-- Layer 2 tokens always belonged to a user. Preserve their target identity;
-- their legacy rows predate locale/return-target capture, so use the approved
-- v1 default locale/account destination for that historical state only.
UPDATE "magic_link_tokens" AS token
SET
    "normalized_email" = lower(btrim("user"."normalized_email")),
    "locale" = 'vi',
    "return_to" = '/vi/account'
FROM "users" AS "user"
WHERE token."user_id" = "user"."id";

-- Fail the migration instead of silently accepting an orphaned legacy row.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "magic_link_tokens"
        WHERE "normalized_email" IS NULL
           OR "locale" IS NULL
           OR "return_to" IS NULL
    ) THEN
        RAISE EXCEPTION 'cannot backfill pending magic-link redemption context';
    END IF;
END;
$$;

ALTER TABLE "magic_link_tokens"
    ALTER COLUMN "user_id" DROP NOT NULL,
    ALTER COLUMN "normalized_email" SET NOT NULL,
    ALTER COLUMN "locale" SET NOT NULL,
    ALTER COLUMN "return_to" SET NOT NULL,
    ADD CONSTRAINT "magic_link_tokens_normalized_email_check" CHECK (
        "normalized_email" <> ''
        AND "normalized_email" = lower(btrim("normalized_email"))
    ),
    ADD CONSTRAINT "magic_link_tokens_relative_return_to_check" CHECK (
        (
            split_part("return_to", '?', 1) = '/' || "locale"::text
            OR split_part("return_to", '?', 1) LIKE '/' || "locale"::text || '/%'
        )
        AND "return_to" !~ '[[:space:]\\#]'
        AND split_part("return_to", '?', 1) NOT LIKE '%//%'
        AND split_part("return_to", '?', 1) !~* '(^|/)([.]|%2e){1,2}(/|$)'
        AND split_part("return_to", '?', 1) !~* '%(2f|5c)'
    ),
    ADD CONSTRAINT "magic_link_tokens_single_terminal_state_check" CHECK (
        "consumed_at" IS NULL OR "revoked_at" IS NULL
    );

-- Rate-window counts use normalized email plus issuance time. Revocation of
-- older live links additionally filters the two nullable terminal-state
-- columns before walking issuance order.
CREATE INDEX "magic_link_tokens_email_created_at_idx"
    ON "magic_link_tokens"("normalized_email", "created_at");

CREATE INDEX "magic_link_tokens_email_state_created_at_idx"
    ON "magic_link_tokens"("normalized_email", "consumed_at", "revoked_at", "created_at");
