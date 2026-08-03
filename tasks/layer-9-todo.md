# Layer 9 — Admin Surface: First Pass

Status: **in-progress** (Round 1)

This is the **first admin scope pass**, derived from the user-approved design
`docs/specs/2026-08-01-admin-surface-design.md` (the `T-4c8a9e` gate, approved
2026-08-01). Layer 6's admin gate is done and Layer 8 shipped the seller half of
the publication state machine, so this pass is legitimate: it turns the approved
design's **§2 v1-ENABLES** surface into an ordered, parallel-safe implementation
layer, following the **§10** dependency spine.

**v1 admin only — the operate/review/publish spine:** an admin `RolesGuard`
(deny-by-default), an admin-role bootstrap + `seller`/`admin` role provisioning,
catalogue review (approve/reject of seller submit-for-review items),
release/publication (guarded publish/delist gated on QA-approved state + a
verified `Artifact`), prod-flag-gated MFA (TOTP), an append-only `AdminAuditLog`,
and the `/[locale]/admin/*` shell. Every design §4/§8 STRIDE mitigation lands as
an explicit Acceptance line so the post-merge `code-reviewer`/`security-reviewer`
can check it.

**Inherited invariants (reused from Layers 0–8, not re-litigated):**
same-origin Next proxy (`app/api/[...proxy]` already forwards every `/v1/*`, so
no proxy change is needed); `__Host-kitvera_session`; session-auth + CSRF guards;
DB-backed rate limiter; the `Role`/`UserRole` RBAC substrate + `PrismaService`;
the Layer-8 `ReviewState`-on-`ProductVersion` (`draft|in_review|approved`),
`PublicationState` (`draft|published|delisted`), and `Artifact`/`BuildRun`
shapes — reused **exactly**, never duplicated; `@marketplace/shared` Zod
contracts on both sides; NestJS/Fastify/Prisma; TypeScript strict, no `any`.

**Admin is the approval half of Layer 8's state machine (§5).** Seller does
`draft→in_review` (`seller-review.service.ts`); admin does `in_review→approved`
then flips `PublicationState draft→published`, and may `delist`. This layer adds
**no** parallel/duplicate state model — it reuses the shipped enums and
`Artifact` record.

**Production admin MFA stays a go-live blocker (§1/§6).** MFA is built now but
**enforced only behind `ADMIN_MFA_ENFORCED`** (default on in production, off in
dev/test — mirroring the sandbox settle `NODE_ENV` gate). This layer does not
lift that blocker.

## Dependency rounds

Ordered by dependency; tasks in the same round touch disjoint files and are safe
to fan out to parallel `task-implementer` worktrees. No resource task touches
`app.module.ts` — a dedicated compose task wires them (mirroring Layer 8's
`T-7e0b52`).

1. **Round 1 — Contracts & persistence (parallel):** `T-e1b7a4` (shared admin
   Zod contracts), `T-7f3c92` (Prisma `AdminAuditLog` + MFA models + admin-role
   seed + migration). Both derive directly from the approved design; neither
   depends on the other.
2. **Round 2 — Admin security core:** `T-c4a8e0` (deny-by-default `AdminRolesGuard`,
   prod-flag MFA enforcement guard, in-transaction audit service, bootstrap-admin
   startup path, `env.ts` flag + MFA encryption key). The spine every admin
   controller imports; depends on Round 1.
3. **Round 3 — MFA endpoints, admin resources & web data layer (parallel):**
   `T-b2d9f6` (MFA enroll/confirm/verify/recovery), `T-38e5c1` (catalogue review
   approve/reject), `T-a6f204` (publish/delist), `T-d9017b` (user-role
   provisioning), `T-4c62ae` (web admin client). Each is its own module/file set
   and depends only on Round 2 (the client on Round 1).
   - **Round-2 constraints every Round-3 API task must honor:** (a) compose
     BOTH `AdminRolesGuard` AND `AdminMfaEnforcementGuard` on every guarded
     admin route (except MFA enroll/confirm, which precede verification); (b)
     `AdminAuditService.record` now projects `before/after` through a
     **fail-closed allowlist** of primitive fields — audit diffs may use ONLY:
     `reviewState`, `publicationState`, `role`, `roleKey`, `reason`, `checksum`,
     `confirmedAt`, `type`, `version`, `productId`, `userId`, `factorId` (any
     other key is silently dropped — add to `admin-audit.service.ts`'s allowlist
     consciously if a new non-sensitive field must be recorded); (c) the
     per-session step-up marker window is `ADMIN_MFA_SESSION_RECENCY_MS` (15m).
