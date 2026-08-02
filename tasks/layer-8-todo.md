# Layer 8 — Seller Authoring (First-Party)

Status: **todo**

This is the seller **authoring** implementation layer, derived from the
user-approved design `docs/specs/2026-08-01-seller-authoring-design.md`
(the `T-b13e77` gate, approved 2026-08-01). Layer 6's seller enablement gate is
done, so this scope pass is legitimate: it turns the approved design's v1
authoring surface into an ordered, parallel-safe implementation layer.

**v1 = first-party authoring only.** Trusted/internal, admin-provisioned
`seller`s may author their **own** `Product` (draft) and `ProductVersion`,
attach translations/media/compatibility/specs/demo pages, and
**submit-for-review** — they may never self-publish. Every design §8 STRIDE
mitigation in scope for this layer lands as an explicit Acceptance line so the
post-merge `security-review` can check it.

**Inherited invariants (reused from Layers 0–7, not re-litigated):**
same-origin Next proxy (`app/api/[...proxy]` already forwards every `/v1/*`, so
no proxy change is needed for the new endpoints); `__Host-kitvera_session`;
session-auth + CSRF guards; DB-backed rate limiter; every owned row scoped to
the authenticated principal; `@marketplace/shared` Zod contracts on both sides
(web imports via its `@shared/*` alias); NestJS/Fastify/Prisma backend; the
allowlist `createZodDto` DTO pattern; TypeScript strict, no `any`.

**Ownership rides the existing substrate (design §3/§4).** `SellerProfile`,
`Product.sellerId` (already indexed `[sellerId, publicationState, createdAt]`),
and `Role`/`UserRole` already exist. This layer **extends** authorization; it
does not rewrite it. The server derives `sellerId` from the authenticated
principal's `SellerProfile`, **never** from a request body.

## Resolved design decision — review sub-state shape (design §4)

The spec left the concrete review-state shape to this scope pass (add
`in_review`/`approved` to `PublicationState` **vs** a separate state on
`ProductVersion`). **Decision: a new `ReviewState` enum on `ProductVersion`
(`draft → in_review → approved`), not new `PublicationState` values.**

- Rationale: it is the smallest, additive change and keeps the **shipped**
  public `PublicationState` (`draft|published|delisted`) and the shipped
  catalogue read contract/filter (`@marketplace/shared` `catalogue.ts`
  `publicationStateSchema`, the public `where publicationState = published`
  reads) **untouched** — so no shipped public contract drifts. Review is
  modeled at the `ProductVersion` release granularity that `Artifact`/`BuildRun`
  attach to.
- Invariant, held consistent across the shared contract + Prisma + API tasks:
  a **seller** may move a version `draft → in_review` **only**; the **admin**
  (gate `T-4c8a9e`) moves `in_review → approved` and then flips the product's
  `publicationState draft → published` referencing the approved version and its
  approved `Artifact`. Publication stays `Product`-level and admin-owned — it is
  **not** in this layer.

## Dependency rounds

Ordered by dependency; tasks in the same round touch disjoint files and are
safe to fan out to parallel `task-implementer` worktrees.

1. **Round 1 — Contracts & persistence (parallel):** `T-5a2f7b` (shared seller
   authoring Zod contracts), `T-9c4e18` (Prisma `Artifact` + `BuildRun` +
   `ReviewState` + migration). Both derive directly from the approved design
   (§4/§6); neither depends on the other.
2. **Round 2 — API resources & web data layer (parallel):** `T-2d8b06`
   (`seller` guard + seller-scoped authoring module), `T-6f1a93` (factory→API
   signed-artifact ingest module), `T-84c3de` (web seller authoring client).
   Each depends only on Round 1.
3. **Round 3 — Composition & web authoring surface (parallel):** `T-7e0b52`
   (wire the API modules + composed disposable-Postgres integration suite),
   `T-b9d4a1` (`/[locale]/seller/*` authoring screens). Depend on Round 2.
4. **Round 4 — CI gate:** `T-3af6c8` (gate the new seller integration suites in
   `ci.yml`).
5. **Round 5 — End-to-end gate:** `T-c15e29` (Playwright seller draft →
   version → submit-for-review happy path).

## Out of scope for this layer (design §2 DEFERS + gate T-4c8a9e)

