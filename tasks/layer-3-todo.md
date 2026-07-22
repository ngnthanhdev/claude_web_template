# Layer 3 — Public Request and Passwordless Auth Prerequisites

Status: **todo**

This is the smallest dependency-safe layer after the proven Layer 2 catalogue
persistence and approved query/auth amendment. It fixes the persistence seam
needed to initiate a magic link before a user exists and defines the shared
wire contracts that later NestJS catalogue and authentication resources must
consume.

The two tasks are parallel-safe and have no same-layer dependency: one owns
only `packages/shared`, while the other owns only Prisma schema/migration
files. This layer intentionally does not add NestJS controllers/services,
email delivery, cookie or CSRF middleware, public web screens, catalogue
inventory, cart/checkout/payment, orders, entitlements, or downloads. In
particular, catalogue API integration tests that prove database-derived
responses satisfy the shared schemas belong with the dependent API resource
implementation in the next layer, not with these prerequisites.

---

### T-9a705b — Define catalogue query and passwordless auth contracts
- **Status:** todo
- **Assignee:** ai
- **Files:** packages/shared/package.json, packages/shared/src/index.ts, packages/shared/src/catalogue.ts, packages/shared/src/catalogue.test.ts, packages/shared/src/auth.ts, packages/shared/src/auth.test.ts
- **Acceptance:**
  - `@marketplace/shared` exports strict Zod request schemas and inferred types for `GET /v1/categories` and `GET /v1/products`, plus the category collection response composed from the shipped localized summary and cursor primitives; locale, currency, money, slug, licence, and existing product response contracts are reused rather than redefined, and package subpath exports expose the catalogue and auth contracts to both apps.
  - The product query contract implements the approved grammar exactly: required `locale`, `currency`, and `licence`; normalized optional `q`; repeatable controlled facets with a maximum of 20 values each and OR-within/AND-across semantics; controlled compatibility/version-band syntax and `updatedWithin`; integer `minPrice`/`maxPrice` with cross-field ordering; conditional sort defaults; limit default/bounds; opaque cursor input; and rejection of unknown parameters, comma-packed facets, malformed ranges, and malformed controlled-value shapes. Membership of dynamic controlled vocabularies is explicitly left for the later database-backed API validation rather than hard-coded into shared schemas.
  - Catalogue query tests exercise raw URL-query boundary shapes, including one versus repeated entries, empty-search handling, the `q`-dependent sort default, the 24/48 limit behavior, locale/currency independence, price/licence context, and representative HTTP-422 validation failures. Cursor signature/fingerprint verification remains a server-only concern for the later API task and no signing secret enters the shared package.
  - The auth contracts cover magic-link initiation `{email, locale, returnTo?}` and generic HTTP-202 `{status:"accepted"}` output, token redemption and its HTTP-201 safe response, current-session output, and the two HTTP-204 session-revocation operations. Email is trimmed/normalized, `returnTo` accepts only approved locale-prefixed relative KITVERA routes, response schemas are explicit allowlists, and no raw session token, token hash, CSRF hash, rotation link, or other persistence-only field can parse as public output.
  - Auth contract tests distinguish malformed redemption input from a well-formed-but-invalid token (the later API maps these to HTTP 422 versus `MAGIC_LINK_INVALID_OR_EXPIRED` HTTP 401), cover unsafe return targets and unsupported locales, and prove the redemption/current-session responses contain only the safe user/session data, CSRF value, and redemption return target called for by the approved amendment.
  - The amendment requires at least 256 bits of raw-token entropy and a “safe user/session” response but does not name the token's transport encoding or enumerate every public user/session property. Treat those as narrow contract-design details: lock a URL-fragment-safe token representation and the minimum useful allowlisted response fields in tests, document them through exported schemas/types, and do not expand into profile or admin-authoring fields.
  - `pnpm --filter @marketplace/shared typecheck` and `pnpm --filter @marketplace/shared test` pass.
- **Skills:** api-design, shared-contracts, backend-auth-security, web-auth-state, typescript-strict

### T-77259c — Persist pending magic-link redemption context
- **Status:** todo
- **Assignee:** ai
- **Files:** apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260722020000_passwordless_auth_pending_state/migration.sql
- **Acceptance:**
  - `MagicLinkToken` stores the normalized target email independently of `User`, permits a null `userId` before redemption, and persists the requested locale plus validated relative `returnTo` needed to produce the approved email link and successful redemption response. Existing token hashes, expiry, consumption, revocation, timestamps, and optional user relation remain intact.
  - The migration upgrades the completed Layer 2 schema without discarding existing identity or catalogue data; any pre-existing token row is safely backfilled from its related user's normalized email before the new invariant is enforced, while future pending tokens can exist without creating a user.
  - Constraints and indexes support revoking older unconsumed tokens and enforcing rate windows by normalized email, looking up a token by its unique hash, and converging concurrent redemption on the existing unique `User.normalizedEmail`; the schema does not store raw bearer tokens or assign seller/admin roles through the public flow.
  - Representative database checks prove a pending token can be created with no user, cannot omit its normalized email/locale/return target, can later attach to exactly one user, and retains one-time consume/revoke state under concurrent updates. The migration does not implement email providers, IP-rate-limit infrastructure, sessions, auth controllers, or security-event transport.
  - The migration replays cleanly after both existing migrations on a disposable PostgreSQL database; `prisma validate`, Prisma client generation, `pnpm --filter @marketplace/api typecheck`, and the root test gate pass.
- **Skills:** database-orm, backend-auth-security, backend-testing, typescript-strict

---

## Layer completion gate

Do not create or start Layer 4 until both tasks are `done`, the auth migration
has replayed after Layers 1 and 2 on disposable PostgreSQL, and root
lint/typecheck/test remain green. The next planning pass can then scope
separate NestJS catalogue and passwordless-auth resources against these
proven contracts and persistence boundaries; its catalogue integration tests
must validate actual database-derived category/product responses with the
shared schemas. Public web screens and commerce remain downstream.
