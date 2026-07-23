# Layer 5 — Public Storefront, Passwordless Auth Web Flow, and Web Release Readiness

Status: **todo**

Layers 0–4 proved the contracts, persistence, and the first live public HTTP
surface (`GET /v1/categories|products|products/:slug`, `POST /v1/auth/magic-links`,
`POST /v1/auth/magic-link-redemptions`, `GET|DELETE /v1/sessions/current`,
`DELETE /v1/sessions`). The web app so far only has locale-prefixed routing and
a placeholder shell. Layer 5 builds the **public Next.js screens that consume
that proven API** plus the **web release-readiness gates** the spec's testing
section calls for. It touches `apps/web/*` and `.github/workflows/ci.yml`; it
does not change the API surface, shared contracts, or Prisma.

The layer is split into dependency rounds so `/run-layer` never asks two
worktrees to edit the same file:

1. **Round 1** — `T-5b2e90` establishes the shared web plumbing (typed API
   client functions, currency context, namespaced i18n message loading,
   providers, and the _sole_ ownership of `apps/web/package.json` +
   `pnpm-lock.yaml`); `T-6a1d84` (CI Postgres gate) is fully independent.
2. **Round 2** — shell/nav, the collection UI kit, product detail, and the two
   auth-facing screens each depend on Round 1 and own disjoint route/component
   directories and their own message namespace files.
3. **Round 3** — home and the two collection routes are thin consumers of the
   collection kit.
4. **Round 4** — Playwright cross-viewport + axe e2e over the finished screens.

### Explicitly out of scope (deferred — no backing API and/or spec non-goals)

Cart, checkout, `checkout/result`, wishlist, `account/library` (entitlements),
`account/orders/[id]`, profile **editing**, downloads, coupons/referrals,
verified reviews (`GET /v1/products/:id/reviews` is not built), any purchase or
payment behavior, and the entire `admin/*` surface. These have no Layer-4
endpoint and/or are spec §6 non-goals. Product detail shows the licence/price
comparison and a **clearly-labelled deferred/sandbox** purchase affordance that
performs no commerce and calls no unbuilt endpoint. The reviews section, if
shown at all, is a static "no reviews yet" state. No web task may invent,
call, or mock a commerce/admin/reviews endpoint.

### Cross-cutting design constraint (decided — implement in `T-5b2e90`)

The API sets a first-party `__Host-kitvera_session` cookie with
`SameSite=Lax`. Whether the browser can send that cookie on authenticated
calls depends on web↔API origin topology, which the spec left open (§8 lists
deployment as a provider-neutral open decision). **Decision (confirmed
2026-07-23): use a same-origin Next.js Route Handler proxy.** The browser only
ever talks to the web origin, so `__Host-`/`SameSite=Lax` stay first-party and
the API origin can deploy on any host without a same-site constraint.
`T-5b2e90` implements it and every auth/account task follows it; the browser
must never call the API origin directly. The sibling-subdomain same-site
alternative was considered and rejected because it constrains deployment to a
single registrable domain.

---

### T-5b2e90 — Web data-access, currency, and i18n message foundation

- **Status:** todo
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

- **Status:** todo
- **Assignee:** ai
- **Files:** .github/workflows/ci.yml
- **Acceptance:**
  - `ci.yml` adds a PostgreSQL service, runs `prisma migrate deploy` against one freshly created database per integration suite, and exports `CATALOGUE_INTEGRATION_DATABASE_URL`, `MAGIC_LINK_INTEGRATION_DATABASE_URL`, `SESSIONS_INTEGRATION_DATABASE_URL`, and `PUBLIC_RESOURCES_INTEGRATION_DATABASE_URL` (one dedicated DB each, per the recorded gotcha) plus the test-only auth/cursor secrets those suites require, so the previously-skipped real-HTTP-to-database seams actually gate merges.
  - The existing `pnpm turbo run lint typecheck test` gate, Node 20 + pnpm pinning, and PR/`main`/`develop` triggers are preserved; no production credential is introduced and every secret used is an explicit test value.
  - Workflow YAML passes static validation. The full CI run is verified in a real terminal outside the agent session, consistent with the repository heavy-build rule; the task changes only `ci.yml`.
