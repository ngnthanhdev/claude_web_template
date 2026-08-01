# KITVERA web e2e (Playwright + axe)

Cross-viewport Playwright specs for the storefront's browse and auth happy
paths (`T-b8d260`), plus the Wave-1 commerce purchase happy path
(`commerce.spec.ts`, `T-e3a9d7`). These specs are statically valid and
lint/typecheck clean (see "Verified in this session" below), but **running
them is a real-terminal step, not something the authoring session does** —
the repository's heavy-build rule blocks `next build`/`docker build`/
`playwright test` in an agent session because the run needs a built+served
web app, a served API, a seeded database, and installed browsers.

## What this suite needs

1. **The API served**, migrated against a **disposable** PostgreSQL database
   (never a shared/production one — see `apps/api/.env.example`).
2. **That database seeded** with the catalogue contract documented in
   `fixtures/test-catalogue.ts` (`SEEDED_CATEGORY = "wordpress"`, at least
   `MIN_SEEDED_PRODUCTS_IN_CATEGORY` published products under it — each
   product's licence/price/translation shape is already enforced by the
   shared Zod schemas, so any schema-valid seed works), plus the purchasable
   product contract in `fixtures/purchasable-product.ts` (id/slug/version/
   titles that must match `apps/api/prisma/seed-e2e.mjs`'s `PRODUCTS[0]`
   literally — that seed is what `commerce.spec.ts` actually buys). Nothing
   in this suite seeds data itself: the public catalogue API is read-only by
   design (see `docs/specs/2026-07-22-template-marketplace-design.md` §6), so
   seeding is a `prisma`-level step you run against apps/api directly —
   `apps/api/prisma/seed-e2e.mjs` is the reference seed both `browse.spec.ts`
   and `commerce.spec.ts` are written against.
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
   (including all of `commerce.spec.ts`, which needs a real signed-in
   session) self-skip when it isn't configured.
7. **For `commerce.spec.ts` only** — two more env vars on the **API**
   process, and one more thing in the seed:
   - `DOWNLOAD_TOKEN_HMAC_SECRET` — an independent base64url-encoded 256-bit
     secret (`openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`), signing the
     dev/CI download adapter's short-TTL tokens
     (`apps/api/src/entitlements/downloads/local-storage.adapter.ts`).
   - `LOCAL_ARTIFACT_STORAGE_DIR` — an absolute path to a private local
     directory the same adapter streams artifacts from (e.g.
     `/tmp/kitvera-local-artifacts`; `mkdir -p` it first).
   - The same `LOCAL_ARTIFACT_STORAGE_DIR` value must be set when you run
     `seed-e2e.mjs` (see "Running it" below) — it writes the one purchasable
     product's backing artifact file there so the spec's download step has
     something real to stream.

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

## Known gap: the library download action doesn't send the body the API requires

Reading both sides of the download-issue contract while writing
`commerce.spec.ts`'s download step surfaced a mismatch between two already-
merged Wave-1 tasks, outside this task's file scope to fix:

- `apps/api/src/entitlements/entitlements.controller.ts` (`T-e5f60b`)
  validates `POST /v1/entitlements/:id/download`'s body against
  `downloadIssueRequestSchema`, which is `.strict()` and requires
  `{ productId, version }` — proven by the "issues a download only with a
  valid session, CSRF token, and body" / "rejects a malformed download body"
  cases in `entitlements.controller.test.ts`.
- `apps/web/src/lib/commerce-client.ts`'s `issueDownload()` (`T-1d6f3a`) POSTs
  with **no body** (`apiClient.post(path, schema, undefined, ...)`), and
  `apps/web/src/components/account/download-action.tsx` never receives or
  forwards a `productId`/`version` to pass along even if it wanted to —
  `download-action.test.tsx`'s fetch stub accepts any body, so this gap isn't
  visible at the component-test layer.

Against the real API this returns `422 VALIDATION_ERROR`, not the issued
download URL — the library's Download button would show its error state
instead of downloading anything. `commerce.spec.ts` is written against the
**intended** contract (download succeeds) rather than worked around, since
catching exactly this kind of cross-task integration break is the point of an
e2e suite; if this is still unfixed when the suite is actually run, its
download step is expected to fail until a follow-up task either adds
`productId`/`version` to `download-action.tsx`/`commerce-client.ts`'s
`issueDownload()` call or relaxes the server schema to derive them from the
entitlement server-side (as `entitlements.service.ts` already looks them up
before comparing).

## Running it

