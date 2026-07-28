# Done

Completed tasks, appended here by `/next-layer` as each layer finishes.
Grouped under a `## Layer N` (or `## Refinement`) heading, most recent first.
Each task keeps its original `T-xxxxxx` id and task-block schema (`Status`,
`Assignee`, `Files`, `Acceptance`, `Skills`, optional `Depends`) unchanged
except `Status`, which is `done` for everything in this file.

## Layer 5 — Public Storefront, Passwordless Auth Web Flow, and Web Release Readiness

Completed 2026-07-28. All 14 tasks done; full workspace lint/typecheck/test green
(15/15 turbo tasks, 178 web tests). Completion gate verified live via
`scripts/e2e-local.sh` against a disposable Postgres plus the standalone web
Docker image: the Playwright browse + auth suite (including the capture-only
magic-link email seam) and axe pass 19/19 across 320–1440px in vi/en and
VND/USD, and the standalone Docker image serves both locales. Two desktop-only
defects the first real end-to-end run surfaced were fixed on the way in: the N11
mega-menu panel rendered at the Browse-button width and overlapped its columns
(now anchored full-width to the header), and client-rendered routes raced the
axe document-title check before the App Router applied their title (the health
check now settles the title first). Cart, checkout, payment, orders,
entitlements/library, wishlist, reviews, and the admin surface remain explicitly
deferred pending a future commerce layer (with its own refinement and threat
model).
### T-5b2e90 — Web data-access, currency, and i18n message foundation

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/package.json, pnpm-lock.yaml, apps/web/src/lib/api-client.ts, apps/web/src/lib/catalogue-client.ts, apps/web/src/lib/auth-client.ts, apps/web/src/lib/currency.tsx, apps/web/src/lib/format.ts, apps/web/src/components/providers.tsx, apps/web/src/i18n/request.ts, apps/web/messages/vi/common.json, apps/web/messages/en/common.json, apps/web/src/app/api/[...proxy]/route.ts, apps/web/.env.example, apps/web/src/lib/catalogue-client.test.ts, apps/web/src/lib/currency.test.tsx
- **Acceptance:**
  - Typed client functions cover every Layer-4 read the storefront needs (categories, product collection with the full approved query grammar including opaque cursor, product detail) and every auth/session call (initiate magic link, redeem token, current session, logout current, logout all), building requests only from the shared `@marketplace/shared/catalogue` and `@marketplace/shared/auth` schemas and validating every response with the matching shared Zod schema before returning it. No screen may bypass these clients with a raw `fetch`.
  - A currency context provides independent `VND`/`USD` selection persisted across navigation, wired into the provider stack without coupling to locale, plus minor-unit money formatting helpers keyed on `{currency, locale}`. `providers.tsx` composes it beside the existing TanStack Query provider.
  - `i18n/request.ts` loads and deep-merges **all** JSON files under `messages/<locale>/` so later feature tasks add a namespace file without editing `request.ts`; the existing flat `messages/vi.json`/`messages/en.json` keys migrate into `messages/<locale>/common.json` and both locales keep identical key sets. (This task deletes the old flat files it migrates.)
  - The web↔API session-cookie topology is resolved and documented: implement the same-origin Next.js Route Handler proxy (`app/api/[...proxy]/route.ts`) that forwards allowed `/v1` calls to the configured API origin, forwards `Set-Cookie`/`Cookie` and `X-CSRF-Token`, and never exposes a secret or the API origin's other routes to the browser. `.env.example` documents the server-only API origin variable; no secret or credential is committed or shipped to the browser bundle.
  - Unit tests prove client response-schema validation (including a rejected malformed payload), currency independence/formatting for both currencies and locales, and the message-directory merge producing equal-keyed catalogues; `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass. Any Playwright/axe dev-dependencies the layer needs are added here (sole owner of `package.json`/`pnpm-lock.yaml`) so no downstream task edits them.
- **Skills:** web-app-foundation, web-api-integration, web-i18n-theme, web-security, shared-contracts, typescript-strict

### T-6a1d84 — Gate API integration suites in CI with disposable PostgreSQL

- **Status:** done
- **Assignee:** ai
- **Files:** .github/workflows/ci.yml
- **Acceptance:**
  - `ci.yml` adds a PostgreSQL service, runs `prisma migrate deploy` against one freshly created database per integration suite, and exports `CATALOGUE_INTEGRATION_DATABASE_URL`, `MAGIC_LINK_INTEGRATION_DATABASE_URL`, `SESSIONS_INTEGRATION_DATABASE_URL`, and `PUBLIC_RESOURCES_INTEGRATION_DATABASE_URL` (one dedicated DB each, per the recorded gotcha) plus the test-only auth/cursor secrets those suites require, so the previously-skipped real-HTTP-to-database seams actually gate merges.
  - The existing `pnpm turbo run lint typecheck test` gate, Node 20 + pnpm pinning, and PR/`main`/`develop` triggers are preserved; no production credential is introduced and every secret used is an explicit test value.
  - Workflow YAML passes static validation. The full CI run is verified in a real terminal outside the agent session, consistent with the repository heavy-build rule; the task changes only `ci.yml`.
- **Skills:** git-workflow, backend-testing

### T-c1a7d3 — Marketplace shell, N11 mega-menu, drawer, and locale/currency toggles

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/components/app-shell.tsx, apps/web/src/components/nav/mega-menu.tsx, apps/web/src/components/nav/mobile-drawer.tsx, apps/web/src/components/nav/locale-currency-toggle.tsx, apps/web/src/app/[locale]/layout.tsx, apps/web/messages/vi/navigation.json, apps/web/messages/en/navigation.json, apps/web/src/app/page.test.tsx, apps/web/src/components/nav/mega-menu.test.tsx
- **Acceptance:**
  - The shell renders the approved **N11 mega-menu** (3-column grouped payload sourced from `GET /v1/categories` via the shared client, dim/blur scrim, no invented promo proof) on desktop and an accordion **drawer** on mobile, plus a search entry point and independent locale and `VND`/`USD` currency toggles wired to the Round-1 currency context. It does **not** add cart, wishlist, or any commerce/admin entry point (deferred).
  - Navigation preserves the active locale on every link, keeps keyboard focus visible with Escape-to-close, honors reduced motion (menu/drawer at 200–300ms otherwise), keeps interactive targets ≥44px, keeps zoom enabled, and produces no page-level horizontal overflow at 320px. All copy and a11y labels come from `messages/<locale>/navigation.json` with identical `vi`/`en` keys.
  - This task refactors the existing `apps/web/src/app/page.test.tsx` to cover shell presence and root-locale negotiation only (removing any home-content assertions, which move to `T-f39ac7`), so no other task edits that file.
  - Component tests (including axe) cover mega-menu category rendering from a mocked client, drawer open/close, toggle independence, and locale-preserving links; `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-app-foundation, ui-ux-pro-max, web-styling, web-responsive, web-i18n-theme, web-animations, motion-design-principles, web-security, typescript-strict
- **Depends:** T-5b2e90