Do **not** scope any of the following here — they are documented deferrals or
belong to the admin gate `T-4c8a9e`:

- **Public seller signup / open marketplace-of-sellers, KYC, commissions/
  payouts, seller sales/revenue dashboards, in-marketplace build execution** —
  design §2 DEFERS.
- **`seller`-role provisioning UI/endpoint** (admin grants the role),
  **publish/approve/delist** endpoints, the **append-only publication audit
  log**, and the `in_review → approved → published` admin transitions — all owned
  by gate `T-4c8a9e`. This layer's tests seed a `seller` `Role` + `UserRole`
  directly; it builds **no** self-service role-request path.

---

### T-5a2f7b — Shared seller authoring Zod contracts

- **Status:** done
- **Assignee:** ai
- **Files:** packages/shared/src/seller.ts, packages/shared/src/seller.test.ts, packages/shared/src/index.ts, packages/shared/package.json
- **Acceptance:**
  - `@marketplace/shared` gains a new `./seller` subpath (mirroring the existing `./catalogue`/`./commerce` entries in `package.json` `exports`, re-exported from `src/index.ts`) exporting strict Zod request/response schemas and inferred types for the v1 authoring surface, **reusing** the existing catalogue primitives (`slugSchema`, `semanticVersionSchema`, `categorySlugSchema`, `licenceIdentifierSchema`, `localeSchema`, `currencySchema`, translation/media/compatibility/spec/demo shapes, the cursor/envelope primitives) rather than redefining them.
  - A `reviewStateSchema` enum is exactly `draft|in_review|approved` (matching the Prisma `ReviewState` in `T-9c4e18`). The **seller-facing** request/response contracts are: the create-draft-product request; the edit-draft-product (`PATCH`) request; the create-version request; the submit-for-review request/response; the seller product-list response and the seller product-detail response (which surfaces the product's own `publicationState` **plus** each version's `reviewState` and any linked artifact/build metadata the seller may see — no buyer/order/revenue fields).
  - Request schemas are **allowlists** that make the design §5/§8 mass-assignment defense representable in the type system: **no** `sellerId`, `publicationState`, `isFeatured`, price authority, `reviewState`, `Artifact.checksum`, or `Artifact.signature` field can parse from any authoring request body. State transitions are their own dedicated request shapes, not a field on the generic edit request.
  - A separate **factory→API ingest** contract is exported for the artifact/build-run record: the signed ingest request payload (product/version key, storage id/URI, `checksum`, `signature`, size, produced-at, factory run id, QA/scan verdicts) and its response. This is the server-to-server contract for `T-6f1a93`, kept distinct from the browser-facing seller schemas.
  - Contract tests accept representative valid authoring/ingest payloads and reject: any server-owned field smuggled into an authoring request (`sellerId`/`publicationState`/`reviewState`/`isFeatured`/price/`checksum`/`signature`), an unknown licence/currency/category/locale, an over-long list, a malformed semantic version, and any persistence-only or buyer/order field in a seller response. `pnpm --filter @marketplace/shared typecheck` and `pnpm --filter @marketplace/shared test` pass.
- **Skills:** shared-contracts, api-design, typescript-strict

### T-9c4e18 — Prisma Artifact/BuildRun models, ReviewState, and migration

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260802000000_seller_authoring/migration.sql
- **Acceptance:**
  - Adds a `ReviewState` enum (`draft|in_review|approved`) and a `reviewState` column (default `draft`) to `ProductVersion` — an **additive** change that does **not** alter the shipped `PublicationState` enum, the `Product.publicationState` semantics, or any shipped public catalogue read/filter. No existing column is renamed or dropped.
  - Adds an immutable **`Artifact`** record model — stable version key, storage id/URI, `checksum`, `signature`, size (bytes), produced-at, factory run id — linked one-to-one to a `ProductVersion` (`@@unique` on the version relation so a version has at most one approved artifact). No file bytes flow through the marketplace beyond the commerce gate's existing signed-download path; `Artifact` stores only metadata.
  - Adds a **`BuildRun`** record model — status, started-at, finished-at, factory run id, resulting `Artifact` id (nullable until success), and the QA/scan verdicts from design §5 — linked to the `ProductVersion`. It is a provenance **record**; the schema implies no executor, no build queue, and no marketplace-side build step.
  - Constraints encode the design §8 mitigations at the database layer: `Artifact.checksum`/`signature` are required and immutable (no update path implied); the version↔artifact link is unique; indexes support the seller's own product/version/review-state list and lookups (`ProductVersion(productId, reviewState)` or equivalent) and the ingest lookup by version key + factory run id without table scans. Referential actions preserve authoring history (`onDelete: Restrict`, matching the shipped schema).
  - The migration replays cleanly with `prisma migrate deploy` after all existing migrations on a disposable PostgreSQL database, introduces no sample products/artifacts/build-runs and no build-executor infrastructure, and enforces the constraints above. `prisma validate`, Prisma client generation, and `pnpm --filter @marketplace/api typecheck` pass.
