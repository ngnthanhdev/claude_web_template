# Integration testing (disposable PostgreSQL)

## 2026-07-23 — One dedicated database per integration test file

Pointing several `*.integration.test.ts` files at the **same** Postgres DB
collides. The catalogue suite seeds `products`; the sessions suite's
`beforeEach` cleanup does `sellerProfile.deleteMany()` before deleting those
products, hitting FK `products_seller_id_fkey` → 11 spurious failures. Run each
suite against its own freshly-migrated DB (`createdb` + `prisma migrate deploy`
per file). In isolation every suite is green.

Each suite gates on its own env var and `describe.skip`s when unset:
`CATALOGUE_INTEGRATION_DATABASE_URL`, `MAGIC_LINK_INTEGRATION_DATABASE_URL`,
`SESSIONS_INTEGRATION_DATABASE_URL`, `PUBLIC_RESOURCES_INTEGRATION_DATABASE_URL`.

Source: apps/api/src/auth/sessions/sessions.integration.test.ts (cleanup order);
apps/api/test/public-resources.integration.test.ts (T-3fa9d0)

## 2026-07-23 — Root taxonomy is migration-seeded, not test-seeded

The 10 public root categories + their bilingual translations are inserted by
the `catalogue_read_model` migration, so `findCategories` throws if any root is
missing. Integration tests seed only **child** categories (under an existing
root) + products — never re-seed the roots.

Source: apps/api/prisma/migrations/20260722010000_catalogue_read_model/migration.sql