### T-8f43e2 — Shared catalogue collection UI kit and URL-backed query state

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/components/catalogue/product-card.tsx, apps/web/src/components/catalogue/product-grid.tsx, apps/web/src/components/catalogue/filter-rail.tsx, apps/web/src/components/catalogue/sort-control.tsx, apps/web/src/components/catalogue/price-range-control.tsx, apps/web/src/components/catalogue/collection-pager.tsx, apps/web/src/components/catalogue/empty-state.tsx, apps/web/src/lib/product-query-url.ts, apps/web/src/hooks/use-product-collection.ts, apps/web/messages/vi/collection.json, apps/web/messages/en/collection.json, apps/web/src/lib/product-query-url.test.ts, apps/web/src/components/catalogue/product-card.test.tsx
- **Acceptance:**
  - A reusable product card (localized title/summary, category, compatibility badge, selected-currency/licence price via the Round-1 formatter), responsive grid, and the filter/sort/price/pagination controls render the approved facets exactly (category/subcategory, controlled tag facets, compatibility bands, `updatedWithin`, price range, and the approved sort keys) using controlled vocabularies from the API response rather than hard-coded lists.
  - `product-query-url.ts` + `use-product-collection.ts` serialize the entire non-cursor collection state into the URL (so Back navigation and shared links restore the exact collection), carry the opaque cursor for continuation only, drive fetches through the Round-1 catalogue client, and surface honest empty/loading/error states (no fabricated inventory or bestseller/rating surfaces). Sorts unavailable until real transactions/reviews exist are not offered.
  - The kit reserves media aspect ratio (no layout shift), keeps ≥44px targets, no 320px horizontal overflow, visible focus, and reduced-motion-safe transitions; all copy from `messages/<locale>/collection.json` with equal `vi`/`en` keys.
  - Tests cover URL⇄state round-tripping (including cursor handling and rejected/unknown params), facet OR-within/AND-across serialization, price/licence/currency context, and card rendering + axe; `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-api-integration, web-data-forms, ui-ux-pro-max, web-styling, web-responsive, web-i18n-theme, shared-contracts, typescript-strict
- **Depends:** T-5b2e90

### T-2d9b6c — Product detail screen (`/[locale]/templates/[slug]`)

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/app/[locale]/templates/[slug]/page.tsx, apps/web/src/app/[locale]/templates/[slug]/not-found.tsx, apps/web/src/components/product-detail/detail-header.tsx, apps/web/src/components/product-detail/demo-viewer.tsx, apps/web/src/components/product-detail/spec-list.tsx, apps/web/src/components/product-detail/licence-comparison.tsx, apps/web/messages/vi/product.json, apps/web/messages/en/product.json, apps/web/src/components/product-detail/licence-comparison.test.tsx
- **Acceptance:**
  - The screen fetches `GET /v1/products/:slug` through the Round-1 client (validated against the shared detail schema) and renders live demos + demo pages via the isolated-preview URL, compatibility/specifications, documentation link, changelog, and the Regular/Extended licence comparison with explicit selected-currency prices. An unknown/draft/delisted slug renders the localized not-found (HTTP 404 semantics), never leaking seller-private or persistence-only fields.
  - The isolated preview is embedded so it **cannot reach storefront session/cookies** (separate origin, sandboxed, no shared credentials), consistent with the spec's preview-origin boundary. The purchase affordance is present but clearly labelled deferred/sandbox and performs no commerce; no reviews or cart endpoint is called.
  - Responsive from 320–1440px with reserved media aspect ratio, ≥44px targets, visible focus, reduced-motion-safe transitions, and no horizontal overflow; all copy from `messages/<locale>/product.json` with equal `vi`/`en` keys.
  - Component tests cover licence/price rendering for `VND`/`USD` and both locales, not-found handling, and preview-sandbox attributes (plus axe); `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-api-integration, ui-ux-pro-max, web-styling, web-responsive, web-i18n-theme, web-animations, web-security, typescript-strict
- **Depends:** T-5b2e90

### T-a70f15 — Passwordless sign-in and magic-link redemption screens

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/app/[locale]/auth/sign-in/page.tsx, apps/web/src/app/[locale]/auth/magic-link/page.tsx, apps/web/src/components/auth/sign-in-form.tsx, apps/web/src/components/auth/redemption-status.tsx, apps/web/messages/vi/auth.json, apps/web/messages/en/auth.json, apps/web/src/components/auth/sign-in-form.test.tsx, apps/web/src/components/auth/redemption-status.test.tsx
- **Acceptance:**
  - The sign-in form validates `{email, locale, returnTo?}` with the shared initiation schema (react-hook-form + zod), submits through the Round-1 auth client, and always shows the same generic "check your email" outcome for accepted/rate-limited/suppressed cases — it never reveals whether an account exists and never branches UI on account state.
  - `/[locale]/auth/magic-link` reads the `#token=` fragment **once** on the client (never placing the token in a request target, log, analytics, or referrer), posts it to redemption via the auth client, and on HTTP 201 establishes the session (through the Round-1 topology) and redirects to the validated `returnTo` (default `/[locale]/account`). A `MAGIC_LINK_INVALID_OR_EXPIRED` (401) shows a single generic expired/invalid state with a re-request path; malformed input surfaces the shared validation copy. The CSRF token from the redemption response is retained for later mutating calls.
  - `returnTo` is only ever an allowlisted locale-prefixed relative KITVERA route (never absolute/protocol-relative); the token is never persisted to storage. Responsive/accessible per the layer standard, copy from `messages/<locale>/auth.json` with equal `vi`/`en` keys.
  - Tests cover generic-initiation UI, fragment-token read + redemption success/expiry/malformed handling, unsafe-`returnTo` rejection, and no-token-leak assertions (plus axe); `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-auth-state, web-data-forms, web-security, web-i18n-theme, shared-contracts, ui-ux-pro-max, typescript-strict
- **Depends:** T-5b2e90

### T-4e8c2b — Account landing and session management (`/[locale]/account`)

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/app/[locale]/account/page.tsx, apps/web/src/components/account/account-panel.tsx, apps/web/src/components/account/session-actions.tsx, apps/web/src/hooks/use-session.ts, apps/web/messages/vi/account.json, apps/web/messages/en/account.json, apps/web/src/components/account/session-actions.test.tsx
- **Acceptance:**
  - The default post-redemption landing calls `GET /v1/sessions/current` through the Round-1 client, renders the allowlisted signed-in user identity read-only, and redirects unauthenticated visitors to `/[locale]/auth/sign-in`. Library (entitlements), orders, and profile **editing** are explicitly deferred and not shown as functional.
  - "Sign out" (`DELETE /v1/sessions/current`) and "Sign out of all devices" (`DELETE /v1/sessions`) both send the session-bound CSRF value in `X-CSRF-Token`, clear the session on 204, and return the user to a public locale route; a `use-session` hook centralizes current-session/CSRF state for reuse.
  - No session/CSRF value is written to `localStorage`, `sessionStorage`, URLs, or JavaScript-readable persistent state. Responsive/accessible per the layer standard, copy from `messages/<locale>/account.json` with equal `vi`/`en` keys.
  - Tests cover authenticated render, unauthenticated redirect, both revocation actions including CSRF header presence and 204 handling, and no-token-leak assertions (plus axe); `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-auth-state, web-api-integration, web-security, web-i18n-theme, ui-ux-pro-max, typescript-strict
- **Depends:** T-5b2e90