4. **Round 4 — Composition & web shell (parallel):** `T-83bd5f` (wire the admin
   modules into `app.module.ts` + composed disposable-Postgres integration
   suite), `T-2e7a9c` (the `/[locale]/admin/*` shell).
5. **Round 5 — CI gate & e2e (parallel):** `T-f14b83` (gate the new admin
   integration suites in `ci.yml`), `T-5d0e6a` (Playwright
   grant-seller → review → approve → publish admin happy path).

## Deferred from Round-3 review (backlog, not blocking)

Both LOW and rated low-likelihood by code + security review; recorded so they
aren't lost:

- **Last-admin concurrent mutual-revoke** (`admin-users.service.ts`): the
  self-last-admin-revoke lockout holds for a single actor, but two admins
  revoking each other in the same instant can reach zero admins. A truly
  race-free fix needs SERIALIZABLE isolation or a single guarded SQL delete;
  the state is recoverable via `ADMIN_BOOTSTRAP_EMAILS`. Left as a hardening
  follow-up.
- **Cursor codec duplication** (`admin-review.service.ts`,
  `admin-users.service.ts` — and pre-existing in `commerce`/`seller`): the
  base64url tuple cursor encode/decode is copied per resource. Candidate for a
  single generic `makeCursorCodec(schema)` helper; folds into the existing DRY
  backlog `T-1f7c2a`.
- **Review-queue `review_state`-leading index** (deferred in `T-38e5c1`): a
  perf index for the admin queue on a growing `product_versions` table.

## Excluded from this pass (design §2 SEQUENCES / DEFERS — do NOT scope here)

Per design §2/§10, these are sequenced to **later** passes and are out of scope
for this layer even though some backing data now exists:

- **Order administration / lookup** and **entitlement grant/revoke/audit** — a
  follow-on pass **after** commerce Wave 1 (the data exists, the admin surface
  does not ship here). No admin endpoint in this layer reads/writes `Order`,
  `OrderItemSnapshot`, `PaymentAttempt`, `Entitlement`, or `DownloadEvent`.
- **Discount (coupon/referral) management** and **review moderation** — wait for
  commerce Wave 2.
- **Finer editor/publisher/support role split** and **refund/chargeback
  automation** — deferred (§2 DEFERS). The `admin` guard is written so a finer
  split is an **additive** allowlist change, but the split itself is not built.

---

### T-e1b7a4 — Shared admin Zod contracts

- **Status:** done
- **Assignee:** ai
- **Files:** packages/shared/src/admin.ts, packages/shared/src/admin.test.ts, packages/shared/src/index.ts, packages/shared/package.json
- **Acceptance:**
  - `@marketplace/shared` gains a new `./admin` subpath (mirroring the existing `./seller`/`./commerce` entries in `package.json` `exports`, re-exported from `src/index.ts`) exporting strict Zod request/response schemas and inferred types for the v1 admin surface, **reusing** the existing catalogue/seller primitives (`slugSchema`, `semanticVersionSchema`, `reviewStateSchema` = `draft|in_review|approved`, `publicationStateSchema`, `localeSchema`, the cursor/envelope primitives) rather than redefining them.
  - Covers the browser-facing admin contracts: the admin **review-queue** list response (versions in `in_review` + product + linked `Artifact`/`BuildRun` QA/scan verdict metadata — no buyer/order/revenue fields) and item detail; the **approve** and **reject** transition requests (reject requires a `reason`); the **publish** and **delist** transition requests (each names the target product + version); the admin **user** list response (PII-minimized: normalized email + assigned role keys only) and the **grant-role** / **revoke-role** requests (role key allowlisted to `seller|admin`) + responses; the **MFA** enroll-start/confirm requests+responses (the one-time provisioning payload is a response-only field, never a request field), MFA verify request, and recovery-code-regeneration response (codes shown once).
  - Request schemas are **allowlists** (`.strict()`) that make the design §4/§8 no-client-authority defense representable in the type system: **no** acting-admin id, audit field, `publicationState`/`reviewState` free-set (only the dedicated transition endpoints move state), MFA secret, or role key outside `seller|admin` can parse from any admin request body. State transitions are their own dedicated request shapes, not fields on a generic edit.
  - Contract tests (`admin.test.ts`) accept representative valid payloads and reject: an acting-admin id or audit field smuggled into any request, a role key outside `seller|admin`, a publish request missing its target version, a reject missing its `reason`, and any secret/PII field appearing in a response DTO. `pnpm --filter @marketplace/shared typecheck` and `pnpm --filter @marketplace/shared test` pass.
