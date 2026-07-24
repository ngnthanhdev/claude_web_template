# KITVERA web e2e (Playwright + axe)

Cross-viewport Playwright specs for the storefront's browse and auth happy
paths (`T-b8d260`). These specs are statically valid and lint/typecheck clean
(see "Verified in this session" below), but **running them is a real-terminal
step, not something the authoring session does** — the repository's
heavy-build rule blocks `next build`/`docker build`/`playwright test` in an
agent session because the run needs a built+served web app, a served API, a
seeded database, and installed browsers.

## What this suite needs

1. **The API served**, migrated against a **disposable** PostgreSQL database
   (never a shared/production one — see `apps/api/.env.example`).
2. **That database seeded** with the catalogue contract documented in
   `fixtures/test-catalogue.ts` (`SEEDED_CATEGORY = "wordpress"`, at least
   `MIN_SEEDED_PRODUCTS_IN_CATEGORY` published products under it — each
   product's licence/price/translation shape is already enforced by the
   shared Zod schemas, so any schema-valid seed works). Nothing in this
   suite seeds data itself: the public catalogue API is read-only by design
   (see `docs/specs/2026-07-22-template-marketplace-design.md` §6), so
   seeding is a `prisma`-level step you run against apps/api directly.
3. **The web app built and served** (`output: "standalone"`, per
   `apps/web/Dockerfile`, or `next build && next start`) against that API,
   with `API_ORIGIN` pointed at it. Serve it at an origin Chromium treats as
   a "secure context" for the API's `Secure` session cookie —
   `http://localhost:<port>` works (Chromium's long-standing `localhost`
   exception); a bare IP or LAN address will silently drop the cookie.
4. **Both processes on the ports this repo already assumes**: API on `3000`
   (`apps/api/.env.example`'s `PORT`), web on `3001`
   (`apps/api/.env.example`'s `CORS_ORIGIN`/`PUBLIC_WEB_ORIGIN`, which the API
   uses to construct magic-link URLs). `playwright.config.ts` defaults
   `baseURL` to `http://localhost:3001`; override with `E2E_BASE_URL` if your
   environment differs.
5. **Installed Playwright browsers**:
   `pnpm --filter @marketplace/web exec playwright install chromium`
   (one-time per machine/CI image).
6. **The capture-only magic-link email seam** — see the next section. Most
   of the suite runs without it; the "redeem a real magic link" tests
   self-skip when it isn't configured.

## Known gap: apps/api has no capture-only email adapter yet

`auth.spec.ts`'s non-happy-path tests (sign-in's generic confirmation, an
invalid/expired token, the unauthenticated account redirect) need no email
seam at all and run for real today. The full
request → capture → redeem → account → sign-out flow needs a way to learn a
real magic-link URL from _outside_ apps/api's own process — and today,
apps/api only wires a suppress-everything
`NullEmailDeliveryAdapter` (`apps/api/src/auth/magic-links/`); there is no
vendor adapter and no capture mechanism reachable across a process boundary.
Building one is an `apps/api` change and is out of `T-b8d260`'s file scope
(`apps/web` only) — it needs a follow-up task.

This suite documents the contract that adapter should satisfy, so the tests
are ready the moment it exists:

- Set `E2E_MAGIC_LINK_CAPTURE_FILE=/absolute/path/to/captured-magic-links.jsonl`
  for **both** the API process and the Playwright process.
- On every `sendMagicLink` call, the adapter appends one line of JSON to that
  file: `{"email": string, "locale": "vi"|"en", "link": string}` — exactly
  `apps/api/src/auth/magic-links/email-delivery.port.ts`'s `MagicLinkDelivery`
  shape, nothing else. Newline-delimited JSON (JSONL), append-only.
- `fixtures/test-catalogue.ts`'s `waitForCapturedMagicLink` polls that file
  for the newest entry matching a given (unique, per-test) email.

Until that adapter ships, leave `E2E_MAGIC_LINK_CAPTURE_FILE` unset: the
`"Magic-link happy path (requires the capture-only email seam)"` describe
block in `auth.spec.ts` calls `test.skip(...)` with this same explanation, so
the suite still runs clean (green, not red) without it.

## Running it

```bash
# 1. API — disposable DB, migrated + seeded per the contract above.
cd apps/api
DATABASE_URL=... pnpm prisma migrate deploy
# ... seed the disposable database here (see "What this suite needs" #2) ...
PORT=3000 pnpm start

# 2. Web — built and served against that API, on port 3001.
cd apps/web
API_ORIGIN=http://localhost:3000 pnpm build
API_ORIGIN=http://localhost:3000 PORT=3001 pnpm start

# 3. Once (per machine/CI image): install browsers.
pnpm --filter @marketplace/web exec playwright install chromium

# 4. Run the suite (from the repo root or apps/web).
E2E_BASE_URL=http://localhost:3001 \
E2E_MAGIC_LINK_CAPTURE_FILE=/tmp/kitvera-captured-magic-links.jsonl \
pnpm --filter @marketplace/web exec playwright test

# A single project (viewport), or a single file:
pnpm --filter @marketplace/web exec playwright test --project=mobile-320
pnpm --filter @marketplace/web exec playwright test e2e/browse.spec.ts
```

`E2E_MAGIC_LINK_CAPTURE_FILE` is optional — omit it to run everything except
the seam-gated happy-path tests (see the gap above).

Rate limiting: apps/api allows 10 magic-link initiations per 15-minute
window. A full suite run issues roughly six requests total (two non-seam
sign-in-request tests, plus up to four seam-gated redemption tests) — safely
under the limit, but avoid re-running the whole suite in a tight loop against
the same environment.

## Verified in this session (task-implementer, no browser run)

- `pnpm --filter @marketplace/web lint` — passes, and **includes** these e2e
  files (no `e2e/**` ignore was added; ESLint's flat config already lints
  everything under `apps/web/`).
- `pnpm --filter @marketplace/web typecheck` — passes and does **not** touch
  `e2e/**`/`playwright.config.ts` at all: `apps/web/tsconfig.json`'s
  `include` only lists `src/**/*.ts(x)`, so the app's typecheck can't be
  "polluted" by these files by construction. `tsconfig.json` is outside this
  task's file scope, so no e2e-specific tsconfig was added; instead, the
  files were independently type-checked against the app's own
  `compilerOptions` (strict, `noUncheckedIndexedAccess`, the same
  `@/*`/`@shared/*` path mapping) via a throwaway project file outside the
  repo, with zero errors.
- `pnpm --filter @marketplace/web test` — passes (167 tests, 18 files);
  `vitest.config.ts`'s `include` is scoped to `src/**/*.{test,spec}.{ts,tsx}`,
  so `browse.spec.ts`/`auth.spec.ts` are correctly never collected by Vitest.
- The actual `playwright test` browser run was **not** executed — it needs a
  built+served web app, a served API, a seeded disposable database, and
  installed browsers, all of which require a real terminal per this
  repository's heavy-build rule.