- **Skills:** database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict

### T-2d8b06 — Seller guard and seller-scoped authoring API

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/seller/seller.module.ts, apps/api/src/seller/seller.guard.ts, apps/api/src/seller/seller-principal.ts, apps/api/src/seller/seller-products.controller.ts, apps/api/src/seller/seller-products.service.ts, apps/api/src/seller/seller-versions.controller.ts, apps/api/src/seller/seller-versions.service.ts, apps/api/src/seller/seller-review.controller.ts, apps/api/src/seller/seller-review.service.ts, apps/api/src/seller/seller.controller.test.ts, apps/api/src/seller/seller.integration.test.ts
- **Acceptance:**
  - A `SellerGuard` runs **after** the existing `SessionAuthGuard`: it reads the authenticated principal's `Role`/`UserRole` assignments, requires the `seller` role, resolves the principal's `SellerProfile`, and exposes a `sellerId` on the request context via a `seller-principal` helper (mirroring `session-context.ts`). A user without the `seller` role gets `403`; a `seller` with no `SellerProfile` is rejected, never auto-provisioned. `sellerId` is **only** ever read from this server-resolved context, never from a body/query (design §8 "role provisioning / Elevation").
  - `POST /v1/seller/products` (session-auth + CSRF + rate-limited, seller-guarded) creates a **draft** `Product` owned by the resolved `sellerId` from an allowlist `createZodDto` (`T-5a2f7b`); `publicationState`, `isFeatured`, price authority, `sellerId`, and `reviewState` are **not** bindable from the body (design §8 "mass-assignment"). `PATCH /v1/seller/products/:id` edits **own, draft-only** products; attaching translations/media/compatibility/specs/demo pages to own products goes through this allowlisted authoring path.
  - `POST /v1/seller/products/:id/versions` creates a `ProductVersion` (default `reviewState = draft`) on an **owned** product. `POST /v1/seller/products/:id/submit-for-review` is a **dedicated guarded transition** (not a generic `PATCH`) that moves the target version `draft → in_review` **only**; any attempt to reach `approved`/`published` or to publish is rejected `403`/`422` — a seller can **never** self-publish (design §8 "QA/publication state machine / Elevation"). The transition is idempotent-safe and rejects transitions from a non-`draft` state.
  - `GET /v1/seller/products` and `GET /v1/seller/products/:id` are scoped `where sellerId = principal.sellerId`, cursor-paginated with a schema-bounded limit, and return the shared seller DTO (own product + version `reviewState` + linked artifact/build metadata only — **no** buyer PII, orders, or revenue). Any read/edit/submit of a **non-owned** product returns `404` (not `403`) so ownership is not enumerable (design §8 "authoring / BOLA" + "seller read / Info disclosure").
  - This module registers no providers into `app.module.ts` (that wiring is `T-7e0b52`). Controller/unit tests plus a disposable-PostgreSQL Supertest integration suite reading `SELLER_INTEGRATION_DATABASE_URL` (seeding a `seller` `Role`/`UserRole` + two `SellerProfile`s) cover: non-seller `403`; seller-A cannot read/edit/submit seller-B's product (`404`); server-owned fields ignored/rejected on create+edit; `submit-for-review` allows only `draft → in_review` and blocks self-publish; own-only list/detail scoping. `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, and the explicit integration run pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-5a2f7b, T-9c4e18

