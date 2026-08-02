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

## 2026-08-02 — @nestjs/config freezes validated config at import time

`ConfigModule.forRoot({ validate })` resolves + freezes its config the moment
`AppModule`'s decorator is first evaluated (import time), NOT at
`TestingModule#compile()`/`#init()`. So mutating `process.env.NODE_ENV` in
`beforeAll` before a second `Test.createTestingModule({ imports: [AppModule] })`
is silently ignored (the second app keeps the first's frozen env). To boot a
second app with different env — e.g. asserting the sandbox settle endpoint is
disabled under `NODE_ENV=production` — call `vi.resetModules()` then
**dynamically re-import** `AppModule` and every class used as a DI token against
it (`PrismaService`, `AuthSessionService`).

Source: apps/api/test/commerce-flow.integration.test.ts (T-7b2d84)
