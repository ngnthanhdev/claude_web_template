# Layer 4 — Public Catalogue and Passwordless Authentication API

Status: **in progress**

This layer implements the first database-backed public NestJS resources against
the contracts and persistence proven in Layers 1–3. It is deliberately split
into dependency rounds so `/run-layer` never asks separate worktrees to edit
the same composition, configuration, or Prisma files:

1. the public catalogue resource and auth-persistence extension are independent;
2. auth runtime primitives start after the persistence extension;
3. magic-link and session resources then run in parallel over those primitives;
4. one final composition task alone owns the application bootstrap files.

The layer does not add storefront screens, account screens, catalogue inventory,
seller/admin authoring, carts, checkout, payment, orders, entitlements, or
downloads. Email delivery remains provider-neutral: this layer defines and
tests the port but does not select a vendor.

---

### T-b4e1a7 — Implement the database-backed public catalogue resource
- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/catalogue/catalogue.module.ts, apps/api/src/catalogue/catalogue.controller.ts, apps/api/src/catalogue/catalogue.service.ts, apps/api/src/catalogue/catalogue-cursor.ts, apps/api/src/catalogue/catalogue.controller.test.ts, apps/api/src/catalogue/catalogue.integration.test.ts
- **Acceptance:**
  - `CatalogueModule` implements `GET /v1/categories`, `GET /v1/products`, and `GET /v1/products/:slug` using the shipped `@marketplace/shared/catalogue` request and response schemas; malformed input, unknown query keys or dynamic controlled values, invalid/replayed-under-different-filters cursors, and invalid ranges return the shared HTTP-422 envelope.
  - Category reads return the seeded public roots in deterministic order with their complete `vi`/`en` translations. Product collection and detail reads expose only `published` products whose required localized/current-version/licence data exists; unknown, draft, or delisted slugs return HTTP 404 and no seller-private or persistence-only fields are serialized.
  - Collection filters implement the approved OR-within/AND-across behavior for category/subcategory, controlled tag facets, compatibility bands, update windows, selected licence/currency price ranges, and normalized search. Search uses parameterized PostgreSQL full-text/trigram operations and the Layer 2 indexes; limits are bounded before database execution and no untrusted query fragment is interpolated as SQL.
  - All approved sorts are deterministic. Continuation cursors are versioned, opaque, HMAC-authenticated with a server-only secret, contain only the ordering tuple and normalized-query fingerprint required to resume, reject modification or reuse under another query with HTTP 422, and never expose the signing secret to shared contracts or responses.
  - Unit/controller tests cover validation, publication boundaries, dynamic-vocabulary rejection, filter semantics, every sort/cursor family, cursor tampering/fingerprint mismatch, missing products, and representative output-mapping failures.
  - With `DATABASE_URL` pointed at a disposable PostgreSQL database containing the shipped migrations and a minimal bilingual published-product fixture, integration tests issue real HTTP requests, exercise actual Prisma/database queries for categories plus product collection/detail, and parse every successful database-derived response with the corresponding shared Zod response schema. The tests also prove draft/delisted rows and nonmatching locale/licence/currency/filter data do not leak.
  - `pnpm --filter @marketplace/api lint`, `pnpm --filter @marketplace/api typecheck`, `pnpm --filter @marketplace/api test`, and the explicit disposable-PostgreSQL integration run pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-testing, shared-contracts, backend-auth-security, typescript-strict

### T-c8d2f4 — Extend persistence for secure sessions and auth rate events
- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260722030000_auth_session_security/migration.sql
- **Acceptance:**
  - The session model can enforce the approved 30-day idle and 90-day absolute expiry independently across token rotation, bind an unpredictable CSRF value by hash, record activity, and preserve the existing replacement/revocation chain without storing raw session or CSRF bearer values.
  - Provider-neutral auth security/rate-event persistence supports the exact initiation windows (3/email/15 minutes, 10/email/24 hours, 20/source-IP/15 minutes) and redemption window (10/source-IP/15 minutes), plus success/failure/revocation security events, using normalized email only where email counting requires it and a keyed source-IP digest rather than raw IP text. No raw magic-link, session, CSRF, or signing secret is persisted.
  - Constraints and indexes support active-session lookup, user-wide revocation, expiry/rotation decisions, bounded rate-window counts, and audit ordering. Expiry ordering and terminal-state invariants are database-enforced where practical, and public input cannot assign roles or seller ownership through these models.
  - The migration upgrades the completed Layer 3 database without deleting identity/catalogue data and gives any legacy session a conservative finite idle/absolute lifetime. Representative database checks prove lifecycle constraints, rate-window lookup paths, and concurrent terminal updates.
  - The migration replays cleanly after all three shipped migrations on disposable PostgreSQL; `prisma validate`, Prisma client generation, `pnpm --filter @marketplace/api typecheck`, and the root test gate pass.