```bash
# 1. API — disposable DB, migrated + seeded per the contract above.
cd apps/api
export DATABASE_URL=...
export DOWNLOAD_TOKEN_HMAC_SECRET=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
export LOCAL_ARTIFACT_STORAGE_DIR=/tmp/kitvera-local-artifacts
mkdir -p "$LOCAL_ARTIFACT_STORAGE_DIR"
pnpm prisma migrate deploy
node prisma/seed-e2e.mjs
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
pnpm --filter @marketplace/web exec playwright test e2e/commerce.spec.ts
```

`E2E_MAGIC_LINK_CAPTURE_FILE` is optional — omit it to run everything except
the seam-gated happy-path tests (see the gap above). `commerce.spec.ts`
entirely is one of those seam-gated suites (every scenario needs a real
signed-in session), so it self-skips the same way without it.

## Rate limiting: why auth (and commerce) don't run on every viewport

apps/api rate-limits magic-links **per source IP** (see
`apps/api/src/auth/core/auth-rate-limit.service.ts`): 20 initiations and 10
redemptions per 15-minute window (plus per-email caps of 3/15-min and 10/day,
which the specs never approach because every test uses a fresh
`uniqueTestEmail`). Every viewport project shares one source IP — the
Playwright process — so the per-IP window is the binding constraint.

If `auth.spec.ts` fanned across all five viewport projects like `browse.spec.ts`
does, a single seam-enabled run would issue 25 initiations and 15 redemptions
(5 viewports × 5 magic-link flows), tripping both per-IP caps and failing tests
against a correctly-working API. So `playwright.config.ts` pins `auth.spec.ts`
to one dedicated `auth` project (browse still covers all five viewports; auth
flows aren't viewport-sensitive the way browse layout is). One full run then
issues at most 5 initiations and 3 redemptions.

`commerce.spec.ts` needs the same seam (its whole purchase flow requires a
real signed-in session) but `playwright.config.ts` is out of `T-e3a9d7`'s file
scope, so it can't get its own dedicated project the way `auth.spec.ts` does.
Instead each of its two scenarios (`vi`/VND, `en`/USD) checks
`testInfo.project.name` at the top of the test and skips itself everywhere
except one pinned project — `mobile-320` and `desktop-1440` respectively, the
two extremes of the acceptance's 320-1440px range — so the file costs exactly
2 initiations/redemptions per full run regardless of how many viewport
projects exist. Combined with `auth.spec.ts`'s up to 5/3, one full
seam-enabled `playwright test` run costs at most 7 initiations and 5
redemptions — comfortably under both the 20/15min and 10/15min caps.

Because the window is cumulative, repeated full runs still add up. To re-run
sooner, either wait out the window or clear the counters on the **disposable**
database between runs:

```bash
# Resets the per-IP magic-link windows on the disposable test DB only.
psql "$DATABASE_URL" -c 'TRUNCATE auth_rate_events;'
```

## Verified in this session (T-b8d260, task-implementer, no browser run)

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

## Verified in this session (T-e3a9d7, task-implementer, no browser run)

- `pnpm --filter @marketplace/web lint` — passes, and includes
  `commerce.spec.ts`/`fixtures/purchasable-product.ts` for the same reason as
  above (no e2e-specific ESLint ignore exists).
- `pnpm --filter @marketplace/web typecheck` — passes; still doesn't touch
  `e2e/**` (same `tsconfig.json` `include` gap noted above). Independently
  type-checked `commerce.spec.ts` and `fixtures/purchasable-product.ts`
  against the app's real `compilerOptions` via a throwaway
  `apps/web/tsconfig.e2e-check.json` (`extends: "./tsconfig.json"`,
  `include: ["e2e/**/*.ts", "playwright.config.ts"]`) run with
  `pnpm exec tsc --noEmit --project tsconfig.e2e-check.json` from `apps/web/`
  — zero errors — then deleted before committing.
- `pnpm --filter @marketplace/web test` — passes (248 tests, 26 files);
  Vitest still never collects any `e2e/**` file (same `include` scoping as
  above).
- `node --check apps/api/prisma/seed-e2e.mjs` — passes; the extended seed is
  syntactically valid plain ESM.
- The actual `playwright test` browser run was **not** executed — same
  heavy-build-rule reason as above. Beyond the built+served stack, this spec
  additionally needs `DOWNLOAD_TOKEN_HMAC_SECRET`/`LOCAL_ARTIFACT_STORAGE_DIR`
  on the API and the seed's artifact-file step (see "What this suite needs"
  #7 above) — and its download step is expected to fail until the "Known
  gap" above (the download-issue request body mismatch) is fixed by a
  follow-up task, since that gap sits entirely outside this task's file
  scope (`apps/web/src/lib/commerce-client.ts`,
  `apps/web/src/components/account/download-action.tsx`, and
  `apps/api/src/entitlements/entitlements.controller.ts` are all owned by
  already-merged prior tasks).