- **Skills:** shared-contracts, api-design, typescript-strict

### T-7f3c92 — Prisma AdminAuditLog, admin MFA models, admin-role seed, and migration

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260803000000_admin_surface/migration.sql
- **Acceptance:**
  - Adds an append-only **`AdminAuditLog`** model: acting-admin id (`User` relation), `action` (enum — e.g. `reviewApproved|reviewRejected|productPublished|productDelisted|roleGranted|roleRevoked|mfaEnrolled|mfaRecoveryRegenerated`), `targetType` (enum — e.g. `productVersion|product|userRole|adminMfaFactor`), `targetId`, `beforeState`/`afterState` as `Json?` (a redacted diff — **no** secrets/PII), `requestId`, `createdAt`. It has **no** `updatedAt` and the schema implies **no** update/delete path (append-only, §7). Indexes: `(actingAdminId, createdAt, id)` and `(targetType, targetId, createdAt)`.
  - Adds MFA models: **`AdminMfaFactor`** (`userId`, `type` enum `totp` — schema left open to WebAuthn, `encryptedSecret` — the TOTP shared secret stored **encrypted** at rest, _not_ hashed, since verification needs the shared secret, `confirmedAt?`, `createdAt`) and **`AdminMfaRecoveryCode`** (factor relation, `codeHash` — recovery codes **hashed** at rest, `usedAt?`). Adds a per-session admin-MFA-verified marker (`AdminMfaSession` linking `sessionId` + `verifiedAt`, or an equivalent nullable column) so the enforcement guard can require a recent challenge. A schema comment states secrets are encrypted / codes hashed and never logged.
  - Seeds the `admin` (and ensures the `seller`) `Role` key idempotently **in the migration** (`INSERT ... ON CONFLICT DO NOTHING`); introduces **no** admin _user_ grant (bootstrapping the first admin is the documented startup path in `T-c4a8e0`), no sample audit rows, and no MFA factors.
  - The change is **additive**: no existing column is renamed or dropped, and `ReviewState`/`PublicationState`/`Artifact`/`BuildRun`/`Order`/`Entitlement` are untouched. The migration replays cleanly with `prisma migrate deploy` after all existing migrations on a disposable PostgreSQL database. `prisma validate`, Prisma client generation, and `pnpm --filter @marketplace/api typecheck` pass.
- **Skills:** database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict

### T-c4a8e0 — Admin security core: RolesGuard, MFA enforcement, audit service, bootstrap, prod flag

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/admin/admin.module.ts, apps/api/src/admin/admin-roles.guard.ts, apps/api/src/admin/admin-mfa-enforcement.guard.ts, apps/api/src/admin/admin-principal.ts, apps/api/src/admin/admin-audit.service.ts, apps/api/src/admin/admin-bootstrap.service.ts, apps/api/src/admin/admin-core.test.ts, apps/api/src/admin/admin-core.integration.test.ts, apps/api/src/config/env.ts, apps/api/.env.example
- **Acceptance:**
  - `AdminRolesGuard` runs **after** the existing `SessionAuthGuard`: it reads the principal's `Role`/`UserRole` assignments, requires the single `admin` role, and resolves an admin principal via `admin-principal` (mirroring `session-context.ts`/`seller-principal.ts`). It is **deny-by-default** — a controller without the guard, or a non-admin session, gets `403`; the acting admin identity comes **only** from the session, never a body/query (design §4/§8, no client-supplied role/owner). It is written so a later finer role split is an additive required-role allowlist, not a rewrite, but only `admin` is enabled now.
  - `AdminMfaEnforcementGuard` reads a new **`ADMIN_MFA_ENFORCED`** flag (added to `env.ts`; default **on** when `NODE_ENV=production`, off in dev/test — mirroring the sandbox settle `NODE_ENV` gate) and, when enforced, requires the admin session to hold a confirmed `AdminMfaFactor` and a recent per-session MFA-verified marker; when off it is a pass-through. The TOTP shared secret is encrypted at rest with a new independent **`ADMIN_MFA_SECRET_ENCRYPTION_KEY`** (validated by the existing `secretSchema`, added to the secret-uniqueness set in `env.ts`) — **encrypted, not hashed**, since TOTP verification needs the shared secret; neither the secret nor any recovery code is ever logged. Both new env vars are documented in `.env.example`.
  - `AdminAuditService.record(...)` writes exactly one append-only `AdminAuditLog` row **inside a caller-provided Prisma transaction** (so an admin action and its audit row commit or roll back together, §7) capturing acting-admin id, action, target type+id, a redacted before/after diff (no secrets/PII), request id, and timestamp; it exposes **no** update/delete path.
  - `AdminBootstrapService` grants the `admin` role idempotently at startup to an env-allowlisted set (**`ADMIN_BOOTSTRAP_EMAILS`**, optional, documented in `.env.example`), writing an audit row per grant — the **only** non-self-serve admin-grant path, and a no-op when the allowlist is empty. It never opens a public endpoint.
  - `AdminModule` provides/exports the two guards + audit + bootstrap for the Round-3 resource modules to import, and registers **no** providers into `app.module.ts` (that wiring is `T-83bd5f`). Unit tests (`admin-core.test.ts`) cover deny-by-default `403`, admin-only pass, `ADMIN_MFA_ENFORCED` on-vs-off behavior, and audit redaction; a disposable-PostgreSQL Supertest suite (`admin-core.integration.test.ts`, reading `ADMIN_CORE_INTEGRATION_DATABASE_URL`) proves the in-transaction audit write rolls back with a failed action and that bootstrap grants+audits idempotently. `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, and the explicit integration run pass.
- **Skills:** nestjs-backend, backend-auth-security, database-orm, web-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-e1b7a4, T-7f3c92

### T-b2d9f6 — Admin MFA enroll / confirm / verify / recovery endpoints

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/admin/mfa/admin-mfa.module.ts, apps/api/src/admin/mfa/admin-mfa.controller.ts, apps/api/src/admin/mfa/admin-mfa.service.ts, apps/api/src/admin/mfa/totp.ts, apps/api/src/admin/mfa/admin-mfa.controller.test.ts, apps/api/src/admin/mfa/admin-mfa.integration.test.ts, apps/api/prisma/schema.prisma, apps/api/prisma/migrations/&lt;ts&gt;_admin_mfa_rate_limit/migration.sql, apps/api/src/auth/core/auth-rate-limit.service.ts
- **Note (Round-3 sole schema owner):** this is the ONLY Round-3 task that edits `apps/api/prisma/schema.prisma` — it adds an `adminMfaVerification` member to the existing `AuthRateAction` enum (+ a migration) so failed MFA verifications reuse the DB-backed limiter, and adds a `checkAdminMfaVerification` method to `auth-rate-limit.service.ts` mirroring the magic-link methods. No other Round-3 task touches the schema or that service.
- **Acceptance:**
  - `POST /v1/admin/mfa/enroll` (session-auth + `AdminRolesGuard` + CSRF; **not** behind the enforcement guard — you cannot be MFA-verified before enrolling) starts TOTP enrollment: it generates a shared secret, stores it **encrypted** via the `T-c4a8e0` encryption key (never plaintext, never logged), and returns the one-time provisioning payload (otpauth URI/secret shown once). `POST /v1/admin/mfa/confirm` verifies a TOTP code against the pending factor, sets `confirmedAt`, and issues one-time **recovery codes hashed at rest** (returned once). `POST /v1/admin/mfa/verify` validates a TOTP (or recovery) code for a confirmed factor and sets the per-session MFA-verified marker the enforcement guard reads. `POST /v1/admin/mfa/recovery-codes` regenerates hashed recovery codes.
  - Every mutation writes an `AdminAuditLog` row (`mfaEnrolled`/`mfaRecoveryRegenerated`) via the `T-c4a8e0` audit service **in the same transaction**; no endpoint returns or logs a secret or a recovery-code hash. All endpoints require the `admin` role (non-admin → `403`); code comparison is constant-time; failed verifications are rate-limited (reuse the DB-backed limiter) and never reveal whether a factor exists.
  - Registers **no** providers into `app.module.ts` (`T-83bd5f` wires it). Controller/unit tests (`admin-mfa.controller.test.ts`) + a disposable-PostgreSQL Supertest suite (`admin-mfa.integration.test.ts`, reading `ADMIN_MFA_INTEGRATION_DATABASE_URL`, seeding an `admin` `Role`/`UserRole`) cover enroll→confirm→verify, recovery-code single-use, non-admin `403`, no-secret-in-response/log, and that the stored secret is encrypted (not plaintext) and recovery codes are hashed. `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, and the explicit integration run pass.