### T-6f1a93 — Factory→API signed-artifact ingest

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/factory-ingest/factory-ingest.module.ts, apps/api/src/factory-ingest/factory-ingest.controller.ts, apps/api/src/factory-ingest/factory-ingest.service.ts, apps/api/src/factory-ingest/factory-signature.guard.ts, apps/api/src/factory-ingest/factory-ingest.controller.test.ts, apps/api/src/factory-ingest/factory-ingest.integration.test.ts, apps/api/src/config/env.ts, apps/api/.env.example
- **Acceptance:**
  - `POST /v1/factory/artifacts` is a **server-to-server** endpoint (design §2/§4/§6): it is **not** behind the session/seller guard and is **not** browser-facing. A `FactorySignatureGuard` verifies an HMAC signature over the canonical ingest payload using a new `FACTORY_INGEST_HMAC_SECRET` (validated in `env.ts` with the existing 256-bit unpadded-base64url `secretSchema`, independent of every other secret; documented in `.env.example`). A missing/invalid signature is rejected `401`; the guard is constant-time and the secret/signature are **redacted from every log** (design §8 "Artifact ingest / Tampering").
  - On a valid signature the service **verifies the artifact `checksum`** against the signed payload, then records an immutable `Artifact` (`checksum`, `signature`, storage id/URI, size, produced-at, factory run id) and its `BuildRun` (status + QA/scan verdicts) linked to the addressed `ProductVersion`. Ingest is **idempotent** on the version key + factory run id (a replay returns the existing record, never a duplicate or a mutated checksum) so the ZIP cannot be forged/replaced after QA (design §8 "Artifact ingest / Tampering", "File Integrity"). It links artifacts only; it **executes nothing** (design §8 "malicious code" — builds run in the external factory under §7 isolation, outside this trust boundary).
  - The ingest addresses an existing `ProductVersion` by its stable version key; an unknown version or a checksum/signature mismatch yields `404`/`422` and writes no partial record. Ingest never changes `reviewState` or `publicationState` (approval/publish stay admin-only, gate `T-4c8a9e`).
  - This module registers no providers into `app.module.ts` (`T-7e0b52` wires it). Controller/unit tests plus a disposable-PostgreSQL Supertest integration suite reading `FACTORY_INGEST_INTEGRATION_DATABASE_URL` (seeding a product/version fixture) cover: valid signed ingest creates exactly one `Artifact`+`BuildRun`; invalid/absent signature `401`; tampered checksum `422`; idempotent replay; no secret/signature in logs; ingest cannot mutate review/publication state. `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, and the explicit integration run pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, web-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-5a2f7b, T-9c4e18

### T-84c3de — Web seller authoring client

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/lib/seller-client.ts, apps/web/src/lib/seller-client.test.ts
- **Acceptance:**
  - A typed `seller-client` covers every v1 authoring call the web needs — `POST /v1/seller/products`, `PATCH /v1/seller/products/:id`, `POST /v1/seller/products/:id/versions`, `POST /v1/seller/products/:id/submit-for-review`, `GET /v1/seller/products`, `GET /v1/seller/products/:id` — building requests only from the shared `@shared/seller` schemas and validating every response with the matching shared schema before returning it (a malformed payload is rejected). It calls only the same-origin proxy (reusing `api-client`), never a raw cross-origin `fetch`, and never the factory ingest endpoint (server-to-server only).
  - Every mutation sends the session-bound CSRF value via `X-CSRF-Token` (reusing the existing `use-session` CSRF state, matching `commerce-client`), per design §5/§8 "session / re-check". The client carries **no** `sellerId`, price, publication, or review-state authority in any request body — those are server-owned and impossible by contract.
  - Unit tests prove response-schema validation (including a rejected payload), CSRF-header presence on mutations, the omission of server-owned fields from request bodies, and correct cursor handling on the product list. `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-api-integration, web-auth-state, web-security, shared-contracts, typescript-strict
- **Depends:** T-5a2f7b