- **Skills:** database-orm, backend-auth-security, backend-testing, typescript-strict

### T-e6a93c — Build the passwordless auth security core
- **Status:** review
- **Assignee:** ai
- **Files:** apps/api/package.json, pnpm-lock.yaml, apps/api/.env.example, apps/api/src/config/env.ts, apps/api/src/config/env.test.ts, apps/api/src/common/errors/api-http.exception.ts, apps/api/src/common/filters/api-exception.filter.ts, apps/api/src/common/filters/api-exception.filter.test.ts, apps/api/src/auth/core/auth-core.module.ts, apps/api/src/auth/core/auth-crypto.service.ts, apps/api/src/auth/core/auth-rate-limit.service.ts, apps/api/src/auth/core/auth-session.service.ts, apps/api/src/auth/core/auth-cookie.ts, apps/api/src/auth/core/auth-core.test.ts
- **Acceptance:**
  - Environment validation requires independent, deployment-supplied secrets for catalogue cursor signing, auth token/session/CSRF hashing, and keyed source-IP digests, plus the public web origin needed to construct magic-link destinations. Test fixtures use explicit test values; no secret or production credential is committed or exposed to the browser.
  - The runtime uses cryptographically secure 256-bit opaque values, domain-separated hashes/HMACs, constant-time verification where secrets are compared, and injectable clock/random seams for deterministic tests. Only hashes reach Prisma or logs; raw magic-link, session, and CSRF values are never logged.
  - The database-backed limiter enforces all approved email/IP windows under concurrent requests rather than relying on process memory, prunes or bounds obsolete rate data, and returns decisions that let initiation preserve its generic HTTP-202 response. Source addresses are keyed before persistence and untrusted forwarding headers are not accepted implicitly.
  - The shared session service creates hashed opaque sessions, derives or stores only a hashed session-bound CSRF verifier, enforces idle and absolute expiry, rotates at most once per 24 hours while preserving the original absolute deadline, creates the replacement before revoking the old session, and provides atomic current-only and user-wide revocation operations.
  - Cookie helpers emit `__Host-kitvera_session` with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and no `Domain`, and clear it with the same host/path scope. Application exceptions can carry allowlisted public error codes such as `MAGIC_LINK_INVALID_OR_EXPIRED` without leaking internal messages or stack traces through the standard shared envelope.
  - Tests cover entropy/encoding, hash separation, no-raw-token persistence/logging, rate-window edges and concurrency, expiry/rotation/replay behavior, CSRF verification, exact cookie attributes, safe exception serialization, and invalid/missing environment secrets; package lint/typecheck/tests pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-c8d2f4

### T-71f0bd — Implement magic-link initiation and redemption
- **Status:** review
- **Assignee:** ai
- **Files:** apps/api/src/auth/magic-links/email-delivery.port.ts, apps/api/src/auth/magic-links/null-email-delivery.adapter.ts, apps/api/src/auth/magic-links/magic-links.module.ts, apps/api/src/auth/magic-links/magic-links.controller.ts, apps/api/src/auth/magic-links/magic-links.service.ts, apps/api/src/auth/magic-links/magic-links.controller.test.ts, apps/api/src/auth/magic-links/magic-links.integration.test.ts
- **Acceptance:**
  - `POST /v1/auth/magic-links` validates the shared initiation schema, normalizes email/locale/return target, applies every approved database-backed email and source-IP limit, and always returns the same generic HTTP 202 `{status:"accepted"}` for new/existing addresses, limited requests, suppressed delivery, and provider failure without creating a user or revealing account state.
  - A successful issue uses at least 256 bits of secure entropy, stores only the token hash with a 15-minute expiry and pending email/locale/return target, atomically revokes every older unconsumed token for that normalized email, and passes a link shaped as `/[locale]/auth/magic-link#token=<raw-token>` to an injected provider-neutral email port. The default adapter fails closed/suppresses delivery without logging the raw link; vendor selection remains deferred.
  - `POST /v1/auth/magic-link-redemptions` validates the shared token contract. A well-formed unknown, expired, consumed, or revoked token produces the same HTTP 401 `MAGIC_LINK_INVALID_OR_EXPIRED`; malformed input produces HTTP 422; raw token material never reaches request/application logs.
  - Successful redemption atomically consumes exactly one token, converges concurrent first-time redemptions on unique normalized email, creates no seller/admin roles, creates the secure session through the auth core, attaches the token to that user, sets the approved cookie, and returns HTTP 201 whose allowlisted user/session/CSRF/return target parses with the shared redemption response schema.
  - Security events contain no bearer material. Real-PostgreSQL integration tests prove generic initiation outcomes, exact email/IP windows including concurrent attempts, older-token revocation, provider suppression/failure, first-time user creation only after redemption, cookie flags, expired/revoked/consumed rejection, and a concurrent double-redemption yielding exactly one session/success. Unit, lint, typecheck, and integration tests pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-e6a93c

