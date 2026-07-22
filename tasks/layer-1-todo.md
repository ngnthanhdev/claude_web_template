# Layer 1 — Core Domain and Locale Foundations

Status: **todo**

This is the smallest product layer that unlocks later catalogue work without
coupling independent implementers. It establishes the public catalogue's wire
language, the identity/ownership records required by `Product.sellerId`, and
the locale-prefixed web boundary required by every screen. Each task depends
only on the proven Layer 0 foundation, owns a separate package, and can run in
parallel; no same-layer `Depends` edges are needed.

This layer intentionally does not add API resource controllers, catalogue
database models or seed inventory, search/filter query contracts, auth
endpoints, customer/admin screens, or commerce. The approved spec names
`POST /v1/auth/magic-links` but does not define the token-redemption endpoint,
and it does not define the exact search/filter grammar; those ambiguities stay
deferred instead of being guessed into a foundational contract.

---

### T-d17cbd — Define catalogue read contracts
- **Status:** todo
- **Assignee:** ai
- **Files:** packages/shared/src/catalogue.ts, packages/shared/src/catalogue.test.ts, packages/shared/src/index.ts
- **Acceptance:**
  - `@marketplace/shared` exports strict Zod schemas and inferred types for the ten approved category slugs, publication state, Regular/Extended licence identifiers, localized category summaries, product cards, and product detail responses.
  - Product detail covers the approved evaluation facts: localized title/summary/description, category and tags, current version/changelog, compatibility/specifications, ordered media and demo pages, documentation and isolated-preview URLs, and explicit VND/USD minor-unit prices per licence option by composing the existing locale, money, and cursor primitives rather than redefining them.
  - The product collection contract uses the approved `{data, meta}` cursor envelope; request/search/filter schemas are explicitly excluded until their under-specified grammar is resolved in a later layer.
  - Contract tests accept representative bilingual catalogue payloads and reject unknown groups, unsupported locale/currency values, fractional prices, unsafe/non-HTTP(S) public URLs, malformed slugs/versions, duplicate ordered item positions, and incomplete Regular/Extended price coverage.
  - `pnpm --filter @marketplace/shared typecheck` and `pnpm --filter @marketplace/shared test` pass.
- **Skills:** shared-contracts, typescript-strict

### T-9a89df — Add identity and seller ownership persistence
- **Status:** todo
- **Assignee:** ai
- **Files:** apps/api/prisma/schema.prisma, apps/api/prisma/migrations/migration_lock.toml, apps/api/prisma/migrations/20260722000000_identity_ownership/migration.sql
- **Acceptance:**
  - Prisma defines the approved identity/ownership foundation: `User`, `Session`, `MagicLinkToken`, `Role`, the explicit user-role relation, and `SellerProfile`, with stable IDs and timestamps suitable for later auth, admin RBAC, audit, and `Product.sellerId` relations.
  - Email uniqueness uses a normalized stored value; sessions and one-time magic links persist hashes rather than raw bearer tokens and include expiry plus revocation/consumption state needed to prevent replay and support session rotation.
  - Seller ownership is server-controlled: a seller profile has a required owner relation and unique public slug, supports the single platform seller in v1, and does not expose seller onboarding, KYC, commissions, payouts, or seller-facing authorization.
  - Referential actions and indexes preserve security-relevant history, support lookups by user/hash/expiry/role/seller slug, and do not introduce catalogue, commerce, provider, or seed-data assumptions.
  - The initial migration applies cleanly to an empty disposable PostgreSQL database with `prisma migrate deploy`; `prisma validate`, Prisma client generation, and `pnpm --filter @marketplace/api typecheck` pass.
- **Skills:** database-orm, backend-auth-security, backend-testing, typescript-strict

### T-4a2249 — Establish locale-prefixed web routing
- **Status:** todo
- **Assignee:** ai
- **Files:** apps/web/package.json, pnpm-lock.yaml, apps/web/next.config.ts, apps/web/src/middleware.ts, apps/web/src/i18n/routing.ts, apps/web/src/i18n/request.ts, apps/web/messages/vi.json, apps/web/messages/en.json, apps/web/src/app/layout.tsx, apps/web/src/app/page.tsx, apps/web/src/app/[locale]/layout.tsx, apps/web/src/app/[locale]/page.tsx, apps/web/src/components/app-shell.tsx, apps/web/src/app/page.test.tsx
- **Acceptance:**
  - `next-intl` provides locale-prefixed `vi` and `en` routes, request configuration, and message catalogues with identical keys; shared shell/home placeholder copy and accessibility labels come from messages rather than hard-coded bilingual text.
  - `/` negotiates a stored locale first and then `Accept-Language`, redirects to the matching locale prefix, and rejects unsupported locale segments. The approved spec does not name the final fallback, so this task explicitly uses Vietnamese (`vi`) as the Vietnamese-first marketplace fallback unless the user changes that decision before implementation.
  - Locale-aware links preserve the active locale, while locale state remains independent from the future VND/USD currency choice; no currency conversion, catalogue page, or product content is introduced.
  - The existing keyboard focus, Escape-to-close navigation, reduced-motion behavior, 44px targets, zoom, and 320px no-overflow guarantees remain covered after routing moves under `[locale]`.
  - Tests verify root negotiation precedence/fallback, both localized routes, unsupported-locale handling, equal catalogue keys, locale-preserving shell links, and accessible rendering; `pnpm --filter @marketplace/web typecheck` and `pnpm --filter @marketplace/web test` pass.
- **Skills:** web-i18n-theme, web-app-foundation, web-responsive, web-security, web-testing-release, typescript-strict

---

## Layer completion gate

Do not create or start Layer 2 until all three tasks are `done`, their package
checks pass, the identity migration has been exercised against disposable
PostgreSQL, and root lint/typecheck/test remain green. The next planning pass
can then derive catalogue persistence plus API resources and auth behavior
from the contracts and locale boundary that actually shipped.