### T-7e0b52 — Compose seller API modules and composed integration suite

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/app.module.ts, apps/api/test/seller-authoring.integration.test.ts
- **Acceptance:**
  - `app.module.ts` registers the new `SellerModule` and `FactoryIngestModule` beside the existing catalogue/auth/commerce/entitlements/health/Prisma/config modules with no circular dependencies or duplicate providers; the Fastify bootstrap, versioning, Zod validation, exception filter, CSRF, and cookie support remain intact.
  - A disposable-PostgreSQL Supertest suite (reading `SELLER_FLOW_INTEGRATION_DATABASE_URL`, extending the Layer-5 harness) boots the real composed app and proves the end-to-end authoring path against a seeded `seller`-role user + `SellerProfile`: create draft product → add version → factory signed-artifact ingest links the `Artifact`/`BuildRun` → submit-for-review moves the version `draft → in_review` → the seller detail read reflects it, with every response parsing against its shared Zod schema.
  - The suite also proves the cross-cutting design §8 guarantees at the composed HTTP seam: a non-`seller` session is `403` on every authoring endpoint; seller-A cannot read/edit/submit seller-B's product or version (all `404`); a seller cannot reach `approved`/`published` (no self-publish); the factory ingest rejects an unsigned/tampered payload and never appears behind the session/seller guard; and no response or log leaks the ingest secret, an artifact signature, or buyer/order data.
  - `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, the explicit composed-integration run, and root `pnpm lint && pnpm typecheck && pnpm test` pass.
- **Skills:** api-design, nestjs-backend, backend-auth-security, backend-testing, database-orm, typescript-strict
- **Depends:** T-2d8b06, T-6f1a93

### T-b9d4a1 — Seller authoring surface (/[locale]/seller/*)

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/app/[locale]/seller/page.tsx, apps/web/src/app/[locale]/seller/products/new/page.tsx, apps/web/src/app/[locale]/seller/products/[id]/page.tsx, apps/web/src/components/seller/seller-product-list.tsx, apps/web/src/components/seller/product-authoring-form.tsx, apps/web/src/components/seller/version-form.tsx, apps/web/src/components/seller/submit-for-review-action.tsx, apps/web/src/components/seller/review-state-badge.tsx, apps/web/src/components/app-shell.tsx, apps/web/messages/vi/seller.json, apps/web/messages/en/seller.json, apps/web/src/components/seller/product-authoring-form.test.tsx
- **Acceptance:**
  - `/[locale]/seller` lists the signed-in seller's **own** products (via the `T-84c3de` client) with each product's `publicationState` and each version's `reviewState` shown through the `review-state-badge`; it surfaces honest empty/loading/error states and **no** buyer/order/revenue data (design §2/§8). The surface is UX-gated for `seller`s but relies on the server guard for authority — a non-seller reaching it sees the client's `403`/not-authorised handling, never fabricated data.
  - The product authoring form (create at `products/new`, edit own draft at `products/[id]`) uses react-hook-form + zod against the shared authoring request, lets the seller author translations/media/compatibility/specs/demo pages, and **never** renders or sends a `sellerId`, price-authority, `publicationState`, `isFeatured`, or `reviewState` field (server-owned). The version form adds a `ProductVersion`; `submit-for-review-action` POSTs the dedicated transition (CSRF via the client) and reflects the resulting `in_review` state — there is **no** self-publish/approve control anywhere in this surface (design §8 "state machine").
  - A seller entry point is added to `app-shell.tsx`, shown only in the seller context; it does not alter the existing customer/account navigation for non-sellers. Responsive 320–1440px, ≥44px targets, visible focus, reduced-motion-safe, no 320px horizontal overflow; all copy from `messages/<locale>/seller.json` with equal `vi`/`en` keys.
  - Component tests (including axe) cover the product-list render, authoring-form validation, the omission of server-owned fields from the DOM/form, the create→version→submit-for-review call sequence with CSRF, and the absence of any publish/approve control. `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-data-forms, web-api-integration, web-auth-state, web-security, ui-ux-pro-max, web-styling, web-responsive, web-i18n-theme, typescript-strict
- **Depends:** T-84c3de

### T-3af6c8 — Gate the seller integration suites in CI