### T-f39ac7 — Home discovery screen (Ecosystem Index, `/[locale]`)

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/app/[locale]/page.tsx, apps/web/src/app/[locale]/page.test.tsx, apps/web/src/components/home/discovery-rail.tsx, apps/web/src/components/home/category-index.tsx, apps/web/messages/vi/home.json, apps/web/messages/en/home.json
- **Acceptance:**
  - The home page renders the approved **Ecosystem Index** discovery surfaces — editor's picks, newest, by category, and by niche — by composing `GET /v1/categories` and `GET /v1/products` (via the Round-1 client) into rails of the `T-8f43e2` product card, with no centred gradient hero, no three generic feature cards, and no bestseller/sales/review surface (those stay hidden until real data exists).
  - Dense product rails do **not** animate on scroll; only state/continuity motion is used, reduced-motion-safe. Responsive 320–1440px with reserved media aspect ratio, ≥44px targets, visible focus, and no horizontal overflow; all copy from `messages/<locale>/home.json` with equal `vi`/`en` keys.
  - A colocated `[locale]/page.test.tsx` (not the shell's `app/page.test.tsx`) covers rail rendering from a mocked client, honest empty state, and axe; `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-api-integration, ui-ux-pro-max, web-styling, web-responsive, web-animations, motion-design-principles, web-i18n-theme, typescript-strict
- **Depends:** T-8f43e2

### T-90e5b8 — Catalogue and search collection routes

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/app/[locale]/categories/[...slug]/page.tsx, apps/web/src/app/[locale]/categories/[...slug]/not-found.tsx, apps/web/src/app/[locale]/search/page.tsx, apps/web/messages/vi/catalogue.json, apps/web/messages/en/catalogue.json, apps/web/src/app/[locale]/search/page.test.tsx
- **Acceptance:**
  - `/[locale]/categories/[...slug]` renders the approved **Catalogue** macrostructure pre-scoped to the resolved category path (unknown category → localized not-found), and `/[locale]/search` renders the same collection surface with the search box active; both compose the `T-8f43e2` kit + `use-product-collection` so all filter/sort/price/cursor state stays URL-backed and restores on Back navigation.
  - When `q` is present the UI reflects the `relevance` default and otherwise `newest`, and it never offers sorts that require transactions/reviews. Both routes consume only the Round-1 catalogue client and shared schemas; no commerce affordance beyond linking to product detail.
  - Responsive/accessible per the layer standard, copy from `messages/<locale>/catalogue.json` with equal `vi`/`en` keys.
  - Tests cover category scoping, search query seeding + `q`-dependent sort default, URL-state restoration, and empty-result state (plus axe); `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-api-integration, web-data-forms, web-responsive, web-i18n-theme, ui-ux-pro-max, typescript-strict
- **Depends:** T-8f43e2

### T-b8d260 — Cross-viewport Playwright + axe e2e for browse and auth flows

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/playwright.config.ts, apps/web/e2e/browse.spec.ts, apps/web/e2e/auth.spec.ts, apps/web/e2e/fixtures/test-catalogue.ts, apps/web/e2e/README.md
- **Acceptance:**
  - Playwright drives the browse happy path (home → mega-menu/category → catalogue/search with filters/sort/pagination → product detail) and the auth happy path (sign-in → fragment-token redemption → account → sign out / sign out all) in both `vi` and `en`, `VND` and `USD`, across representative viewports from 320–1440px, against a seeded disposable catalogue and a capture-only magic-link email seam (no real vendor).
  - Each visited page passes axe WCAG 2.2 AA, keyboard navigation reaches interactive controls, and there is zero page-level horizontal overflow at every tested width; the specs assert no session/CSRF/token material appears in URLs or client-readable storage.
  - `playwright.config.ts` and the specs are statically valid and lint/typecheck clean; the full Playwright run (which needs a built/served app) is executed in a real terminal outside the agent session per the heavy-build rule, and `e2e/README.md` documents how to run it and which env/services it needs. No `package.json`/`pnpm-lock.yaml` edits (Playwright deps were added in `T-5b2e90`).
- **Skills:** web-testing-release, web-responsive, web-security, typescript-strict
- **Depends:** T-c1a7d3, T-2d9b6c, T-a70f15, T-4e8c2b, T-f39ac7, T-90e5b8

### T-7c4f10 — Web i18n standalone-Docker packaging + Round-1 review follow-ups

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/Dockerfile, apps/web/next.config.ts, apps/web/src/i18n/request.ts, apps/web/src/middleware.ts, apps/web/src/app/api/[...proxy]/route.ts, apps/web/src/lib/api-client.ts
- **Acceptance:**
  - The localized message catalogue resolves correctly in the `output: "standalone"` production image, not only in `next dev`/tests. Today the `Dockerfile` build stage never copies `apps/web/messages/`, and `request.ts` enumerates namespaces via `fs.readdirSync(process.cwd()/messages/<locale>)` — in the standalone runtime `process.cwd()` is `/app` and the raw dir is neither traced nor shipped, so every dynamically rendered localized route would 500. Fix so the catalogue loads in standalone: copy `apps/web/messages` into the Docker build stage (so the analyzable `import()` glob has files to bundle) and into the runner if any runtime read remains; add `outputFileTracingIncludes` for `messages/**` and/or resolve the dir relative to the app root instead of `process.cwd()`; keep namespace auto-discovery so later tasks still drop a namespace file without editing `request.ts`. Verify with a real `docker build apps/web` + container start in a terminal (heavy-build rule — outside the agent session); the fix is not "done" until that real image serves both `vi` and `en`.
  - Minor hardening from Round-1 review (all low severity, no live vulnerability): wrap the upstream `fetch` in the `[...proxy]` route so an unreachable API returns the JSON error envelope (e.g. `502`) instead of a bare 500; remove the now-dead `NEXT_PUBLIC_API_URL` CSP-widening branch in `middleware.ts` so `connect-src` stays `'self'`-only (the browser calls only the same-origin proxy); and either route `apiClient.health()` through the proxy base path or delete the dormant helper (it currently targets the web origin's `/health`, unused by app code).
  - Restore the test coverage the shell refactor removed: the CSP (`createContentSecurityPolicy`/`middleware.ts`) and api-client error-envelope (`ApiClientError`) assertions were dropped from `app/page.test.tsx` when it was trimmed to shell/locale scope. Re-add them as colocated `middleware`/`api-client` tests reflecting this task's changes (CSP unconditionally `connect-src 'self'`; the proxy 502 envelope), so neither behavior ships untested.
  - CSP `frame-src` for the product-detail preview: `middleware.ts`'s CSP is `default-src 'self'` with no `frame-src`, so the product-detail sandboxed isolated-preview iframe (a cross-origin preview host) is blocked in a real browser. Add a `frame-src` directive scoped to the configured preview origin(s) — sourced from a server-side config var, never hard-coded — so the preview renders while `connect-src` stays `'self'`-only.
  - SSR-404 for the product & category routes is split into `T-3e7a12` (decided 2026-07-24: switch those two public routes to server-side fetching for real HTTP `404`s/SEO). This task no longer owns that decision.
  - `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` stay green.
- **Skills:** web-i18n-theme, web-security, web-testing-release, typescript-strict
- **Depends:** T-5b2e90

### T-3e7a12 — Server-side product & category fetch with real HTTP 404s

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/lib/catalogue-server.ts, apps/web/src/app/[locale]/templates/[slug]/page.tsx, apps/web/src/app/[locale]/categories/[...slug]/page.tsx, apps/web/src/app/[locale]/search/page.tsx, apps/web/src/components/catalogue/collection-view.tsx, apps/web/src/lib/catalogue-server.test.ts
- **Acceptance:**
  - A server-only data module (`catalogue-server.ts`) fetches the public catalogue reads the product-detail and category pages need directly from the server-only API origin (the same `API_ORIGIN` the proxy already uses server-side), validating every response against the same `@shared/catalogue` schemas the client uses. It is imported ONLY by Server Components, never ships the API origin to the browser bundle, and forwards no browser cookies (these are public, unauthenticated reads). Auth/session reads stay client-side via the same-origin proxy, unchanged — this task moves only the two public, SEO-critical read paths server-side.
  - `/[locale]/templates/[slug]/page.tsx` becomes a Server Component that awaits the server fetch and calls `notFound()` (a real HTTP 404) for an unknown/draft/delisted slug before rendering; the interactive/currency-dependent pieces stay client child components receiving the validated product as props. No behavior regression versus the reviewed client version (licence/price for both currencies/locales, sandboxed preview, deferred purchase affordance).
  - `/[locale]/categories/[...slug]/page.tsx` becomes a Server Component that resolves+validates the category path server-side and calls `notFound()` (a real HTTP 404) for an unknown category, then renders the URL-backed client collection surface — extracted into a shared client `collection-view.tsx` — as a child so all filter/sort/price/cursor state stays client and URL-backed. `/[locale]/search` adopts the same `collection-view` (deduping the two routes' near-identical surface) and stays client-only (no 404).
  - Unit tests prove the server module validates responses (including a rejected malformed payload) and that an API 404 surfaces as `notFound()`; existing product-detail/route tests still pass after the server/client split. `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` stay green. (An SSR smoke check against a served app is outside the agent session per the heavy-build rule.)
- **Skills:** web-api-integration, web-frameworks, shared-contracts, web-security, typescript-strict
- **Depends:** T-2d9b6c, T-90e5b8

### T-9d3c05 — Product-detail error boundary + category-resolver unit coverage

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/app/[locale]/error.tsx, apps/web/src/app/[locale]/categories/[...slug]/route-scope.ts, apps/web/src/app/[locale]/categories/[...slug]/page.tsx, apps/web/src/app/[locale]/categories/[...slug]/route-scope.test.ts, apps/web/messages/vi/common.json, apps/web/messages/en/common.json
- **Acceptance:**
  - The server-component product/category pages lost the localized retry affordance the old client versions had: a non-404 API failure (500/unreachable/schema mismatch) now unwinds to Next's default error page instead of a friendly, localized "something went wrong + retry" state. Add an `app/[locale]/error.tsx` client error boundary (a `reset()` retry + localized copy) so every localized route degrades gracefully; `notFound()` still routes to the existing `not-found` boundaries unchanged. Copy goes in an `Error` section of `common.json` with identical vi/en keys.
  - The category page's route-resolution predicate (`[...slug]` → `{category, subcategory} | null`, with unknown slug / extra segments / invalid subcategory → `notFound()`) currently has no unit coverage — it was moved into the async Server Component that RTL can't render, and the dropped "unknown category → not-found" test was not replaced. Extract that pure resolver into `route-scope.ts` and unit-test it (valid single and nested paths, unknown slug, too-many segments, invalid subcategory), so the 404 gating this task exists to deliver is proven without a full SSR run.
  - `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` stay green.
- **Skills:** web-frameworks, web-i18n-theme, typescript-strict
- **Depends:** T-3e7a12

### T-2f8b41 — Capture-only magic-link email adapter for e2e (apps/api)

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/auth/magic-links/*, apps/api/.env.example
- **Acceptance:**
  - The auth happy-path Playwright flow (`apps/web/e2e/auth.spec.ts`) needs to learn the real magic-link URL from outside the API process, but today only the suppress-everything `NullEmailDeliveryAdapter` is wired — so the seam-gated auth tests currently `test.skip` themselves. Implement a **test-only, capture-only** `EmailDeliveryPort` adapter that, when `E2E_MAGIC_LINK_CAPTURE_FILE` is set, appends one JSONL line per delivery (`{ email, locale, link }`, mirroring the real `MagicLinkDelivery` type) to that file and delivers nothing to any real vendor; when the env var is unset, the existing null/suppress behavior is unchanged. It must be impossible to enable in production config (guard on the explicit env var + a non-production check).
  - `apps/api/.env.example` documents `E2E_MAGIC_LINK_CAPTURE_FILE` as a test-only var. The `apps/web/e2e/README.md` contract (already written) is satisfied so the seam-gated `auth.spec.ts` block runs green in a real terminal against a served stack.
  - `pnpm --filter @marketplace/api lint`, `typecheck`, `test` stay green; no real email vendor or credential is introduced.
- **Skills:** nestjs-backend, backend-auth-security, backend-testing, typescript-strict
- **Depends:** T-b8d260


## Layer 4 — Public Catalogue and Passwordless Authentication API

Completed 2026-07-23. Root lint/typecheck green and all tests pass: 59 unit/
controller plus 39 real-PostgreSQL integration tests (catalogue, magic-link,
session, and composed public-API suites, each run against its own freshly
migrated disposable database). The `auth_session_security` migration replayed
cleanly after the full Layer 3 chain. Correctness and security review of the
final composition found no high-confidence findings. Email delivery stays
provider-neutral (port defined and tested, no vendor selected). Storefront/
account screens, catalogue inventory, seller/admin authoring, cart, checkout,
payment, orders, entitlements, and downloads remain deferred.

### T-b4e1a7 — Implement the database-backed public catalogue resource

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/catalogue/catalogue.module.ts, apps/api/src/catalogue/catalogue.controller.ts, apps/api/src/catalogue/catalogue.service.ts, apps/api/src/catalogue/catalogue-cursor.ts, apps/api/src/catalogue/catalogue.controller.test.ts, apps/api/src/catalogue/catalogue.integration.test.ts
- **Acceptance:**
  - [x] `CatalogueModule` implements `GET /v1/categories`, `GET /v1/products`, and `GET /v1/products/:slug` using the shipped `@marketplace/shared/catalogue` request and response schemas; malformed input, unknown query keys or dynamic controlled values, invalid/replayed-under-different-filters cursors, and invalid ranges return the shared HTTP-422 envelope.
  - [x] Category reads return the seeded public roots in deterministic order with their complete `vi`/`en` translations. Product collection and detail reads expose only `published` products whose required localized/current-version/licence data exists; unknown, draft, or delisted slugs return HTTP 404 and no seller-private or persistence-only fields are serialized.
  - [x] Collection filters implement the approved OR-within/AND-across behavior for category/subcategory, controlled tag facets, compatibility bands, update windows, selected licence/currency price ranges, and normalized search. Search uses parameterized PostgreSQL full-text/trigram operations and the Layer 2 indexes; limits are bounded before database execution and no untrusted query fragment is interpolated as SQL.
  - [x] All approved sorts are deterministic. Continuation cursors are versioned, opaque, HMAC-authenticated with a server-only secret, contain only the ordering tuple and normalized-query fingerprint required to resume, reject modification or reuse under another query with HTTP 422, and never expose the signing secret to shared contracts or responses.
  - [x] Unit/controller tests cover validation, publication boundaries, dynamic-vocabulary rejection, filter semantics, every sort/cursor family, cursor tampering/fingerprint mismatch, missing products, and representative output-mapping failures.
  - [x] With `DATABASE_URL` pointed at a disposable PostgreSQL database containing the shipped migrations and a minimal bilingual published-product fixture, integration tests issue real HTTP requests, exercise actual Prisma/database queries for categories plus product collection/detail, and parse every successful database-derived response with the corresponding shared Zod response schema. The tests also prove draft/delisted rows and nonmatching locale/licence/currency/filter data do not leak.
  - [x] `pnpm --filter @marketplace/api lint`, `pnpm --filter @marketplace/api typecheck`, `pnpm --filter @marketplace/api test`, and the explicit disposable-PostgreSQL integration run pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-testing, shared-contracts, backend-auth-security, typescript-strict

### T-c8d2f4 — Extend persistence for secure sessions and auth rate events

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260722030000_auth_session_security/migration.sql
- **Acceptance:**
  - [x] The session model can enforce the approved 30-day idle and 90-day absolute expiry independently across token rotation, bind an unpredictable CSRF value by hash, record activity, and preserve the existing replacement/revocation chain without storing raw session or CSRF bearer values.
  - [x] Provider-neutral auth security/rate-event persistence supports the exact initiation windows (3/email/15 minutes, 10/email/24 hours, 20/source-IP/15 minutes) and redemption window (10/source-IP/15 minutes), plus success/failure/revocation security events, using normalized email only where email counting requires it and a keyed source-IP digest rather than raw IP text. No raw magic-link, session, CSRF, or signing secret is persisted.
  - [x] Constraints and indexes support active-session lookup, user-wide revocation, expiry/rotation decisions, bounded rate-window counts, and audit ordering. Expiry ordering and terminal-state invariants are database-enforced where practical, and public input cannot assign roles or seller ownership through these models.
  - [x] The migration upgrades the completed Layer 3 database without deleting identity/catalogue data and gives any legacy session a conservative finite idle/absolute lifetime. Representative database checks prove lifecycle constraints, rate-window lookup paths, and concurrent terminal updates.
  - [x] The migration replays cleanly after all three shipped migrations on disposable PostgreSQL; `prisma validate`, Prisma client generation, `pnpm --filter @marketplace/api typecheck`, and the root test gate pass.
- **Skills:** database-orm, backend-auth-security, backend-testing, typescript-strict

### T-e6a93c — Build the passwordless auth security core

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/package.json, pnpm-lock.yaml, apps/api/.env.example, apps/api/src/config/env.ts, apps/api/src/config/env.test.ts, apps/api/src/common/errors/api-http.exception.ts, apps/api/src/common/filters/api-exception.filter.ts, apps/api/src/common/filters/api-exception.filter.test.ts, apps/api/src/auth/core/auth-core.module.ts, apps/api/src/auth/core/auth-crypto.service.ts, apps/api/src/auth/core/auth-rate-limit.service.ts, apps/api/src/auth/core/auth-session.service.ts, apps/api/src/auth/core/auth-cookie.ts, apps/api/src/auth/core/auth-core.test.ts
- **Acceptance:**
  - [x] Environment validation requires independent, deployment-supplied secrets for catalogue cursor signing, auth token/session/CSRF hashing, and keyed source-IP digests, plus the public web origin needed to construct magic-link destinations. Test fixtures use explicit test values; no secret or production credential is committed or exposed to the browser.
  - [x] The runtime uses cryptographically secure 256-bit opaque values, domain-separated hashes/HMACs, constant-time verification where secrets are compared, and injectable clock/random seams for deterministic tests. Only hashes reach Prisma or logs; raw magic-link, session, and CSRF values are never logged.
  - [x] The database-backed limiter enforces all approved email/IP windows under concurrent requests rather than relying on process memory, prunes or bounds obsolete rate data, and returns decisions that let initiation preserve its generic HTTP-202 response. Source addresses are keyed before persistence and untrusted forwarding headers are not accepted implicitly.
  - [x] The shared session service creates hashed opaque sessions, derives or stores only a hashed session-bound CSRF verifier, enforces idle and absolute expiry, rotates at most once per 24 hours while preserving the original absolute deadline, creates the replacement before revoking the old session, and provides atomic current-only and user-wide revocation operations.
  - [x] Cookie helpers emit `__Host-kitvera_session` with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and no `Domain`, and clear it with the same host/path scope. Application exceptions can carry allowlisted public error codes such as `MAGIC_LINK_INVALID_OR_EXPIRED` without leaking internal messages or stack traces through the standard shared envelope.
  - [x] Tests cover entropy/encoding, hash separation, no-raw-token persistence/logging, rate-window edges and concurrency, expiry/rotation/replay behavior, CSRF verification, exact cookie attributes, safe exception serialization, and invalid/missing environment secrets; package lint/typecheck/tests pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-c8d2f4

### T-71f0bd — Implement magic-link initiation and redemption

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/auth/magic-links/email-delivery.port.ts, apps/api/src/auth/magic-links/null-email-delivery.adapter.ts, apps/api/src/auth/magic-links/magic-links.module.ts, apps/api/src/auth/magic-links/magic-links.controller.ts, apps/api/src/auth/magic-links/magic-links.service.ts, apps/api/src/auth/magic-links/magic-links.controller.test.ts, apps/api/src/auth/magic-links/magic-links.integration.test.ts
- **Acceptance:**
  - [x] `POST /v1/auth/magic-links` validates the shared initiation schema, normalizes email/locale/return target, applies every approved database-backed email and source-IP limit, and always returns the same generic HTTP 202 `{status:"accepted"}` for new/existing addresses, limited requests, suppressed delivery, and provider failure without creating a user or revealing account state.
  - [x] A successful issue uses at least 256 bits of secure entropy, stores only the token hash with a 15-minute expiry and pending email/locale/return target, atomically revokes every older unconsumed token for that normalized email, and passes a link shaped as `/[locale]/auth/magic-link#token=<raw-token>` to an injected provider-neutral email port. The default adapter fails closed/suppresses delivery without logging the raw link; vendor selection remains deferred.
  - [x] `POST /v1/auth/magic-link-redemptions` validates the shared token contract. A well-formed unknown, expired, consumed, or revoked token produces the same HTTP 401 `MAGIC_LINK_INVALID_OR_EXPIRED`; malformed input produces HTTP 422; raw token material never reaches request/application logs.
  - [x] Successful redemption atomically consumes exactly one token, converges concurrent first-time redemptions on unique normalized email, creates no seller/admin roles, creates the secure session through the auth core, attaches the token to that user, sets the approved cookie, and returns HTTP 201 whose allowlisted user/session/CSRF/return target parses with the shared redemption response schema.
  - [x] Security events contain no bearer material. Real-PostgreSQL integration tests prove generic initiation outcomes, exact email/IP windows including concurrent attempts, older-token revocation, provider suppression/failure, first-time user creation only after redemption, cookie flags, expired/revoked/consumed rejection, and a concurrent double-redemption yielding exactly one session/success. Unit, lint, typecheck, and integration tests pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-e6a93c

### T-a2c5e8 — Implement current-session and revocation resources

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/auth/sessions/sessions.module.ts, apps/api/src/auth/sessions/session-auth.guard.ts, apps/api/src/auth/sessions/session-csrf.guard.ts, apps/api/src/auth/sessions/session-context.ts, apps/api/src/auth/sessions/sessions.controller.ts, apps/api/src/auth/sessions/sessions.controller.test.ts, apps/api/src/auth/sessions/sessions.integration.test.ts
- **Acceptance:**
  - [x] Cookie authentication hashes the opaque cookie before lookup, rejects absent, unknown, revoked, idle-expired, or absolute-expired sessions with HTTP 401, never accepts a client-supplied user ID/role as authority, and exposes only the server-resolved session/user context to handlers.
  - [x] `GET /v1/sessions/current` returns the allowlisted current user/session and unpredictable session-bound CSRF value accepted by the shared schema, updates activity within the absolute lifetime, and performs the approved at-most-once-per-24-hours rotation by setting the replacement cookie only after the replacement exists.
  - [x] `DELETE /v1/sessions/current` and `DELETE /v1/sessions` require both authenticated cookie state and a valid `X-CSRF-Token`, scope revocation to the server-resolved current session/user, clear the host cookie, and return HTTP 204 with no body. Missing/mismatched CSRF fails even for `SameSite` requests and user-wide revocation cannot target another user's sessions.
  - [x] Revoked or rotated bearer values cannot replay, concurrent activity/logout/revoke-all operations converge safely, rotation keeps the original 90-day absolute deadline, and security events contain no raw cookie or CSRF values.
  - [x] Controller/unit and real-PostgreSQL integration tests cover unauthenticated access, safe response parsing, idle/absolute expiry, rotation timing, CSRF failures, exact cookie clearing, current-only versus user-wide revocation, cross-user isolation, and concurrent replay/revocation. Lint, typecheck, unit, and integration tests pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-e6a93c

### T-3fa9d0 — Compose and verify the public API resources

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/auth/auth.module.ts, apps/api/src/app.module.ts, apps/api/src/main.ts, apps/api/test/public-resources.integration.test.ts
- **Acceptance:**
  - [x] `AuthModule` composes the auth core, magic-link, and session modules; `AppModule` registers auth and catalogue beside health/Prisma/config without circular dependencies or duplicate providers. The Fastify bootstrap registers cookie support before requests, retains URI versioning, Zod validation, standard exception filtering, credentialed explicit-origin CORS, Helmet, shutdown hooks, and safe proxy defaults.
  - [x] A disposable-PostgreSQL Fastify integration suite boots the real composed application, injects a capture-only test email adapter, and proves the complete HTTP seams: shared-schema-valid database-derived categories/products/detail; generic magic-link initiation; fragment-token redemption; secure session cookie; current-session/CSRF; current logout; and user-wide revocation. It also asserts malformed catalogue/auth input uses the shared 422 envelope, invalid magic links use the fixed 401 code, and no response/log exposes token hashes or raw bearer material.
  - [x] The composed app starts with valid environment configuration and fails closed when required signing/hashing secrets are missing; provider-neutral email remains replaceable through dependency injection and no vendor SDK, web page, commerce/payment behavior, or sample catalogue inventory is introduced.
  - [x] `pnpm --filter @marketplace/api lint`, `pnpm --filter @marketplace/api typecheck`, `pnpm --filter @marketplace/api test`, the explicit disposable-PostgreSQL integration suite, and root `pnpm lint && pnpm typecheck && pnpm test` pass.
- **Skills:** api-design, nestjs-backend, backend-auth-security, backend-testing, database-orm, shared-contracts, typescript-strict
- **Depends:** T-b4e1a7, T-71f0bd, T-a2c5e8

## Layer 3 — Public Request and Passwordless Auth Prerequisites

Completed 2026-07-22. Root lint/typecheck and all 116 tests passed. The auth
migration replayed cleanly after Layers 1 and 2 on disposable PostgreSQL, and
correctness plus security review found no remaining high-confidence findings.
The integration gate correctly deferred HTTP-to-database tests until the
dependent NestJS resources exist.

### T-9a705b — Define catalogue query and passwordless auth contracts

- **Status:** done
- **Assignee:** ai
- **Files:** packages/shared/package.json, packages/shared/src/index.ts, packages/shared/src/catalogue.ts, packages/shared/src/catalogue.test.ts, packages/shared/src/auth.ts, packages/shared/src/auth.test.ts
- **Acceptance:**
  - [x] `@marketplace/shared` exports strict Zod request schemas and inferred types for `GET /v1/categories` and `GET /v1/products`, plus the category collection response composed from the shipped localized summary and cursor primitives; locale, currency, money, slug, licence, and existing product response contracts are reused rather than redefined, and package subpath exports expose the catalogue and auth contracts to both apps.
  - [x] The product query contract implements the approved grammar exactly: required `locale`, `currency`, and `licence`; normalized optional `q`; repeatable controlled facets with a maximum of 20 values each and OR-within/AND-across semantics; controlled compatibility/version-band syntax and `updatedWithin`; integer `minPrice`/`maxPrice` with cross-field ordering; conditional sort defaults; limit default/bounds; opaque cursor input; and rejection of unknown parameters, comma-packed facets, malformed ranges, and malformed controlled-value shapes. Membership of dynamic controlled vocabularies is explicitly left for the later database-backed API validation rather than hard-coded into shared schemas.
  - [x] Catalogue query tests exercise raw URL-query boundary shapes, including one versus repeated entries, empty-search handling, the `q`-dependent sort default, the 24/48 limit behavior, locale/currency independence, price/licence context, and representative HTTP-422 validation failures. Cursor signature/fingerprint verification remains a server-only concern for the later API task and no signing secret enters the shared package.
  - [x] The auth contracts cover magic-link initiation `{email, locale, returnTo?}` and generic HTTP-202 `{status:"accepted"}` output, token redemption and its HTTP-201 safe response, current-session output, and the two HTTP-204 session-revocation operations. Email is trimmed/normalized, `returnTo` accepts only approved locale-prefixed relative KITVERA routes, response schemas are explicit allowlists, and no raw session token, token hash, CSRF hash, rotation link, or other persistence-only field can parse as public output.
  - [x] Auth contract tests distinguish malformed redemption input from a well-formed-but-invalid token (the later API maps these to HTTP 422 versus `MAGIC_LINK_INVALID_OR_EXPIRED` HTTP 401), cover unsafe return targets and unsupported locales, and prove the redemption/current-session responses contain only the safe user/session data, CSRF value, and redemption return target called for by the approved amendment.
  - [x] The amendment requires at least 256 bits of raw-token entropy and a “safe user/session” response but does not name the token's transport encoding or enumerate every public user/session property. Treat those as narrow contract-design details: lock a URL-fragment-safe token representation and the minimum useful allowlisted response fields in tests, document them through exported schemas/types, and do not expand into profile or admin-authoring fields.
  - [x] `pnpm --filter @marketplace/shared typecheck` and `pnpm --filter @marketplace/shared test` pass.
- **Skills:** api-design, shared-contracts, backend-auth-security, web-auth-state, typescript-strict

### T-77259c — Persist pending magic-link redemption context

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260722020000_passwordless_auth_pending_state/migration.sql
- **Acceptance:**
  - [x] `MagicLinkToken` stores the normalized target email independently of `User`, permits a null `userId` before redemption, and persists the requested locale plus validated relative `returnTo` needed to produce the approved email link and successful redemption response. Existing token hashes, expiry, consumption, revocation, timestamps, and optional user relation remain intact.
  - [x] The migration upgrades the completed Layer 2 schema without discarding existing identity or catalogue data; any pre-existing token row is safely backfilled from its related user's normalized email before the new invariant is enforced, while future pending tokens can exist without creating a user.
  - [x] Constraints and indexes support revoking older unconsumed tokens and enforcing rate windows by normalized email, looking up a token by its unique hash, and converging concurrent redemption on the existing unique `User.normalizedEmail`; the schema does not store raw bearer tokens or assign seller/admin roles through the public flow.
  - [x] Representative database checks prove a pending token can be created with no user, cannot omit its normalized email/locale/return target, can later attach to exactly one user, and retains one-time consume/revoke state under concurrent updates. The migration does not implement email providers, IP-rate-limit infrastructure, sessions, auth controllers, or security-event transport.
  - [x] The migration replays cleanly after both existing migrations on a disposable PostgreSQL database; `prisma validate`, Prisma client generation, `pnpm --filter @marketplace/api typecheck`, and the root test gate pass.
- **Skills:** database-orm, backend-auth-security, backend-testing, typescript-strict

## Layer 2 — Catalogue Persistence and Public Contract Decisions

Completed 2026-07-22. Root lint/typecheck and all 73 tests passed. The
catalogue migration replayed cleanly from Layer 1 on disposable PostgreSQL,
seeded exactly ten bilingual public roots with no sample products, and passed
sequential plus concurrent integrity regressions. The amended approved spec
now fixes the complete product-query and passwordless-session wire semantics.

### T-6ed6da — Persist the public catalogue read model

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260722010000_catalogue_read_model/migration.sql
- **Acceptance:**
  - [x] Prisma models the relational data needed to produce the existing shared category, product-card, and product-detail responses: hierarchical categories and bilingual category translations; seller-owned products and bilingual product translations; tags; compatibility; localized specifications; ordered localized media and demos; semantic product versions with bilingual changelog notes; Regular/Extended licence options; and explicit VND/USD integer-minor-unit prices.
  - [x] `Product.sellerId` is a required server-controlled relation to the shipped `SellerProfile`; public slugs, locale/currency/licence/publication/media vocabularies align with `@marketplace/shared`, and relational/localized data is not collapsed into opaque JSON blobs.
  - [x] Database uniqueness, check constraints, referential actions, and indexes prevent duplicate translations, tags, versions, licence/currency prices, and ordered child positions; reject invalid negative prices/positions and self-parented categories; preserve seller and published-product history; and support published category/product lookup plus the approved initial PostgreSQL full-text/trigram search strategy.
  - [x] The migration upgrades a database containing the Layer 1 identity migration, seeds exactly the ten approved top-level category slugs with complete `vi`/`en` names and summaries, and introduces no sample products, fabricated sales/reviews, release artifacts/build runs, commerce records, provider choices, or future seller workflows.
  - [x] The migration applies cleanly to a disposable PostgreSQL database with `prisma migrate deploy`; representative database checks prove the seeded taxonomy, seller ownership relation, bilingual uniqueness, ordered-child uniqueness, price constraints, and search indexes; `prisma validate`, Prisma client generation, and `pnpm --filter @marketplace/api typecheck` pass.
- **Skills:** database-orm, backend-testing, backend-auth-security, shared-contracts, typescript-strict

### T-0c25e6 — Resolve catalogue query and magic-link semantics

- **Status:** done
- **Assignee:** human
- **Files:** docs/specs/2026-07-22-template-marketplace-design.md
- **Acceptance:**
  - [x] The approved design specifies the exact `GET /v1/products` request grammar: search term, supported filter facets and value formats, allowed sort keys and defaults, page-size default/maximum, locale/currency handling, and a deterministic opaque-cursor ordering that can restore URL-backed collection state.
  - [x] The approved design specifies the complete magic-link lifecycle beyond the currently named initiation endpoint: generic anti-enumeration response behavior, browser link target, one-time token redemption endpoint and HTTP shape, session transport, cookie attributes, expiry/rotation/revocation rules, current-session lookup/logout needs, and rate-limit expectations.
  - [x] Decisions preserve independent locale/currency choice, provider-neutral email delivery, hashed one-time tokens, replay prevention, server-side authorization, and the explicit deferral of payment/checkout implementation; no unresolved placeholder remains that would force shared-contract or endpoint implementers to invent wire behavior.
  - [x] The amended design remains marked approved with the decision date recorded, so the next scope pass can create separate shared-contract, NestJS catalogue, and NestJS auth tasks without cross-worktree file overlap.
- **Skills:** brainstorming, api-design, backend-auth-security, web-auth-state, shared-contracts

## Layer 1 — Core Domain and Locale Foundations

Completed 2026-07-22. Root lint/typecheck and all 73 tests passed. The identity
migration was exercised against disposable PostgreSQL, catalogue URL contracts
were hardened against non-public hosts, locale CSP supports the configured API
origin, and the end-of-layer integration gate verifies that web locales and
rendered category navigation remain aligned with shared contracts.

### T-d17cbd — Define catalogue read contracts

- **Status:** done
- **Assignee:** ai
- **Files:** packages/shared/src/catalogue.ts, packages/shared/src/catalogue.test.ts, packages/shared/src/index.ts
- **Acceptance:**
  - [x] `@marketplace/shared` exports strict Zod schemas and inferred types for the ten approved category slugs, publication state, Regular/Extended licence identifiers, localized category summaries, product cards, and product detail responses.
  - [x] Product detail covers the approved evaluation facts: localized title/summary/description, category and tags, current version/changelog, compatibility/specifications, ordered media and demo pages, documentation and isolated-preview URLs, and explicit VND/USD minor-unit prices per licence option by composing the existing locale, money, and cursor primitives rather than redefining them.
  - [x] The product collection contract uses the approved `{data, meta}` cursor envelope; request/search/filter schemas are explicitly excluded until their under-specified grammar is resolved in a later layer.
  - [x] Contract tests accept representative bilingual catalogue payloads and reject unknown groups, unsupported locale/currency values, fractional prices, unsafe/non-HTTP(S) public URLs, malformed slugs/versions, duplicate ordered item positions, and incomplete Regular/Extended price coverage.
  - [x] `pnpm --filter @marketplace/shared typecheck` and `pnpm --filter @marketplace/shared test` pass.
- **Skills:** shared-contracts, typescript-strict

### T-9a89df — Add identity and seller ownership persistence

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/prisma/schema.prisma, apps/api/prisma/migrations/migration_lock.toml, apps/api/prisma/migrations/20260722000000_identity_ownership/migration.sql
- **Acceptance:**
  - [x] Prisma defines the approved identity/ownership foundation: `User`, `Session`, `MagicLinkToken`, `Role`, the explicit user-role relation, and `SellerProfile`, with stable IDs and timestamps suitable for later auth, admin RBAC, audit, and `Product.sellerId` relations.
  - [x] Email uniqueness uses a normalized stored value; sessions and one-time magic links persist hashes rather than raw bearer tokens and include expiry plus revocation/consumption state needed to prevent replay and support session rotation.
  - [x] Seller ownership is server-controlled: a seller profile has a required owner relation and unique public slug, supports the single platform seller in v1, and does not expose seller onboarding, KYC, commissions, payouts, or seller-facing authorization.
  - [x] Referential actions and indexes preserve security-relevant history, support lookups by user/hash/expiry/role/seller slug, and do not introduce catalogue, commerce, provider, or seed-data assumptions.
  - [x] The initial migration applies cleanly to an empty disposable PostgreSQL database with `prisma migrate deploy`; `prisma validate`, Prisma client generation, and `pnpm --filter @marketplace/api typecheck` pass.
- **Skills:** database-orm, backend-auth-security, backend-testing, typescript-strict

### T-4a2249 — Establish locale-prefixed web routing

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/package.json, pnpm-lock.yaml, apps/web/next.config.ts, apps/web/src/middleware.ts, apps/web/src/i18n/routing.ts, apps/web/src/i18n/request.ts, apps/web/messages/vi.json, apps/web/messages/en.json, apps/web/src/app/layout.tsx, apps/web/src/app/page.tsx, apps/web/src/app/[locale]/layout.tsx, apps/web/src/app/[locale]/page.tsx, apps/web/src/components/app-shell.tsx, apps/web/src/app/page.test.tsx
- **Acceptance:**
  - [x] `next-intl` provides locale-prefixed `vi` and `en` routes, request configuration, and message catalogues with identical keys; shared shell/home placeholder copy and accessibility labels come from messages rather than hard-coded bilingual text.
  - [x] `/` negotiates a stored locale first and then `Accept-Language`, redirects to the matching locale prefix, and rejects unsupported locale segments. The approved spec does not name the final fallback, so this task explicitly uses Vietnamese (`vi`) as the Vietnamese-first marketplace fallback unless the user changes that decision before implementation.
  - [x] Locale-aware links preserve the active locale, while locale state remains independent from the future VND/USD currency choice; no currency conversion, catalogue page, or product content is introduced.
  - [x] The existing keyboard focus, Escape-to-close navigation, reduced-motion behavior, 44px targets, zoom, and 320px no-overflow guarantees remain covered after routing moves under `[locale]`.
  - [x] Tests verify root negotiation precedence/fallback, both localized routes, unsupported-locale handling, equal catalogue keys, locale-preserving shell links, and accessible rendering; `pnpm --filter @marketplace/web typecheck` and `pnpm --filter @marketplace/web test` pass.
- **Skills:** web-i18n-theme, web-app-foundation, web-responsive, web-security, web-testing-release, typescript-strict

## Layer 0 — Template Marketplace Foundation

Completed 2026-07-22. Root lint/typecheck and all 28 tests passed. Both
production images built successfully, ran as non-root users, reported healthy,
and passed HTTP smoke tests against a temporary PostgreSQL instance. Image
configuration and history contained no baked runtime credentials.

### T-a463b5 — Establish shared wire-contract primitives

- **Status:** done
- **Assignee:** ai
- **Files:** packages/shared/package.json, packages/shared/tsconfig.json, packages/shared/vitest.config.ts, packages/shared/src/index.ts, packages/shared/src/api.ts, packages/shared/src/localization.ts, packages/shared/src/money.ts, packages/shared/src/api.test.ts
- **Acceptance:**
  - [x] `@marketplace/shared` is a strict TypeScript package exporting Zod schemas and inferred types for the `/v1` error envelope, health response, cursor-page metadata, supported locales (`vi`, `en`), supported currencies (`VND`, `USD`), and integer-minor-unit money values.
  - [x] The primitives encode only cross-cutting wire conventions from the approved spec; catalogue, auth, cart, order, and entitlement contracts are deferred.
  - [x] Package scripts provide `build`, `lint`, `typecheck`, and `test`, with contract tests covering valid data and representative invalid boundaries such as fractional money and unsupported locale/currency values.
  - [x] `pnpm --filter @marketplace/shared typecheck` and `pnpm --filter @marketplace/shared test` pass.
- **Skills:** shared-contracts, typescript-strict

### T-6c8d2e — Scaffold the controlled template-factory package

- **Status:** done
- **Assignee:** ai
- **Files:** packages/template-factory/package.json, packages/template-factory/tsconfig.json, packages/template-factory/vitest.config.ts, packages/template-factory/src/index.ts, packages/template-factory/src/manifest.ts, packages/template-factory/src/adapter.ts, packages/template-factory/src/pipeline.ts, packages/template-factory/src/manifest.test.ts, packages/template-factory/fixtures/valid/template.manifest.json
- **Acceptance:**
  - [x] `@marketplace/template-factory` is a strict TypeScript package with `build`, `lint`, `typecheck`, and `test` scripts.
  - [x] A versioned `template.manifest.json` schema validates identity, category, version, compatibility, Regular/Extended licence metadata, demo-page declarations, and build-adapter identity without embedding a specific product or vendor implementation.
  - [x] Typed adapter and pipeline-stage interfaces establish the later validate → build/install test → browser/axe/visual QA → security/licence scan → package/checksum/SBOM/docs → install-from-ZIP → human approval → immutable publish flow; provider integrations and executable build runners remain deferred.
  - [x] The committed fixture passes, malformed manifest cases fail with useful validation errors, and `pnpm --filter @marketplace/template-factory typecheck` plus `pnpm --filter @marketplace/template-factory test` pass.
- **Skills:** typescript-strict

### T-13ab58 — Scaffold the Next.js marketplace shell

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/package.json, apps/web/tsconfig.json, apps/web/next-env.d.ts, apps/web/next.config.ts, apps/web/eslint.config.mjs, apps/web/postcss.config.mjs, apps/web/components.json, apps/web/vitest.config.ts, apps/web/src/app/layout.tsx, apps/web/src/app/page.tsx, apps/web/src/app/globals.css, apps/web/src/components/app-shell.tsx, apps/web/src/components/providers.tsx, apps/web/src/components/ui/button.tsx, apps/web/src/lib/api-client.ts, apps/web/src/lib/query-client.ts, apps/web/src/lib/utils.ts, apps/web/src/app/page.test.tsx
- **Acceptance:**
  - [x] The app uses the locked Next.js App Router stack with strict TypeScript, Tailwind CSS, owned shadcn/ui source, TanStack Query, react-hook-form with Zod resolver support, and Framer Motion.
  - [x] The root provider stack and a responsive public-shell placeholder render without introducing any product screen; `@/*` and `@shared/*` resolve, and the typed API client validates a health response with `@marketplace/shared` before returning it.
  - [x] Global CSS defines the approved Coral modern-minimal Hallmark foundation as semantic tokens (neutral paper surfaces, restrained coral accent, typography, spacing, radius, borders, focus, and motion durations) without a gradient hero or invented marketing proof.
  - [x] The shell preserves zoom, uses visible keyboard focus, provides at least 44px interactive targets, respects reduced motion, and has no page-level horizontal overflow at a 320px viewport.
  - [x] Package scripts provide `build`, `lint`, `typecheck`, and `test`; the component test verifies the shell, provider wiring, and accessible landmark/focus behavior.
  - [x] `pnpm --filter @marketplace/web typecheck` and `pnpm --filter @marketplace/web test` pass, and `pnpm --filter @marketplace/web dev` boots without console errors.
- **Skills:** web-app-foundation, web-styling, hallmark, web-responsive, web-api-integration, web-data-forms, motion-design-principles, web-animations, web-security, web-testing-release, typescript-strict
- **Depends:** T-a463b5

### T-2f2057 — Scaffold the NestJS Fastify API

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/package.json, apps/api/tsconfig.json, apps/api/nest-cli.json, apps/api/eslint.config.mjs, apps/api/vitest.config.ts, apps/api/.env.example, apps/api/prisma/schema.prisma, apps/api/src/main.ts, apps/api/src/app.module.ts, apps/api/src/config/env.ts, apps/api/src/common/filters/api-exception.filter.ts, apps/api/src/prisma/prisma.module.ts, apps/api/src/prisma/prisma.service.ts, apps/api/src/health/health.module.ts, apps/api/src/health/health.controller.ts, apps/api/src/health/health.controller.test.ts
- **Acceptance:**
  - [x] NestJS boots on the Fastify adapter with `ConfigModule`, PrismaModule/PrismaService, `nestjs-zod` global validation, and a global exception filter that emits the shared `{error:{code,message,details?}}` envelope.
  - [x] Prisma is configured for PostgreSQL through validated environment variables and contains generator/datasource configuration only; marketplace domain models and migrations are deferred.
  - [x] `GET /health` returns `200` with a body accepted by the shared health schema, while future API resources are configured under the `/v1` prefix.
  - [x] The baseline config uses no hard-coded credentials, does not expose stack traces in production responses, and leaves provider-neutral CORS/origin configuration explicit in `.env.example`.
  - [x] Package scripts provide `build`, `lint`, `typecheck`, and `test`; the health/exception smoke tests pass with the Fastify-backed Nest application.
  - [x] `pnpm --filter @marketplace/api typecheck` and `pnpm --filter @marketplace/api test` pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-a463b5

### T-9e4c1a — Add production container definitions

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/Dockerfile, apps/web/.dockerignore, apps/api/Dockerfile, apps/api/.dockerignore, .github/workflows/web-build.yml, .github/workflows/api-deploy.yml
- **Acceptance:**
  - [x] Both apps have multi-stage, workspace-aware Dockerfiles that build from the repository-root context, include required shared workspace packages, copy only production output, and run as non-root users without baking secrets into images.
  - [x] The web container runs the Next.js standalone production output; the API container runs compiled NestJS output and exposes a container health check against `/health`.
  - [x] Both workflows invoke `docker build` with repository-root context and their app-specific Dockerfile, retain manual/main-only triggers, and retain an explicit provider-neutral deploy placeholder because hosting remains an open decision.
  - [x] Dockerfiles and workflow YAML pass static validation; full image builds are verified in a real terminal outside the agent session, consistent with the repository's heavy-build rule.
- **Skills:** web-testing-release, web-security, backend-auth-security
- **Depends:** T-13ab58, T-2f2057

### T-f5834d — Reconcile the workspace lockfile and CI gate

- **Status:** done
- **Assignee:** ai
- **Files:** pnpm-lock.yaml, turbo.json, .github/workflows/ci.yml
- **Acceptance:**
  - [x] `pnpm install --lockfile-only` produces a frozen lockfile covering `@marketplace/web`, `@marketplace/api`, `@marketplace/shared`, and `@marketplace/template-factory` without changing any package manifest.
  - [x] Turbo runs dependency-aware `build`, `lint`, `typecheck`, and `test` tasks across all four packages with cache outputs appropriate to Next.js, NestJS, and coverage artifacts.
  - [x] CI installs with `--frozen-lockfile` and gates pull requests plus pushes to `main`/`develop` on `pnpm turbo run lint typecheck test` using Node.js 20 and pnpm 9.
  - [x] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass from the repository root; CI workflow syntax is valid.
- **Skills:** git-workflow
- **Depends:** T-a463b5, T-6c8d2e, T-13ab58, T-2f2057, T-9e4c1a