- **Skills:** nestjs-backend, backend-auth-security, web-security, database-orm, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-c4a8e0

### T-38e5c1 — Admin catalogue review resource (approve / reject)

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/admin/catalogue/admin-catalogue.module.ts, apps/api/src/admin/catalogue/admin-review.controller.ts, apps/api/src/admin/catalogue/admin-review.service.ts, apps/api/src/admin/catalogue/admin-review.controller.test.ts, apps/api/src/admin/catalogue/admin-review.integration.test.ts
- **Acceptance:**
  - `GET /v1/admin/review` (session-auth + `AdminRolesGuard` + `AdminMfaEnforcementGuard`) returns the cursor-paginated queue of `ProductVersion`s in `in_review` with their `Product` + linked `Artifact`/`BuildRun` QA/scan verdict metadata via the shared admin review-queue DTO (no buyer/order/revenue data), with a schema-bounded limit. Order the queue by `releasedAt, id` (the only monotonic column on `ProductVersion`) for a stable cursor.
  - **Deferred (do NOT touch `schema.prisma` here):** a `review_state`-leading index on `product_versions` for this queue is a known future perf item (the Layer-8 index is `product_id`-leading). It is out of scope this round to keep Round-3 files disjoint (only `T-b2d9f6` edits the schema); the tiny `product_versions` table makes a scan acceptable at v1 volume. Backlogged for a later perf pass.
  - `POST /v1/admin/products/:productId/versions/:version/approve` is a **dedicated guarded transition** (never a generic `PATCH`) that moves a version `in_review → approved` **only** (any other source state → `422`); `POST .../reject` moves it out of `in_review` (back to `draft`) and **requires a `reason`**. This is the approval half of the Layer-8 seller state machine: it reuses the shipped `ReviewState` enum **exactly** and stays consistent with `seller-review.service.ts` (seller does `draft→in_review`; admin does `in_review→approved`/reject). It does **not** touch `PublicationState` (that is `T-a6f204`).
  - Each action writes exactly one `AdminAuditLog` row (from→to, target version, actor) **in the same transaction** as the state change. Reads/acts are admin-scoped (admin sees all — no per-seller ownership filter), use allowlist `createZodDto` DTOs, and take no client-supplied acting id. Registers **no** providers into `app.module.ts` (`T-83bd5f` wires it).
  - Controller/unit tests (`admin-review.controller.test.ts`) + a disposable-PostgreSQL Supertest suite (`admin-review.integration.test.ts`, reading `ADMIN_CATALOGUE_INTEGRATION_DATABASE_URL`, seeding an `admin` `Role`/`UserRole` + an `in_review` version) cover: non-admin `403`; approve only from `in_review` (else `422`); reject requires a `reason`; exactly one audit row per action committed atomically (and none on a failed/rejected transition); no `PublicationState` change. `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, and the explicit integration run pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-c4a8e0

### T-a6f204 — Admin release/publication resource (publish / delist)

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/admin/publication/admin-publication.module.ts, apps/api/src/admin/publication/admin-publication.controller.ts, apps/api/src/admin/publication/admin-publication.service.ts, apps/api/src/admin/publication/admin-publication.controller.test.ts, apps/api/src/admin/publication/admin-publication.integration.test.ts
- **Acceptance:**
  - `POST /v1/admin/products/:productId/publish` (session-auth + `AdminRolesGuard` + `AdminMfaEnforcementGuard`, with a **recent-MFA re-check** when the flag is enforced — the §6 sensitive action) is a **dedicated guarded transition** that flips `Product.publicationState draft → published` **only if** the target `ProductVersion.reviewState === approved` **AND** its linked `Artifact` has a present, verified checksum/signature **AND** its `BuildRun` QA/scan verdicts are `passed`; otherwise `422` with no state change (design §5/§8 file-integrity). It sets `publishedAt`/`currentVersion` consistently with the shipped catalogue read. `POST .../delist` flips `published → delisted`. Neither is a generic `PATCH`; both reuse the shipped `PublicationState` enum + `Artifact` shape **exactly** (no parallel/duplicate state model).
  - Each transition writes exactly one `AdminAuditLog` row (from→to, target product+version, actor, verified-artifact checksum reference — never the signature) **in the same transaction** as the state flip. DTOs are allowlists; no admin endpoint here touches an immutable `OrderItemSnapshot` or any order/entitlement data; the acting id is server-derived only.
  - Registers **no** providers into `app.module.ts` (`T-83bd5f` wires it). Controller/unit tests (`admin-publication.controller.test.ts`) + a disposable-PostgreSQL Supertest suite (`admin-publication.integration.test.ts`, reading `ADMIN_PUBLICATION_INTEGRATION_DATABASE_URL`, seeding an `admin`, an `approved` version with a verified artifact, and a version without one) cover: non-admin `403`; publish blocked unless `approved` + verified artifact + passed QA/scan (`422`); publish success flips state + writes one atomic audit row; delist path; publishing an unapproved/forged-artifact version rejected. `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, and the explicit integration run pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, web-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-c4a8e0

