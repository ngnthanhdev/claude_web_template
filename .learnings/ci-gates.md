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

## 2026-08-02 — Turbo test-cache can hide a broken integration suite for layers

A DB-gated integration suite (`public-resources.integration.test.ts`) had a
stale `Env` fixture missing three env keys that became required across two later
layers (`DOWNLOAD_TOKEN_HMAC_SECRET`, `FACTORY_INGEST_HMAC_SECRET`,
`LOCAL_ARTIFACT_STORAGE_DIR`). `validateEnv(base)` throws whenever the suite
actually runs — yet CI stayed green because Turbo replayed a *cached* pass from
before those keys were required (the api package's test hash hadn't changed in a
way that busted the cache). It only surfaced when a subagent ran the suite
directly against a fresh Postgres. Lesson: when you add a required env key,
grep EVERY test that builds a full `Env` literal (not just the obvious
integration suites) and fix them in the same change; do not trust a green CI to
prove an integration suite ran — a cache hit and a real pass look identical.
Verify a suspect suite by running it directly with a disposable DB + full env.

Source: fix `8c0d3a2`; reconciled during Layer 8 Round 3.
