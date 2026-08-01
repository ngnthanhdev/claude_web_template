# Layer 7 — Commerce Wave 1: Core Purchase Path

Status: **todo**

This is the commerce **Wave-1** implementation layer, derived from the
user-approved design `docs/specs/2026-07-31-commerce-purchase-surface-design.md`
(the `T-6d0f2c` gate, approved 2026-07-31). Layer 6's commerce gate is done, so
this scope pass is legitimate: it turns the approved design's Wave-1 surface into
an ordered, parallel-safe implementation layer.

**Wave 1 only — the core money path:** client cart → server checkout → sandbox
settle → order → entitlement → signed download. Per the design's two-wave
sequencing (§1/§7), Wave-2 engagement features are **not** scoped here (see
"Deferred to Wave 2" below). Every Wave-1 STRIDE mitigation from design §9 lands
as an explicit Acceptance line so the post-merge `security-review` can check it.

**Inherited invariants (reused from Layers 0–5, not re-litigated):**
same-origin Next proxy (`app/api/[...proxy]` already forwards every `/v1/*`,
so no proxy change is needed for the new endpoints); `__Host-kitvera_session`;
session-auth + CSRF guards; DB-backed rate limiter; every owned row scoped to
`session.user.id`; all money authoritative server-side; `@marketplace/shared`
Zod contracts on both sides; NestJS/Fastify/Prisma backend; TypeScript strict,
no `any`.

**No server `Cart` model.** Per the locked decision (§1/§4) the cart is
client-only; this layer models only the server-side `Order`, `OrderItemSnapshot`,
`PaymentAttempt`, `Entitlement`, and `DownloadEvent`.

**Payment production stays a go-live blocker (§1/§6/§8).** The sandbox two-step
settle is built now; the real payment provider + signature-verified webhook is
shaped as the `PaymentPort` boundary but **not enabled**. This layer does not
lift that blocker.

## Dependency rounds

Ordered by dependency; tasks in the same round touch disjoint files and are
safe to fan out to parallel `task-implementer` worktrees.

1. **Round 1 — Contracts & persistence (parallel):** `T-c0a71e` (shared commerce
   Zod contracts), `T-d4b8f2` (Prisma commerce models + migration). Both derive
   directly from the approved design (§4/§5); neither depends on the other.
2. **Round 2 — API resources & web data layer (parallel):** `T-a19c3d`
   (checkout / sandbox settle / orders), `T-e5f60b`
   (entitlements / library / signed downloads + `StoragePort`), `T-f80a6c`
   (web commerce client + client-only cart store). Each depends only on Round 1.
3. **Round 3 — Composition & web feature screens (parallel):** `T-7b2d84`
   (wire the API modules + composed disposable-Postgres integration suite),
   `T-92b7e4` (checkout dialog/sheet + result page), `T-1d6f3a` (account orders +
   library + download action).
4. **Round 4 — CI gate & cart surface (parallel):** `T-3c9e15` (gate the new
   integration suites in `ci.yml`), `T-b57c09` (cart page + add-to-cart
   affordances).
5. **Round 5 — End-to-end gate:** `T-e3a9d7` (Playwright
   cart → checkout → sandbox-settle → library → download happy path).

## Deferred to Wave 2 (do NOT scope here)

Per design §1/§5/§6/§7, the following are explicitly out of scope for this layer
and belong to a later `/scope-breakdown` pass over the same approved design:

- **Wishlist** — `WishlistItem` model, `GET/POST/DELETE /v1/wishlist`, the
  heart-toggle on cards, and `/[locale]/account/wishlist`.
- **Coupons / referrals / discount-quotes** — `Coupon`, `ReferralCode`,
  `DiscountRedemption`, `POST /v1/discount-quotes`, and the checkout coupon
  field. Wave 1 only reserves the **server-validated discount seam**
  (`discountCode?` accepted but no code path yet), so Wave 2 extends rather than
  rewrites it.
- **Verified-purchase reviews** — `Review` model,
  `GET/POST /v1/products/:id/reviews`, and the product-detail review form/list
  (these depend on entitlement data existing, so they sequence after purchase).

---

### T-c0a71e — Shared commerce Zod contracts