### T-d9017b — Admin user-role provisioning (grant/revoke seller, grant admin)

- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/src/admin/users/admin-users.module.ts, apps/api/src/admin/users/admin-users.controller.ts, apps/api/src/admin/users/admin-users.service.ts, apps/api/src/admin/users/admin-users.controller.test.ts, apps/api/src/admin/users/admin-users.integration.test.ts
- **Acceptance:**
  - `GET /v1/admin/users` (session-auth + `AdminRolesGuard` + `AdminMfaEnforcementGuard`) returns a cursor-paginated, **PII-minimized** user list (normalized email + assigned role keys only — no session/token/order data, design §8 info-disclosure), with a schema-bounded limit. `POST /v1/admin/users/:userId/roles` grants a role and `DELETE /v1/admin/users/:userId/roles/:roleKey` revokes it, with the role key allowlisted to `seller|admin` (the finer split is deferred).
  - This is the capability Layer 8 **deferred to this gate**: granting `seller` creates the `UserRole` **and**, when absent, a minimal `SellerProfile` (slug derived from the user, uniqueness-checked) so the Layer-8 `SellerGuard` — which requires **both** the role and a profile — passes end-to-end; revoking `seller` removes the role but **preserves** the `SellerProfile` and its products (authoring history is not destroyed). Grants/revokes are idempotent and server-authoritative (acting admin from session only, never a body), and each writes exactly one `AdminAuditLog` row (`roleGranted`/`roleRevoked`, target userId + roleKey, actor) **in the same transaction**. An admin cannot revoke their own last `admin` role (lock-out guard) → `422`. DTOs are allowlists.
  - Registers **no** providers into `app.module.ts` (`T-83bd5f` wires it). Controller/unit tests (`admin-users.controller.test.ts`) + a disposable-PostgreSQL Supertest suite (`admin-users.integration.test.ts`, reading `ADMIN_USERS_INTEGRATION_DATABASE_URL`, seeding an `admin` + a plain user) cover: non-admin `403`; grant/revoke `seller` idempotent with one atomic audit row each; the seller grant creates a `SellerProfile`; a role key outside `seller|admin` → `422`; self-last-admin-revoke blocked; list PII-minimization. `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, and the explicit integration run pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-c4a8e0

### T-4c62ae — Web admin API client

- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/src/lib/admin-client.ts, apps/web/src/lib/admin-client.test.ts
- **Acceptance:**
  - A typed `admin-client` covers every admin call the shell needs — `GET /v1/admin/review`, approve/reject, `POST publish` / `delist`, `GET /v1/admin/users`, grant/revoke role, and the MFA enroll/confirm/verify/recovery-codes calls — building requests only from the shared `@marketplace/shared/admin` schemas and validating every response with the matching shared schema before returning it (a malformed payload is rejected). It calls only the same-origin proxy (reusing `api-client`), never a raw cross-origin `fetch`.
  - Every mutation sends the session-bound CSRF value via `X-CSRF-Token` (reusing the existing `use-session` CSRF state, matching `commerce-client`/`seller-client`). The client carries **no** acting-admin id, `publicationState`/`reviewState` free-set, or MFA-secret authority in any request body; the one-time MFA provisioning/recovery payloads returned by enroll/confirm are surfaced to the caller without being logged or persisted.
  - Unit tests (`admin-client.test.ts`) prove response-schema validation (including a rejected payload), CSRF-header presence on mutations, omission of server-owned fields from request bodies, correct cursor handling on the review/users lists, and no MFA-secret leak into logs. `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-api-integration, web-auth-state, web-security, shared-contracts, typescript-strict
- **Depends:** T-e1b7a4

### T-83bd5f — Compose admin modules and composed admin integration suite