### T-a2c5e8 — Implement current-session and revocation resources
- **Status:** in-progress
- **Assignee:** ai
- **Files:** apps/api/src/auth/sessions/sessions.module.ts, apps/api/src/auth/sessions/session-auth.guard.ts, apps/api/src/auth/sessions/session-csrf.guard.ts, apps/api/src/auth/sessions/session-context.ts, apps/api/src/auth/sessions/sessions.controller.ts, apps/api/src/auth/sessions/sessions.controller.test.ts, apps/api/src/auth/sessions/sessions.integration.test.ts
- **Acceptance:**
  - Cookie authentication hashes the opaque cookie before lookup, rejects absent, unknown, revoked, idle-expired, or absolute-expired sessions with HTTP 401, never accepts a client-supplied user ID/role as authority, and exposes only the server-resolved session/user context to handlers.
  - `GET /v1/sessions/current` returns the allowlisted current user/session and unpredictable session-bound CSRF value accepted by the shared schema, updates activity within the absolute lifetime, and performs the approved at-most-once-per-24-hours rotation by setting the replacement cookie only after the replacement exists.
  - `DELETE /v1/sessions/current` and `DELETE /v1/sessions` require both authenticated cookie state and a valid `X-CSRF-Token`, scope revocation to the server-resolved current session/user, clear the host cookie, and return HTTP 204 with no body. Missing/mismatched CSRF fails even for `SameSite` requests and user-wide revocation cannot target another user's sessions.
  - Revoked or rotated bearer values cannot replay, concurrent activity/logout/revoke-all operations converge safely, rotation keeps the original 90-day absolute deadline, and security events contain no raw cookie or CSRF values.
  - Controller/unit and real-PostgreSQL integration tests cover unauthenticated access, safe response parsing, idle/absolute expiry, rotation timing, CSRF failures, exact cookie clearing, current-only versus user-wide revocation, cross-user isolation, and concurrent replay/revocation. Lint, typecheck, unit, and integration tests pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-e6a93c

### T-3fa9d0 — Compose and verify the public API resources
- **Status:** todo
- **Assignee:** ai
- **Files:** apps/api/src/auth/auth.module.ts, apps/api/src/app.module.ts, apps/api/src/main.ts, apps/api/test/public-resources.integration.test.ts
- **Acceptance:**
  - `AuthModule` composes the auth core, magic-link, and session modules; `AppModule` registers auth and catalogue beside health/Prisma/config without circular dependencies or duplicate providers. The Fastify bootstrap registers cookie support before requests, retains URI versioning, Zod validation, standard exception filtering, credentialed explicit-origin CORS, Helmet, shutdown hooks, and safe proxy defaults.
  - A disposable-PostgreSQL Fastify integration suite boots the real composed application, injects a capture-only test email adapter, and proves the complete HTTP seams: shared-schema-valid database-derived categories/products/detail; generic magic-link initiation; fragment-token redemption; secure session cookie; current-session/CSRF; current logout; and user-wide revocation. It also asserts malformed catalogue/auth input uses the shared 422 envelope, invalid magic links use the fixed 401 code, and no response/log exposes token hashes or raw bearer material.
  - The composed app starts with valid environment configuration and fails closed when required signing/hashing secrets are missing; provider-neutral email remains replaceable through dependency injection and no vendor SDK, web page, commerce/payment behavior, or sample catalogue inventory is introduced.
  - `pnpm --filter @marketplace/api lint`, `pnpm --filter @marketplace/api typecheck`, `pnpm --filter @marketplace/api test`, the explicit disposable-PostgreSQL integration suite, and root `pnpm lint && pnpm typecheck && pnpm test` pass.
- **Skills:** api-design, nestjs-backend, backend-auth-security, backend-testing, database-orm, shared-contracts, typescript-strict
- **Depends:** T-b4e1a7, T-71f0bd, T-a2c5e8

---

## Layer completion gate

Do not create or start Layer 5 until all six tasks are `done`, the new
migration has replayed after the complete Layer 3 chain, real PostgreSQL
integration tests have validated catalogue and auth/session behavior, both
correctness and security review are clean, and root lint/typecheck/test remain
green. Public Next.js catalogue/auth screens are downstream of this proven API;
commerce and payment remain explicitly deferred.