- **Status:** done
- **Assignee:** ai
- **Files:** packages/shared/src/commerce.ts, packages/shared/src/commerce.test.ts, packages/shared/src/index.ts, packages/shared/package.json
- **Acceptance:**
  - `@marketplace/shared` exports strict Zod request/response schemas and inferred types for the full Wave-1 purchase path, reusing the existing `money`, `localization`, catalogue `licence`/`currency`, and API cursor/envelope primitives rather than redefining them: the checkout request `{ items: [{ productId, licence }], idempotencyKey, discountCode? }`; the checkout response (`Order` id + status + `PaymentAttempt` id); the order summary and order-detail responses (`OrderItemSnapshot`s + status **only**); the `account/library` entitlement list response; and the download-issue response `{ url, expiresAt }`.
  - Response schemas are explicit allowlists (design §9 "Order detail / Info disclosure"): no payment reference, provider field, idempotency key, internal id, or any persistence-only field can parse as a public order/entitlement/download DTO. The order status enum is exactly `pending|settled|cancelled` and payment-attempt status `pending|settled|failed`, matching design §4.
  - The checkout request carries **no** price, discount amount, currency total, or owner id — the client supplies only `productId`, `licence`, `idempotencyKey`, and the optional `discountCode` seam (design §9 "Client cart → checkout / Tampering"). `discountCode` is accepted and validated as a shape but has no Wave-1 redemption behavior (Wave-2 seam).
  - A new `./commerce` subpath is added to `packages/shared/package.json` `exports` (mirroring the existing `./catalogue`/`./auth` entries) and re-exported from `src/index.ts`, so both apps import commerce contracts by subpath without a barrel-only import.
  - Contract tests accept representative valid checkout/order/library/download payloads and reject: money/owner fields smuggled into the checkout request, an over-long or malformed items list, an unknown licence/currency, and any persistence-only field in an order/entitlement/download response. `pnpm --filter @marketplace/shared typecheck` and `pnpm --filter @marketplace/shared test` pass.
- **Skills:** shared-contracts, api-design, typescript-strict

### T-d4b8f2 — Prisma commerce models and migration

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260801000000_commerce_purchase_surface/migration.sql
- **Acceptance:**
  - Prisma models exactly the design §4 server-side commerce entities and **no** `Cart`/`CartItem` (cart is client-only): `Order` (`userId, currency, subtotalMinor, discountMinor, totalMinor, status(pending|settled|cancelled), idempotencyKey, createdAt, settledAt?`); `OrderItemSnapshot` (`orderId, productId, version, licenceIdentifier, titleSnapshot, unitPriceMinor, currency`); `PaymentAttempt` (`orderId, provider('sandbox'), status(pending|settled|failed), createdAt, settledAt?`); `Entitlement` (`userId, productId, version, orderId, createdAt`); `DownloadEvent` (`entitlementId, userId, productId, version, issuedAt, sourceIpDigest`). Currency/licence vocabularies and the `User`/`Product`/`SellerProfile` relations reuse the shipped schema, not new copies.
  - Constraints encode the design §9 mitigations at the database layer: `Order.idempotencyKey` is `@unique` (replay double-submit returns the same order); `Entitlement` has `@@unique([userId, productId])` (one entitlement per owned product, created only via settlement); `OrderItemSnapshot` captures price/currency/licence/title/version columns so a later catalogue price edit cannot alter a past order (immutable — no mutable back-reference to live prices); `DownloadEvent` is append-only (no update/delete path implied by the model).
  - Indexes support every new list/lookup without table scans (design §9 "New list endpoints / DoS"): `Order.userId`, `Entitlement.userId`, `PaymentAttempt.orderId`, `DownloadEvent(entitlementId)` / `DownloadEvent(userId)`, and any ordering column the orders/library cursor lists need. Referential actions preserve order/entitlement/download history.
  - The migration replays cleanly with `prisma migrate deploy` after all four existing migrations on a disposable PostgreSQL database, introduces no sample orders/entitlements/products and no commerce provider choice, and enforces the constraints above. `prisma validate`, Prisma client generation, and `pnpm --filter @marketplace/api typecheck` pass.
- **Skills:** database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict

### T-a19c3d — Checkout, sandbox settle, and order-read API

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/commerce/commerce.module.ts, apps/api/src/commerce/checkout.controller.ts, apps/api/src/commerce/checkout.service.ts, apps/api/src/commerce/orders.controller.ts, apps/api/src/commerce/orders.service.ts, apps/api/src/commerce/settle.controller.ts, apps/api/src/commerce/settle.service.ts, apps/api/src/commerce/payment/payment.port.ts, apps/api/src/commerce/payment/sandbox-payment.adapter.ts, apps/api/src/commerce/commerce.controller.test.ts, apps/api/src/commerce/commerce.integration.test.ts
- **Acceptance:**
  - `POST /v1/checkout` (session-auth + CSRF + rate-limited) validates every `{ productId, licence }` against the **published** catalogue (reuses the shipped catalogue read; rejects unknown/draft/delisted products and unavailable licences with the shared 422/404 envelope) and computes `subtotalMinor/discountMinor/totalMinor` **server-side** from catalogue prices — client-sent prices/discounts are impossible by contract and ignored in fact (design §9 "Client cart → checkout / Tampering"). It creates the `Order` + immutable `OrderItemSnapshot`s + a `pending` `PaymentAttempt` in one transaction and returns the order + payment-attempt id.
  - `order.userId` is taken only from `session.user.id`, never from the request body (design §9 "checkout / Spoofing"). Checkout is idempotent on `idempotencyKey` via the unique constraint: a retry returns the original order rather than creating a duplicate (design §9 "checkout / Tampering (replay)"). The `discountCode` seam is accepted but has no Wave-1 effect.
  - `OrderItemSnapshot` price/currency/licence/title/version are captured at checkout and **never re-derived** from the live catalogue afterward; a test proves a later catalogue price change does not alter an existing order (design §9 "OrderItemSnapshot / Tampering").
  - `POST /v1/payment-attempts/:id/settle` is **sandbox-only, non-production env-guarded** (mirroring the capture-email adapter's `NODE_ENV !== "production"` gate), CSRF-protected, and scoped to the order's `userId`; a test proves it is **disabled outside the non-prod env** (design §9 "Sandbox settle / Elevation"). It transitions `PaymentAttempt` + `Order` to `settled` and creates the `Entitlement`s in one atomic transaction; entitlements are granted **only** by this server-side settle transaction — no client-reported "paid" is trusted (design §9 "Sandbox PaymentAttempt / Spoofing" and "Order → Entitlement grant / Elevation"). A `PaymentPort` abstracts the settle trigger; the sandbox adapter implements it now, and the production signature-verified webhook is shaped-but-not-enabled (go-live blocker — not implemented here).
  - `GET /v1/orders` and `GET /v1/orders/:id` are scoped to `session.user.id` and return `404` (not `403`) for a non-owned id (design §9 "Order read / Elevation (BOLA/IDOR)"); responses are the shared whitelist DTO (snapshots + status only), and `GET /v1/orders` is cursor-paginated with a schema-bounded limit (design §9 "New list endpoints / DoS"). No new endpoint can write an entitlement.
  - This module registers no providers into `app.module.ts` (that wiring is `T-7b2d84`). Controller/unit tests plus a disposable-PostgreSQL Supertest integration suite reading `COMMERCE_INTEGRATION_DATABASE_URL` cover money authority (client prices ignored), snapshot immutability, idempotent replay, BOLA 404s, the settle transaction, and the settle non-prod guard. `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, and the explicit integration run pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-c0a71e, T-d4b8f2

### T-e5f60b — Entitlements, library, and signed-download API (StoragePort)

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/entitlements/entitlements.module.ts, apps/api/src/entitlements/entitlements.controller.ts, apps/api/src/entitlements/entitlements.service.ts, apps/api/src/entitlements/downloads/storage.port.ts, apps/api/src/entitlements/downloads/local-storage.adapter.ts, apps/api/src/entitlements/downloads/download-token.controller.ts, apps/api/src/entitlements/downloads/download-audit.service.ts, apps/api/src/entitlements/entitlements.controller.test.ts, apps/api/src/entitlements/entitlements.integration.test.ts, apps/api/src/config/env.ts, apps/api/.env.example
- **Acceptance:**
  - `GET /v1/account/library` (session-auth) returns the caller's `Entitlement`s scoped to `session.user.id`, cursor-paginated with a schema-bounded limit; a second user never sees another user's entitlements (design §9 "Entitlement/library read / Elevation (BOLA)" and "New list endpoints / DoS"). There is no client-writable entitlement endpoint (grants happen only in the `T-a19c3d` settle transaction).
  - `POST /v1/entitlements/:id/download` (session-auth + CSRF + rate-limited) re-verifies an **active entitlement for the exact `(product, version)`** the entitlement grants before signing, scopes the issued URL to that object key, and returns `{ url, expiresAt }` (design §9 "Download issue / Elevation (BOLA/IDOR)"). Issuance is rate-limited per user/entitlement (design §9 "Download / DoS"). Tampering with productId/version or issuing for a non-owned entitlement yields `404`.
  - A provider-neutral `StoragePort` exposes `issueDownload(entitlement, product, version) → { url, expiresAt }`. The dev/CI `local-storage.adapter` mints an app-route HMAC token (short TTL, single-use) using a new `DOWNLOAD_TOKEN_HMAC_SECRET` (validated in `env.ts` as a 256-bit base64url secret, independent of the existing secrets) over a local private files directory configured by a new `LOCAL_ARTIFACT_STORAGE_DIR`; both new vars are documented in `.env.example`. The signed URL/token is **redacted from every log** (design §9 "Signed download URL / Info disclosure"). The production adapter (S3/R2 presigned) is shaped as the same port but not wired (go-live storage-provider decision, §8/§10).
  - `GET /v1/downloads/token/:token` is the **dev/CI adapter route only**: it verifies HMAC + TTL + single-use, streams the local private file, and never appears outside the non-prod adapter path (production returns a presigned object-store URL instead, bypassing this route).
  - Every issued URL writes exactly one append-only `DownloadEvent` (`user, product, version, issuedAt, sourceIpDigest` — IP keyed/digested, never raw), providing the download audit trail (design §9 "DownloadEvent / Repudiation").
  - This module registers no providers into `app.module.ts` (`T-7b2d84` wires it). Controller/unit tests plus a disposable-PostgreSQL Supertest integration suite reading `ENTITLEMENTS_INTEGRATION_DATABASE_URL` (seeding its own entitlement + local artifact fixture) cover BOLA scoping, exact-`(product, version)` re-verification, single-use/expiry token behavior, no-token-in-logs, and one-`DownloadEvent`-per-issue. `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, and the explicit integration run pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, web-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-c0a71e, T-d4b8f2

### T-f80a6c — Web commerce client and client-only cart store

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/lib/commerce-client.ts, apps/web/src/lib/commerce-client.test.ts, apps/web/src/lib/cart-store.tsx, apps/web/src/lib/cart-store.test.tsx, apps/web/src/components/providers.tsx
- **Acceptance:**
  - A typed `commerce-client` covers every Wave-1 mutation/read the web needs — `POST /v1/checkout`, `POST /v1/payment-attempts/:id/settle`, `GET /v1/orders`, `GET /v1/orders/:id`, `GET /v1/account/library`, `POST /v1/entitlements/:id/download` — building requests only from the shared `@marketplace/shared/commerce` schemas and validating every response with the matching shared schema before returning it (a malformed payload is rejected). It calls only the same-origin proxy and never a raw cross-origin `fetch`.
  - Every mutation sends the session-bound CSRF value via `X-CSRF-Token` (reusing the existing `use-session` CSRF state), per design §9 "All commerce mutations / CSRF". The download call is POST-to-issue only and returns `{ url, expiresAt }` to the caller — it **never** embeds a token in a request target, link, log, analytics, or referrer (design §9 "Download/entitlement tokens / Info disclosure").
  - A client-only cart store holds a browser-side `{ productId, licence }` list (no server cart, no guest-cart id, no merge), exposes add/remove/clear/read via a hook, persists across navigation, and is composed into `providers.tsx` beside the existing TanStack Query and currency providers. The store carries **no** price/total authority — any money it shows is display-only and the server response is authoritative (design §9 "Checkout/library flows / Tampering").
  - Unit tests prove response-schema validation (including a rejected payload), CSRF-header presence on mutations, no-token-leak on the download call, and cart add/remove/persist/independence. `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-api-integration, web-auth-state, web-security, shared-contracts, typescript-strict
- **Depends:** T-c0a71e

### T-7b2d84 — Compose commerce API modules and composed integration suite

- **Status:** review
- **Assignee:** ai
- **Files:** apps/api/src/app.module.ts, apps/api/src/main.ts, apps/api/test/commerce-flow.integration.test.ts
- **Acceptance:**
  - `app.module.ts` registers the new `CommerceModule` and `EntitlementsModule` beside the existing catalogue/auth/health/Prisma/config modules with no circular dependencies or duplicate providers; the Fastify bootstrap, versioning, Zod validation, exception filter, CSRF, and cookie support remain intact.
  - A disposable-PostgreSQL Supertest suite (reading `COMMERCE_FLOW_INTEGRATION_DATABASE_URL`, extending the Layer-5 harness) boots the real composed app and proves the end-to-end fulfilment path against a seeded purchasable product: `checkout → sandbox settle → entitlement → library → download` returns a working signed URL, and every response parses with its shared Zod schema.
  - The suite also proves the cross-cutting design §9/§11 guarantees at the composed HTTP seam: a second user cannot read another user's order or entitlement or issue a download for an entitlement they do not own (all `404`); the sandbox settle endpoint is **disabled** when the app runs with `NODE_ENV=production`; and no response or log leaks a payment reference or a download token/URL.
  - `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, the explicit composed-integration run, and root `pnpm lint && pnpm typecheck && pnpm test` pass.
- **Skills:** api-design, nestjs-backend, backend-auth-security, backend-testing, database-orm, typescript-strict
- **Depends:** T-a19c3d, T-e5f60b

### T-92b7e4 — Checkout dialog/sheet and result screen

- **Status:** review
- **Assignee:** ai
- **Files:** apps/web/src/components/checkout/checkout-dialog.tsx, apps/web/src/components/checkout/checkout-form.tsx, apps/web/src/components/checkout/order-summary.tsx, apps/web/src/app/[locale]/checkout/result/page.tsx, apps/web/messages/vi/checkout.json, apps/web/messages/en/checkout.json, apps/web/src/components/checkout/checkout-dialog.test.tsx
- **Acceptance:**
  - The checkout surface is a **dialog on desktop / full-screen sheet on mobile** (design §6) following the spec §4 Global/Vietnam + email + name + continue hierarchy, validated with react-hook-form + zod against the shared checkout request. It is **clearly labelled "Sandbox — no real payment."** On submit it POSTs `/v1/checkout` via the `T-f80a6c` client, then POSTs the sandbox settle for the returned payment-attempt id, then routes to `/[locale]/checkout/result`.
  - All prices and the order total shown are **display-only**; the authoritative amounts come from the server checkout/order response, and the form sends no price/discount/owner field (design §9 "Checkout/library flows / Tampering"). The optional coupon/discount field is **not** rendered in Wave 1 (Wave-2 seam).
  - `/[locale]/checkout/result` reads the resulting order (via the client) and shows the settled outcome with a link into the library; it never surfaces a payment reference or internal field. Responsive 320–1440px, ≥44px targets, visible focus, reduced-motion-safe; all copy from `messages/<locale>/checkout.json` with equal `vi`/`en` keys.
  - Component tests (including axe) cover the sandbox label, form validation, the checkout→settle→result call sequence with CSRF, display-only totals, and the result render. `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-data-forms, web-api-integration, web-security, ui-ux-pro-max, web-styling, web-responsive, web-i18n-theme, motion-design-principles, web-animations, typescript-strict
- **Depends:** T-f80a6c

### T-1d6f3a — Account orders, library, and download action

- **Status:** review
- **Assignee:** ai
- **Files:** apps/web/src/app/[locale]/account/orders/page.tsx, apps/web/src/app/[locale]/account/orders/[id]/page.tsx, apps/web/src/app/[locale]/account/library/page.tsx, apps/web/src/components/account/orders-list.tsx, apps/web/src/components/account/order-detail.tsx, apps/web/src/components/account/library-list.tsx, apps/web/src/components/account/download-action.tsx, apps/web/src/app/[locale]/account/page.tsx, apps/web/src/components/account/account-panel.tsx, apps/web/messages/vi/account.json, apps/web/messages/en/account.json, apps/web/src/components/account/download-action.test.tsx
- **Acceptance:**
  - `/[locale]/account/orders` lists the caller's orders and `/[locale]/account/orders/[id]` shows one order's snapshots + status (both via the `T-f80a6c` client, scoped server-side; a non-owned id surfaces the client's `404`/not-found handling). `/[locale]/account/library` lists owned entitlements. The account landing (`account/page.tsx`, `account-panel.tsx`) is updated so its previously-deferred "orders" and "library" entries now link to these real pages.
  - The library download action POSTs `/v1/entitlements/:id/download` (CSRF via the client) and **opens the returned short-lived URL** — it never renders a token in an anchor `href`, query string, or any pre-fetched link, and never logs it (design §9 "Download/entitlement tokens / Info disclosure"). All amounts shown are display-only.
  - Responsive 320–1440px, ≥44px targets, visible focus, reduced-motion-safe; all copy from `messages/<locale>/account.json` with equal `vi`/`en` keys.
  - Component tests (including axe) cover the orders/library render, the download action's POST-then-open sequence with a no-token-in-DOM assertion, and the not-found path. `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-api-integration, web-auth-state, web-security, ui-ux-pro-max, web-responsive, web-i18n-theme, typescript-strict
- **Depends:** T-f80a6c

### T-3c9e15 — Gate the commerce integration suites in CI

- **Status:** todo
- **Assignee:** ai
- **Files:** .github/workflows/ci.yml
- **Acceptance:**
  - `ci.yml` provisions one freshly-migrated disposable PostgreSQL database per new commerce integration suite and exports `COMMERCE_INTEGRATION_DATABASE_URL` (`T-a19c3d`), `ENTITLEMENTS_INTEGRATION_DATABASE_URL` (`T-e5f60b`), and `COMMERCE_FLOW_INTEGRATION_DATABASE_URL` (`T-7b2d84`) — one dedicated DB each, per the recorded per-suite-DB gotcha — so these real-HTTP-to-database seams actually gate merges.
  - It also exports the test-only values these suites need: an explicit `DOWNLOAD_TOKEN_HMAC_SECRET` (canonical base64url 256-bit test value, distinct from the existing secrets) and a `LOCAL_ARTIFACT_STORAGE_DIR` pointing at a workspace path seeded with the artifact fixture. No production credential is introduced; every secret is an explicit test value.
  - The existing `pnpm turbo run lint typecheck test` gate, the previously-added catalogue/auth integration DB wiring, Node 20 + pnpm pinning, and PR/`main`/`develop` triggers are preserved; the task changes only `ci.yml`. Workflow YAML passes static validation, and the full CI run is verified in a real terminal outside the agent session per the heavy-build rule.
- **Skills:** git-workflow, backend-testing, security-review
- **Depends:** T-a19c3d, T-e5f60b, T-7b2d84

### T-b57c09 — Cart page and add-to-cart affordances

- **Status:** todo
- **Assignee:** ai
- **Files:** apps/web/src/app/[locale]/cart/page.tsx, apps/web/src/components/cart/cart-view.tsx, apps/web/src/components/cart/cart-line.tsx, apps/web/src/components/cart/add-to-cart-button.tsx, apps/web/src/components/cart/cart-nav-entry.tsx, apps/web/src/components/app-shell.tsx, apps/web/src/components/catalogue/product-card.tsx, apps/web/src/components/product-detail/detail-header.tsx, apps/web/messages/vi/cart.json, apps/web/messages/en/cart.json, apps/web/src/components/cart/cart-view.test.tsx
- **Acceptance:**
  - `/[locale]/cart` renders the client cart from the `T-f80a6c` store (line items with localized title, licence, and selected-currency display price via the existing formatter; add/remove/clear; honest empty state), and hosts a "Proceed to checkout" control that opens the `T-92b7e4` checkout dialog/sheet. All money shown is display-only; the store carries no total authority.
  - An `add-to-cart-button` wired into the catalogue `product-card` and the product-detail header adds `{ productId, licence }` to the store (replacing the current deferred/sandbox placeholder affordances), and a cart entry point in `app-shell.tsx` reflects the current cart count. No server cart call is made — the cart is purely client-side until checkout (design §1/§9 client-cart trust model).
  - Responsive 320–1440px, ≥44px targets, visible focus, reduced-motion-safe, no 320px horizontal overflow; all copy from `messages/<locale>/cart.json` with equal `vi`/`en` keys.
  - Component tests (including axe) cover add/remove/empty rendering, the cart count in the shell, and opening checkout from the cart. `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-app-foundation, web-data-forms, web-api-integration, ui-ux-pro-max, web-styling, web-responsive, web-i18n-theme, web-security, typescript-strict
- **Depends:** T-f80a6c, T-92b7e4

### T-e3a9d7 — Cross-viewport Playwright e2e for the purchase happy path

- **Status:** todo
- **Assignee:** ai
- **Files:** apps/web/e2e/commerce.spec.ts, apps/web/e2e/fixtures/purchasable-product.ts, apps/web/e2e/README.md, apps/api/prisma/seed-e2e.mjs
- **Acceptance:**
  - Playwright drives the Wave-1 happy path against the served full stack (web + API + disposable Postgres + the local `StoragePort` adapter): add to cart → open checkout (sandbox) → checkout → sandbox settle → checkout result → account/library → download, in both `vi`/`en` and `VND`/`USD`, across representative viewports from 320–1440px. The seed (`seed-e2e.mjs`) is extended with one purchasable product plus a local private artifact file so the download actually streams.
  - The spec asserts the download works end-to-end and that **no download token/URL, session, or CSRF material appears in any page URL or client-readable storage** at any step (design §9 token/trust-model rows), each visited page passes axe WCAG 2.2 AA, and there is zero page-level horizontal overflow at every tested width.
  - `e2e/commerce.spec.ts` reuses the Layer-5 `playwright.config.ts` and capture-email seam and is statically valid and lint/typecheck clean; the full Playwright run (needs a built/served stack) is executed in a real terminal outside the agent session per the heavy-build rule, and `e2e/README.md` documents the added services/env (`DOWNLOAD_TOKEN_HMAC_SECRET`, `LOCAL_ARTIFACT_STORAGE_DIR`, the seeded purchasable product). No `package.json`/`pnpm-lock.yaml` edits.
- **Skills:** web-testing-release, web-responsive, web-security, backend-testing, typescript-strict
- **Depends:** T-7b2d84, T-92b7e4, T-1d6f3a, T-b57c09

---

## Layer completion gate

Layer 7 (Commerce Wave 1) is complete when:

- Every Wave-1 endpoint (`POST /v1/checkout`, `POST /v1/payment-attempts/:id/settle`,
  `GET /v1/orders`, `GET /v1/orders/:id`, `GET /v1/account/library`,
  `POST /v1/entitlements/:id/download`, and the dev/CI
  `GET /v1/downloads/token/:token`) has Supertest integration coverage running
  against a disposable PostgreSQL database, and those suites gate merges in
  `ci.yml`.
- The web flows have Vitest/RTL component coverage, and the Playwright
  cart → checkout → sandbox-settle → library → download happy path passes
  cross-viewport in `vi`/`en` and `VND`/`USD`.
- Every design §9 Wave-1 STRIDE mitigation maps to a merged Acceptance line
  (server-side price/discount authority + immutable snapshots; session-scoped
  ownership/entitlement checks with no client owner id and `404` on non-owned;
  private-bucket, short-TTL, single-use, redacted-log signed download URLs;
  atomic idempotent order/payment/entitlement writes; the non-prod guard on the
  settle endpoint proven disabled in production), and `security-review` finds no
  high-confidence findings against the merged diffs.
- Full workspace `pnpm lint && pnpm typecheck && pnpm test` is green.
- **Payment production remains an explicit go-live blocker** (design §1/§6/§8):
  the sandbox two-step settle is built and the `PaymentPort` boundary is shaped,
  but the real payment provider + signature-verified webhook and the production
  object-storage provider are **not** enabled by this layer. Those decisions,
  plus all Wave-2 engagement features (wishlist, coupons/referrals/
  discount-quotes, verified reviews), are the input to a **later**
  `/scope-breakdown` pass over the same approved design — not created by this
  file.