- **Status:** in-progress
- **Assignee:** ai
- **Files:** apps/api/src/app.module.ts, apps/api/test/admin-surface.integration.test.ts
- **Acceptance:**
  - `app.module.ts` registers `AdminModule` and the admin MFA/catalogue/publication/users modules beside the existing catalogue/auth/commerce/entitlements/seller/factory/health/Prisma/config modules with **no** circular dependencies or duplicate providers; the Fastify bootstrap, versioning, Zod validation, exception filter, CSRF, and cookie support remain intact.
  - A disposable-PostgreSQL Supertest suite (reading `ADMIN_FLOW_INTEGRATION_DATABASE_URL`, extending the Layer-5 harness) boots the real composed app and proves the end-to-end admin path against seeded fixtures: seeded/bootstrapped `admin` → grant `seller` (+ minimal `SellerProfile`) → (seeded `in_review` version) → approve `in_review→approved` → publish `approved→published` with a verified artifact → delist, with every response parsing against its shared Zod schema and one `AdminAuditLog` row committed per state change.
  - The suite also proves the cross-cutting design §4/§8 guarantees at the composed HTTP seam: a non-admin session is `403` on **every** admin endpoint (deny-by-default); publish is blocked unless `approved` + verified artifact + passed QA (`422`); **no** admin endpoint reads/writes `Order`/`OrderItemSnapshot`/`Entitlement`/discount/review data (those endpoints are absent this layer); with `ADMIN_MFA_ENFORCED` on, an admin session lacking a verified MFA marker is challenged/blocked; and no response or log leaks a TOTP secret, recovery code, or PII beyond the minimized user list.
  - `pnpm --filter @marketplace/api lint`, `typecheck`, `test`, the explicit composed-integration run, and root `pnpm lint && pnpm typecheck && pnpm test` pass.
- **Skills:** api-design, nestjs-backend, backend-auth-security, backend-testing, database-orm, security-review, typescript-strict
- **Depends:** T-c4a8e0, T-b2d9f6, T-38e5c1, T-a6f204, T-d9017b

### T-2e7a9c — Admin shell surface (/[locale]/admin/*)

