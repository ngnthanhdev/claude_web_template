# Checkpoint

## Recent commits

```
26ca67f chore: rename AGENTS.md to CLAUDE.md
3d14194 chore(tasks): complete layer 4 public API resources
e0e9328 feat(api): compose and verify public catalogue and auth resources
3c840e3 Merge bounded denied magic link writes into codex/layer-4-api
d5a8ad7 fix(auth): bound denied magic-link writes
16ddedd Merge non-blocking auth rate limit fix into codex/layer-4-api
7488e1a Merge branch 'codex/layer-4/auth-core' into codex/layer-4/magic-links
3530504 fix(auth): bound rate-limit contention
709c59e Merge magic link response timing fix into codex/layer-4-api
dc8ffb3 fix(auth): equalize magic-link initiation timing
d5de460 Merge session CSRF ordering fix into codex/layer-4-api
791b1b5 fix(auth): validate csrf before session mutation
1d94e17 chore(tasks): queue session resource review
e3f58ac Merge branch 'codex/layer-4/sessions' into codex/layer-4-api
eb89cc2 chore(tasks): queue magic link review
1eec8e2 feat(auth): implement session resources
ebd7b19 Merge branch 'codex/layer-4/magic-links' into codex/layer-4-api
fce17a8 feat(auth): implement magic-link redemption flow
a543471 Merge branch 'codex/layer-4/auth-core' into codex/layer-4/sessions
dd5b095 Merge branch 'codex/layer-4/auth-core' into codex/layer-4/magic-links
```

## Completed tasks

# Done

Completed tasks, appended here by `/next-layer` as each layer finishes.
Grouped under a `## Layer N` (or `## Refinement`) heading, most recent first.
Each task keeps its original `T-xxxxxx` id and task-block schema (`Status`,
`Assignee`, `Files`, `Acceptance`, `Skills`, optional `Depends`) unchanged
except `Status`, which is `done` for everything in this file.

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

## Architecture

Layer 4 turned the proven contracts + persistence into the first live public
HTTP surface. Nothing new was added to the web app this layer.

```
packages/shared (zod)  ──imported by──►  apps/api (NestJS on Fastify)
   catalogue.ts / auth.ts                    AppModule
                                              ├─ ConfigModule (validateEnv, global)
                                              ├─ PrismaModule ─► PostgreSQL
                                              ├─ HealthModule            GET /health
                                              ├─ CatalogueModule         GET /v1/categories
                                              │                          GET /v1/products
                                              │                          GET /v1/products/:slug
                                              └─ AuthModule
                                                 ├─ AuthCoreModule  (crypto, rate-limit,
                                                 │                   session services — shared)
                                                 ├─ MagicLinksModule  POST /v1/auth/magic-links (202)
                                                 │                    POST /v1/auth/magic-link-redemptions (201)
                                                 └─ SessionsModule    GET    /v1/sessions/current
                                                                      DELETE /v1/sessions/current (204)
                                                                      DELETE /v1/sessions        (204)
```

Bootstrap (`main.ts`): URI versioning (`/v1`), `nestjs-zod` global pipe,
`ApiExceptionFilter`, `@fastify/cookie`, credentialed explicit-origin CORS,
Helmet, shutdown hooks, `trustProxy` left at its safe default (off).

## Key decisions (WHY)

- **Catalogue split from auth within the layer.** Catalogue is read-only over
  the migration-seeded taxonomy and had no auth dependency, so it shipped in
  parallel with the auth core; magic-links and sessions both depend on the auth
  core, so that landed first, then the two feature modules.
- **Passwordless is anti-enumeration by construction.** Initiation always
  returns the same generic `202 {status:"accepted"}` for new/existing/limited/
  suppressed/failed cases and never creates a user; timing is equalized so
  existence cannot be inferred from latency. Only redemption of a valid hashed,
  expiring, one-time token creates the user + session.
- **Session transport = `__Host-`-prefixed httpOnly/Secure/SameSite=Lax cookie**
  holding the raw bearer, never localStorage; CSRF is a separate derived token
  presented via `x-csrf-token` on mutating routes. Idle + 90-day absolute
  expiry, rotation at 24h that preserves the original absolute deadline, replay
  rejected.
- **Rate limits key on hashed email + hashed `request.ip`.** `trustProxy` stays
  off so a spoofed `X-Forwarded-For` cannot bypass the IP limit — the safe
  default until a real proxy hop count is configured (see gotchas).
- **Provider-neutral email via `EMAIL_DELIVERY_PORT` DI** (default
  `NullEmailDeliveryAdapter`); no vendor SDK. Composed test swaps a capture
  adapter, proving replaceability.
- **Fixed public error vocabulary.** `422 VALIDATION_ERROR` (zod) vs the closed
  set `MAGIC_LINK_INVALID_OR_EXPIRED` (401), `SESSION_UNAUTHENTICATED` (401),
  `CSRF_INVALID` (403) — no internal detail or token material leaks.
- **`@fastify/cookie` registration was missing in `main.ts`** and added this
  layer; without it cookie-based session auth would have failed at runtime even
  though unit tests (which register cookie themselves) passed.

## API contracts (signatures only)

`packages/shared` — catalogue (`@marketplace/shared/catalogue`):

```
categoryCollectionQuerySchema        { locale }
categoryCollectionResponseSchema     { data: Category[], meta: CursorPage }
productCollectionQuerySchema         { locale, currency, licence, q?, <facets…>,
                                       compatibility?, updatedWithin?, minPrice?,
                                       maxPrice?, sort?, limit=24, cursor? }
productCollectionResponseSchema      { data: ProductCard[], meta: CursorPage }
productDetailResponseSchema          ProductDetail
```

`packages/shared` — auth (`@marketplace/shared/auth`):

```
magicLinkInitiationRequestSchema     { email, locale, returnTo? }
magicLinkInitiationResponseSchema    { status: "accepted" }                     // 202
magicLinkRedemptionRequestSchema     { token: base64url-256bit }
magicLinkRedemptionResponseSchema    { user, session, csrfToken, returnTo }     // 201 + Set-Cookie
currentSessionResponseSchema         { user, session, csrfToken }               // 200
// DELETE /v1/sessions/current and DELETE /v1/sessions → 204, no body
```

## Known issues & gotchas

- **Integration tests need one dedicated PostgreSQL database per test file.**
  Sharing a DB across files collides: the catalogue seed leaves products that
  block the sessions test's `sellerProfile` cleanup (FK
  `products_seller_id_fkey`). Each suite gates on its own env var
  (`CATALOGUE_INTEGRATION_DATABASE_URL`, `MAGIC_LINK_INTEGRATION_DATABASE_URL`,
  `SESSIONS_INTEGRATION_DATABASE_URL`, `PUBLIC_RESOURCES_INTEGRATION_DATABASE_URL`)
  and `describe.skip`s when unset.
- **CI does not run the integration tests.** `ci.yml` sets none of those env
  vars, so only unit/controller tests gate merges. Wiring a Postgres service +
  the four URLs into `ci.yml` is required to make CI actually exercise the DB
  seams (candidate follow-up).
- **The 10 root categories + bilingual translations are seeded by the
  `catalogue_read_model` migration**, not by tests. Tests seed only child
  categories and products under an existing root — don't re-seed roots.
- **`trustProxy` is off by design.** Behind a real proxy/load balancer,
  `request.ip` becomes the proxy address and IP rate-limiting degrades; set an
  explicit, safe trust configuration (fixed hop count / known proxy IPs) before
  deploying behind one — never blanket `trustProxy: true`.
