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

## 2026-07-24 — Run the FULL workspace gate; `--filter web` misses cross-package breaks

Deleting a web export (`apiClient.health()`) silently broke
`apps/api/test/health-client.integration.test.ts`, which imports the web client
across the package boundary (`../../web/src/lib/api-client`). A web-only
`pnpm --filter @marketplace/web ...` gate stayed green while `apps/api` typecheck

- test would have gone red in CI. Always finish a change that touches a
  shared/exported surface with `pnpm turbo run lint typecheck test` (all packages),
  not a single `--filter`. (Also: Layer 5's `T-6a1d84` added the Postgres service
  the 2026-07-23 entry asked for, so the four integration suites now gate in CI.)

Source: apps/api/test/health-client.integration.test.ts, commit 2474002
