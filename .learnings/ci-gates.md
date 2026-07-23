# CI gates

## 2026-07-23 — Integration tests do not run in CI (env vars unset)

`ci.yml` runs `turbo run lint typecheck test` but sets none of the
`*_INTEGRATION_DATABASE_URL` vars, so every `*.integration.test.ts` `describe.skip`s.
Only unit/controller tests gate merges — the real HTTP-to-PostgreSQL seams
(catalogue queries, magic-link/session flows) are exercised **locally only**.
To make CI actually gate DB behavior, add a Postgres service job that runs
`prisma migrate deploy` and exports the four URLs (ideally one DB per suite,
see [[integration-testing]]).

Source: .github/workflows/ci.yml