- **Skills:** git-workflow, backend-testing

### T-c1a7d3 — Marketplace shell, N11 mega-menu, drawer, and locale/currency toggles

- **Status:** todo
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

- **Status:** todo
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

- **Status:** todo
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

- **Status:** todo
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

- **Status:** todo
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

- **Status:** todo
- **Assignee:** ai
- **Files:** apps/web/src/app/[locale]/page.tsx, apps/web/src/app/[locale]/page.test.tsx, apps/web/src/components/home/discovery-rail.tsx, apps/web/src/components/home/category-index.tsx, apps/web/messages/vi/home.json, apps/web/messages/en/home.json
- **Acceptance:**
  - The home page renders the approved **Ecosystem Index** discovery surfaces — editor's picks, newest, by category, and by niche — by composing `GET /v1/categories` and `GET /v1/products` (via the Round-1 client) into rails of the `T-8f43e2` product card, with no centred gradient hero, no three generic feature cards, and no bestseller/sales/review surface (those stay hidden until real data exists).
  - Dense product rails do **not** animate on scroll; only state/continuity motion is used, reduced-motion-safe. Responsive 320–1440px with reserved media aspect ratio, ≥44px targets, visible focus, and no horizontal overflow; all copy from `messages/<locale>/home.json` with equal `vi`/`en` keys.
  - A colocated `[locale]/page.test.tsx` (not the shell's `app/page.test.tsx`) covers rail rendering from a mocked client, honest empty state, and axe; `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-api-integration, ui-ux-pro-max, web-styling, web-responsive, web-animations, motion-design-principles, web-i18n-theme, typescript-strict
- **Depends:** T-8f43e2

### T-90e5b8 — Catalogue and search collection routes

- **Status:** todo
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

- **Status:** todo
- **Assignee:** ai
- **Files:** apps/web/playwright.config.ts, apps/web/e2e/browse.spec.ts, apps/web/e2e/auth.spec.ts, apps/web/e2e/fixtures/test-catalogue.ts, apps/web/e2e/README.md
- **Acceptance:**
  - Playwright drives the browse happy path (home → mega-menu/category → catalogue/search with filters/sort/pagination → product detail) and the auth happy path (sign-in → fragment-token redemption → account → sign out / sign out all) in both `vi` and `en`, `VND` and `USD`, across representative viewports from 320–1440px, against a seeded disposable catalogue and a capture-only magic-link email seam (no real vendor).
  - Each visited page passes axe WCAG 2.2 AA, keyboard navigation reaches interactive controls, and there is zero page-level horizontal overflow at every tested width; the specs assert no session/CSRF/token material appears in URLs or client-readable storage.
  - `playwright.config.ts` and the specs are statically valid and lint/typecheck clean; the full Playwright run (which needs a built/served app) is executed in a real terminal outside the agent session per the heavy-build rule, and `e2e/README.md` documents how to run it and which env/services it needs. No `package.json`/`pnpm-lock.yaml` edits (Playwright deps were added in `T-5b2e90`).
- **Skills:** web-testing-release, web-responsive, web-security, typescript-strict
- **Depends:** T-c1a7d3, T-2d9b6c, T-a70f15, T-4e8c2b, T-f39ac7, T-90e5b8

---

## Layer completion gate

Do not create or start Layer 6 until every task above is `done`, the web
package's `lint`/`typecheck`/`test` are green, the CI Postgres integration gate
(`T-6a1d84`) runs the four API integration suites successfully, the Playwright +
axe browse and auth flows pass in `vi`/`en` and `VND`/`USD` across 320–1440px
with zero horizontal overflow and no leaked session/token material, and both
correctness and security review of the merged web diff are clean. Cart,
checkout, payment, orders, entitlements/library, wishlist, reviews, and the
admin surface remain explicitly deferred and are downstream of a future
commerce layer (and, for sellers/admin, a new refinement + threat model per the
approved spec).
