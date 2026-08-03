-- The original email-scope CHECK (from `20260722030000_auth_session_security`)
-- only has disjuncts for `magicLinkInitiation`/`magicLinkRedemption` — with no
-- third disjunct, every `adminMfaVerification` row (added in the prior
-- migration) would violate it regardless of `normalized_email`'s value.
-- Extend it: `adminMfaVerification` follows the same non-null/canonicalized
-- shape as `magicLinkInitiation` (the column holds the acting admin's
-- `User.id`, always present, so the same "must be present and canonical"
-- rule applies even though it is not literally an email address).
ALTER TABLE "auth_rate_events" DROP CONSTRAINT "auth_rate_events_email_scope_check";

ALTER TABLE "auth_rate_events" ADD CONSTRAINT "auth_rate_events_email_scope_check" CHECK (
    (
        "action" = 'magicLinkInitiation'
        AND "normalized_email" IS NOT NULL
        AND "normalized_email" <> ''
        AND "normalized_email" = lower(btrim("normalized_email"))
    )
    OR (
        "action" = 'magicLinkRedemption'
        AND "normalized_email" IS NULL
    )
    OR (
        "action" = 'adminMfaVerification'
        AND "normalized_email" IS NOT NULL
        AND "normalized_email" <> ''
        AND "normalized_email" = lower(btrim("normalized_email"))
    )
);
