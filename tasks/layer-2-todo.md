# Layer 2 — Catalogue Persistence and Public Contract Decisions

Status: **in progress**

This is the smallest layer that can safely follow the proven Layer 1
foundations. It persists the complete public catalogue read model against the
seller ownership and response contracts that already shipped, while resolving
the two specification gaps that currently prevent exact public catalogue and
authentication request contracts from being sized.

The tasks are parallel-safe and have no same-layer dependency: the persistence
task owns only Prisma files, while the human decision task owns only the
approved design document. This layer intentionally does not add NestJS
controllers/services, shared search or auth schemas, magic-link delivery,
storefront pages, catalogue manifests/inventory, release/build administration,
or any cart, checkout, payment, order, entitlement, or download behavior.

---

### T-6ed6da — Persist the public catalogue read model
- **Status:** in-progress
- **Assignee:** ai
- **Files:** apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260722010000_catalogue_read_model/migration.sql
- **Acceptance:**
  - Prisma models the relational data needed to produce the existing shared category, product-card, and product-detail responses: hierarchical categories and bilingual category translations; seller-owned products and bilingual product translations; tags; compatibility; localized specifications; ordered localized media and demos; semantic product versions with bilingual changelog notes; Regular/Extended licence options; and explicit VND/USD integer-minor-unit prices.
  - `Product.sellerId` is a required server-controlled relation to the shipped `SellerProfile`; public slugs, locale/currency/licence/publication/media vocabularies align with `@marketplace/shared`, and relational/localized data is not collapsed into opaque JSON blobs.
  - Database uniqueness, check constraints, referential actions, and indexes prevent duplicate translations, tags, versions, licence/currency prices, and ordered child positions; reject invalid negative prices/positions and self-parented categories; preserve seller and published-product history; and support published category/product lookup plus the approved initial PostgreSQL full-text/trigram search strategy.
  - The migration upgrades a database containing the Layer 1 identity migration, seeds exactly the ten approved top-level category slugs with complete `vi`/`en` names and summaries, and introduces no sample products, fabricated sales/reviews, release artifacts/build runs, commerce records, provider choices, or future seller workflows.
  - The migration applies cleanly to a disposable PostgreSQL database with `prisma migrate deploy`; representative database checks prove the seeded taxonomy, seller ownership relation, bilingual uniqueness, ordered-child uniqueness, price constraints, and search indexes; `prisma validate`, Prisma client generation, and `pnpm --filter @marketplace/api typecheck` pass.
- **Skills:** database-orm, backend-testing, backend-auth-security, shared-contracts, typescript-strict

### T-0c25e6 — Resolve catalogue query and magic-link semantics
- **Status:** todo
- **Assignee:** human
- **Files:** docs/specs/2026-07-22-template-marketplace-design.md
- **Acceptance:**
  - The approved design specifies the exact `GET /v1/products` request grammar: search term, supported filter facets and value formats, allowed sort keys and defaults, page-size default/maximum, locale/currency handling, and a deterministic opaque-cursor ordering that can restore URL-backed collection state.
  - The approved design specifies the complete magic-link lifecycle beyond the currently named initiation endpoint: generic anti-enumeration response behavior, browser link target, one-time token redemption endpoint and HTTP shape, session transport, cookie attributes, expiry/rotation/revocation rules, current-session lookup/logout needs, and rate-limit expectations.
  - Decisions preserve independent locale/currency choice, provider-neutral email delivery, hashed one-time tokens, replay prevention, server-side authorization, and the explicit deferral of payment/checkout implementation; no unresolved placeholder remains that would force shared-contract or endpoint implementers to invent wire behavior.
  - The amended design remains marked approved with the decision date recorded, so the next scope pass can create separate shared-contract, NestJS catalogue, and NestJS auth tasks without cross-worktree file overlap.
- **Skills:** brainstorming, api-design, backend-auth-security, web-auth-state, shared-contracts

---

## Layer completion gate

Do not create or start Layer 3 until both tasks are `done`, the catalogue
migration has been exercised against disposable PostgreSQL, and root
lint/typecheck/test remain green. The next planning pass can then derive exact
shared query/auth contracts and public catalogue/auth API behavior from the
persisted model and newly approved semantics; public web screens and commerce
remain downstream.