- **Status:** done
- **Assignee:** ai
- **Files:** .github/workflows/ci.yml
- **Acceptance:**
  - `ci.yml` provisions one freshly-migrated disposable PostgreSQL database per new seller integration suite and exports `SELLER_INTEGRATION_DATABASE_URL` (`T-2d8b06`), `FACTORY_INGEST_INTEGRATION_DATABASE_URL` (`T-6f1a93`), and `SELLER_FLOW_INTEGRATION_DATABASE_URL` (`T-7e0b52`) — one dedicated DB each, per the recorded per-suite-DB gotcha — so these real-HTTP-to-database seams actually gate merges.
  - It also exports the test-only value the ingest suites need: an explicit `FACTORY_INGEST_HMAC_SECRET` (canonical unpadded base64url 256-bit test value, distinct from every existing secret). No production credential is introduced; every secret is an explicit test value.
  - The existing `pnpm turbo run lint typecheck test` gate, the previously-added catalogue/auth/commerce/entitlements integration DB wiring, Node 20 + pnpm pinning, and PR/`main`/`develop` triggers are preserved; the task changes only `ci.yml`. Workflow YAML passes static validation, and the full CI run is verified in a real terminal outside the agent session per the heavy-build rule.
- **Skills:** git-workflow, backend-testing, security-review
- **Depends:** T-2d8b06, T-6f1a93, T-7e0b52

### T-c15e29 — Cross-viewport Playwright e2e for the seller authoring happy path

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/e2e/seller-authoring.spec.ts, apps/web/e2e/fixtures/seller-user.ts, apps/web/e2e/README.md, apps/api/prisma/seed-e2e.mjs
- **Acceptance:**
  - Playwright drives the v1 authoring happy path against the served full stack (web + API + disposable Postgres): sign in as a **seeded** `seller`-role user (the seed extends `seed-e2e.mjs` with a `seller` `Role`/`UserRole` + `SellerProfile`, since admin provisioning is out of scope) → create a draft product → add a version → submit-for-review → see the version reach `in_review`, in both `vi`/`en`, across representative viewports from 320–1440px.
  - The spec asserts there is **no** self-publish/approve affordance anywhere in the seller surface, that a non-seller session cannot reach `/[locale]/seller` authoring, that no server-owned field or ingest secret is client-readable at any step, that each visited page passes axe WCAG 2.2 AA, and that there is zero page-level horizontal overflow at every tested width.
  - `e2e/seller-authoring.spec.ts` reuses the Layer-5 `playwright.config.ts` and capture-email seam and is statically valid and lint/typecheck clean; the full Playwright run (needs a built/served stack) is a full run that is an **out-of-session terminal step** per the heavy-build rule, and `e2e/README.md` documents the added seller seed + env. No `package.json`/`pnpm-lock.yaml` edits.
- **Skills:** web-testing-release, web-responsive, web-security, backend-testing, typescript-strict
- **Depends:** T-7e0b52, T-b9d4a1

---

## Layer completion gate

Layer 8 (Seller Authoring) is complete when:

- Every v1 authoring endpoint (`POST /v1/seller/products`,
  `PATCH /v1/seller/products/:id`, `POST /v1/seller/products/:id/versions`,
  `POST /v1/seller/products/:id/submit-for-review`, `GET /v1/seller/products`,
  `GET /v1/seller/products/:id`, and the server-to-server
  `POST /v1/factory/artifacts`) has Supertest integration coverage running
  against a disposable PostgreSQL database, and those suites gate merges in
  `ci.yml`.
- The web authoring flows have Vitest/RTL component coverage, and the Playwright
  seller draft → version → submit-for-review happy path is authored,
  static-valid, and cross-viewport in `vi`/`en` (full run out-of-session).
- Every in-scope design §8 STRIDE mitigation maps to a merged Acceptance line
  (admin-provisioned role with no self-escalation and server-derived `sellerId`;
  every seller query scoped to the principal's `sellerId` with `404` on
  non-owned; allowlist DTOs rejecting server-owned fields; state transitions via
  dedicated guarded endpoints with seller limited to `draft → in_review` and no
  self-publish; signature+checksum-verified, idempotent, log-redacted factory
  ingest that executes nothing), and `security-review` finds no high-confidence
  findings against the merged diffs.
- Full workspace `pnpm lint && pnpm typecheck && pnpm test` is green.
- **Publication stays admin-owned and out of this layer** (design §2/§4, gate
  `T-4c8a9e`): the `seller`-role provisioning UI/endpoint, the
  `in_review → approved → published` transitions, publish/delist, and the
  append-only publication audit log are the input to the **admin surface**
  `/scope-breakdown` pass over `docs/specs/2026-08-01-admin-surface-design.md` —
  not created by this file.