- **Status:** in-progress
- **Assignee:** ai
- **Files:** apps/web/src/app/[locale]/admin/page.tsx, apps/web/src/app/[locale]/admin/review/page.tsx, apps/web/src/app/[locale]/admin/publish/page.tsx, apps/web/src/app/[locale]/admin/users/page.tsx, apps/web/src/app/[locale]/admin/mfa/page.tsx, apps/web/src/components/admin/review-queue.tsx, apps/web/src/components/admin/review-actions.tsx, apps/web/src/components/admin/publication-panel.tsx, apps/web/src/components/admin/user-roles-panel.tsx, apps/web/src/components/admin/mfa-enrollment.tsx, apps/web/src/components/admin/admin-nav-entry.tsx, apps/web/src/components/app-shell.tsx, apps/web/messages/vi/admin.json, apps/web/messages/en/admin.json, apps/web/src/components/admin/review-queue.test.tsx
- **Acceptance:**
  - `/[locale]/admin` is a dense operate/review/publish shell (design §2/§4): `/admin/review` lists the `in_review` queue (via the `T-4c62ae` client) with approve/reject actions (reject captures a `reason`); `/admin/publish` shows publishable/delistable products and hosts the guarded publish/delist actions (each surfaces the server's `422` when the version is unapproved or the artifact unverified — the UI never fabricates a publishable state); `/admin/users` lists the PII-minimized users with grant/revoke `seller`/`admin` controls; `/admin/mfa` hosts TOTP enrollment (shows the one-time provisioning payload + recovery codes once, never persisting or logging them). Every mutation sends CSRF via the client.
  - The surface is UX-gated for admins but relies on the **server** guard for authority — a non-admin reaching it sees the client's `403`/not-authorised handling, never fabricated data; there is **no** order/entitlement/discount/review-moderation affordance anywhere (later passes). An admin nav entry is added to `app-shell.tsx`, shown only in the admin context, without altering the existing customer/seller navigation.
  - Responsive 320–1440px, ≥44px targets, visible focus, reduced-motion-safe, no 320px horizontal overflow; all copy from `messages/<locale>/admin.json` with equal `vi`/`en` keys.
  - Component tests (including axe) cover the review-queue render + approve/reject call sequence with CSRF, the publish action surfacing a server `422`, the role grant/revoke controls, the MFA enrollment one-time-secret handling (no secret rendered into a persisted/logged surface), and the absence of any order/entitlement affordance. `pnpm --filter @marketplace/web lint`, `typecheck`, and `test` pass.
- **Skills:** web-data-forms, web-api-integration, web-auth-state, web-security, ui-ux-pro-max, web-styling, web-responsive, web-i18n-theme, typescript-strict
- **Depends:** T-4c62ae

### T-f14b83 — Gate the admin integration suites in CI

- **Status:** todo
- **Assignee:** ai
- **Files:** .github/workflows/ci.yml
- **Acceptance:**
  - `ci.yml` provisions one freshly-migrated disposable PostgreSQL database per new admin integration suite and exports `ADMIN_CORE_INTEGRATION_DATABASE_URL` (`T-c4a8e0`), `ADMIN_MFA_INTEGRATION_DATABASE_URL` (`T-b2d9f6`), `ADMIN_CATALOGUE_INTEGRATION_DATABASE_URL` (`T-38e5c1`), `ADMIN_PUBLICATION_INTEGRATION_DATABASE_URL` (`T-a6f204`), `ADMIN_USERS_INTEGRATION_DATABASE_URL` (`T-d9017b`), and `ADMIN_FLOW_INTEGRATION_DATABASE_URL` (`T-83bd5f`) — one dedicated DB each, per the recorded per-suite-DB gotcha — so these real-HTTP-to-database seams actually gate merges.
  - It also exports the test-only values these suites need: an explicit `ADMIN_MFA_SECRET_ENCRYPTION_KEY` (canonical unpadded base64url 256-bit test value, distinct from every existing secret), `ADMIN_MFA_ENFORCED=false` for the default suites plus a step/value that exercises the enforced (`true`) path, and an `ADMIN_BOOTSTRAP_EMAILS` test value. No production credential is introduced; every secret is an explicit test value.
  - **Provisioning cost control (keeps per-suite DB isolation, cuts wall-clock):** the DB provisioning/migration step now runs `prisma migrate deploy` across ALL disposable databases **concurrently** (background each migrate + `wait`, or an equivalent parallel fan-out) rather than sequentially — so adding the six admin DBs (bringing the total to ~16) does not linearly grow the provisioning time; this also speeds the existing catalogue/auth/commerce/entitlements/seller/factory DBs. Migrations against distinct databases are independent, so parallelizing is safe; the step must still fail the job if ANY migrate fails (no swallowed background errors).
  - The existing `pnpm turbo run lint typecheck test` gate, the previously-added catalogue/auth/commerce/entitlements/seller/factory integration DB wiring, Node 20 + pnpm pinning, and PR/`main`/`develop` triggers are preserved; the task changes only `ci.yml`. Workflow YAML passes static validation, and the full CI run is verified in a real terminal outside the agent session per the heavy-build rule.
- **Skills:** git-workflow, backend-testing, security-review
- **Depends:** T-c4a8e0, T-b2d9f6, T-38e5c1, T-a6f204, T-d9017b, T-83bd5f

### T-5d0e6a — Cross-viewport Playwright e2e for the admin review→publish happy path

- **Status:** todo
- **Assignee:** ai
- **Files:** apps/web/e2e/admin-surface.spec.ts, apps/web/e2e/fixtures/admin-user.ts, apps/web/e2e/README.md, apps/api/prisma/seed-e2e.mjs
- **Acceptance:**
  - Playwright drives the v1 admin happy path against the served full stack (web + API + disposable Postgres, `ADMIN_MFA_ENFORCED=false` in dev): sign in as a **seeded** `admin`-role user (the seed extends `seed-e2e.mjs` with an `admin` `Role`/`UserRole`) → grant `seller` to a user → review an `in_review` version → approve → publish with a verified artifact → confirm it reaches the public catalogue, in both `vi`/`en`, across representative viewports from 320–1440px.
  - The spec asserts a non-admin session cannot reach `/[locale]/admin/*`, that there is **no** order/entitlement/discount/review-moderation affordance anywhere in the admin surface (later passes), that no TOTP secret/recovery code or PII is client-readable at any step, that each visited page passes axe WCAG 2.2 AA, and that there is zero page-level horizontal overflow at every tested width.
  - `e2e/admin-surface.spec.ts` reuses the Layer-5 `playwright.config.ts` and capture-email seam and is statically valid and lint/typecheck clean; the full Playwright run (needs a built/served stack) is **static-valid + the full run is an out-of-session terminal step** per the heavy-build rule, and `e2e/README.md` documents the added admin seed + env. No `package.json`/`pnpm-lock.yaml` edits.
- **Skills:** web-testing-release, web-responsive, web-security, backend-testing, typescript-strict
- **Depends:** T-83bd5f, T-2e7a9c
