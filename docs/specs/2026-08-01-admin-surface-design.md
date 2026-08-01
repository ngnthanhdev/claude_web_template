# Admin Surface Enablement Design (Gate T-4c8a9e)

**Status: APPROVED — 2026-08-01.** Produced by a `/refine` brainstorm
(design forks in §1) plus a `/threat-model` pass (§8). Turns spec §7's admin-API
elevation, repudiation, and access-control rows into concrete mitigations before
any admin endpoint is enabled. Once approved, a follow-on `/scope-breakdown`
derives the admin implementation layer(s); this document writes no endpoint,
guard, model, or code.

## 1. Locked decisions

Three product forks were decided by the user; the rest are fixed by spec §7 and
recorded so a later scope pass does not relitigate them.

1. **Single `admin` role for v1.** One server-enforced `admin` role guards every
   admin action (KISS). A finer editor/publisher/support split is deferred until
   team size or duty-separation needs justify it — the guard is written so that
   split is an additive change, not a rewrite.
2. **MFA is prod-flag-gated.** MFA (TOTP, WebAuthn-capable) is built in the first
   admin layer but **enforced only behind a production flag** — required in
   production, optional in dev — mirroring the sandbox-payment go-live-blocker
   pattern. Production admin access without MFA is a go-live blocker.
3. **Sequenced surface breadth.** v1 admin covers **catalogue + releases/
   publication + audit** now; **order/entitlement** admin sequences _after_
   commerce Wave 1 (layer 7) ships that data; **discount/review moderation**
   sequences _after_ commerce Wave 2. The marketplace only manages data that
   exists.
4. **Spec-mandated, not optional (§7):** server-enforced admin RBAC (no
   client-supplied role/owner authority), production MFA, and an **append-only
   audit log**. Audit scope is the safer superset — **every admin
   state-changing action**, not only publication (§7's minimum) — since it is
   cheap and closes the repudiation row fully.

## 2. Scope — what v1 enables vs sequences/defers

**v1 ENABLES (this gate → the first admin scope pass):**

- An admin-provisioned `admin` role and a `RolesGuard` on every admin controller
  (deny-by-default).
- Catalogue administration: review and act on seller **submit-for-review**
  items (approve/reject), and edit catalogue metadata where operator-owned.
- Release/publication actions: guarded **publish / delist**, gated on a
  QA-approved state and a verified artifact checksum/signature.
- MFA enrollment + verification (enforced behind the production flag).
- An append-only `AdminAuditLog` capturing the acting admin for every
  state-changing admin action.
- The `/[locale]/admin/*` shell (dense operate/review/publish workflows, spec
  §2/§4).

**v1 SEQUENCES (designed here, built after the backing data exists):**

| Admin capability                      | Waits for                                  | Source      |
| ------------------------------------- | ------------------------------------------ | ----------- |
| Order administration / lookup         | Commerce Wave 1 (`Order`/`PaymentAttempt`) | §3, layer 7 |
| Entitlement grant / revoke / audit    | Commerce Wave 1 (`Entitlement`)            | §3, layer 7 |
| Discount (coupon/referral) management | Commerce Wave 2                            | §3, Wave 2  |
| Review moderation                     | Commerce Wave 2 (verified reviews)         | §3, Wave 2  |

**v1 DEFERS (documented, not designed):** finer admin roles (fork 1),
refund/chargeback automation (§6 non-goal), and any admin action on data whose
model does not yet exist.

## 3. Primitives this builds on / introduces

Grounded against the Layer-5 codebase:

- **Exists:** `Role` / `UserRole` join (RBAC substrate); a return-to
  path-shape validator for `/admin/*` deep links in `packages/shared/src/auth.ts`
  (this is URL canonicalization, **not** an authorization guard).
- **Introduce:** an admin-role provisioning path; an admin `RolesGuard`; MFA
  (TOTP/WebAuthn) enrollment/verification + the production enforcement flag; the
  `AdminAuditLog` model; and the `apps/web` `/[locale]/admin/*` route surface.

## 4. Authorization & data-flow

Trace for every admin request: **controller → `RolesGuard` (role = `admin`) →
[production: MFA-verified session check] → service → Prisma**, with an
`AdminAuditLog` write inside the same transaction as any state change.

- Deny-by-default: an admin controller without the guard must fail closed; no
  route is implicitly public.
- No client-supplied role or owner authority — the acting principal comes from
  the session only.
- Allowlist `createZodDto` DTOs; **immutable order-item snapshots are never
  editable** by any admin endpoint; publication/entitlement transitions go
  through dedicated guarded endpoints, never a generic `PATCH`.
- CSRF token on every admin mutation (reuse the `web-security` same-origin +
  SameSite-cookie posture).

## 5. Publication & QA integration

Admin is the approval half of the seller gate's state machine (`T-b13e77`):
seller moves `draft→in_review`; **admin moves `in_review→approved→published`**
and may `delist`. Publish verifies the linked `Artifact` checksum/signature and
the QA-approved state before flipping `PublicationState`. Every transition writes
an `AdminAuditLog` row.

## 6. MFA design (prod-flag-gated)

- Method: TOTP for v1, schema left open to WebAuthn.
- Enrollment: admin enrolls a factor; recovery codes issued once.
- Enforcement: a config flag (default **on in production**, off in dev) gates a
  post-login MFA challenge for any `admin`-role session; sensitive actions
  (publish, entitlement grant/revoke) may require a recent MFA re-check.
- Go-live blocker: production admin access without MFA is not permitted.

## 7. `AdminAuditLog` design

- Append-only: no update/delete API; storage integrity-protected; separate from
  operational writes.
- Row: acting admin id, action, target type + id, before/after state (or a
  redacted diff), request id, timestamp.
- Written in the same transaction as the state change it records, so an action
  and its audit row commit or roll back together.
- Covers **every** admin state-changing action (superset of §7's publication
  minimum).

## 8. Threat model (STRIDE)

| Element                    | STRIDE                      | Threat                                                                   | Mitigation                                                                                         | Standard                  |
| -------------------------- | --------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------- |
| Admin session / MFA        | Spoofing                    | Stolen admin session → full control                                      | Production MFA (TOTP/WebAuthn), short admin-session TTL, re-auth for sensitive actions, rate limit | ASVS Auth                 |
| Admin RBAC guard           | Elevation                   | Non-admin reaches an admin action via a route that forgot the guard      | Server `RolesGuard` on every admin controller, deny-by-default; no client-supplied role/owner      | ASVS 4.1                  |
| Publish / delist action    | Elevation / Tampering       | Unauthorized publish, or publishing an unapproved/forged artifact        | Guarded endpoint; verify artifact checksum/signature + QA-approved state before publish            | ASVS 4.1 / File Integrity |
| Any publication transition | Repudiation                 | No record of who published/delisted                                      | Append-only `AdminAuditLog` (acting admin, from→to, target, timestamp), immutable                  | ASVS Logging              |
| Order / entitlement admin  | Info disclosure / BOLA      | Endpoint leaks buyer PII broadly                                         | Scope reads to purpose, redact PII to need, log access                                             | ASVS Data Protection      |
| Entitlement grant / revoke | Elevation / Tampering       | Admin fabricates entitlements or grants free access at scale             | Guarded, audited, idempotent, server-side only                                                     | ASVS Business Logic       |
| Admin write DTOs           | Tampering (mass-assignment) | Body sets fields it shouldn't (reassign ownership, edit order snapshots) | Allowlist DTOs; immutable order snapshots never editable; dedicated guarded transitions            | ASVS 5.1                  |
| `AdminAuditLog` itself     | Tampering / Repudiation     | Actor edits/deletes the trail to hide actions                            | Append-only, no update/delete API, integrity-protected, separate from operational writes           | ASVS Logging              |
| Admin mutation             | Spoofing / CSRF             | CSRF on a state-changing admin action                                    | Same-origin, SameSite cookie + CSRF token on mutations                                             | ASVS Web Security         |
| Review moderation          | Tampering                   | Content removed/edited with no trace                                     | Moderation actions audited (actor + reason); soft-delete with record                               | ASVS Logging              |

## 9. Reconciliation with spec

Spec §7's three admin rows are fully addressed: RBAC (server `RolesGuard`,
deny-by-default), production MFA (prod-flag-gated, go-live blocker), and the
append-only audit log (superset scope). §6 non-goals (refund/chargeback
automation, public sellers) are untouched. The sequenced breadth honors the
dependency reality that admin can only manage data later layers create.

## 10. Handoff to `/scope-breakdown`

The first admin scope pass builds: `packages/shared` admin contracts →
Prisma (`AdminAuditLog`, MFA factor/recovery fields, admin-role seed) → NestJS
admin module (`RolesGuard`, MFA guard behind the prod flag, catalogue/release/
publication resources, audit interceptor) → `apps/web` `/[locale]/admin/*` shell
→ tests (Supertest RBAC deny-by-default + audit-row-per-action + publish-gating;
Vitest/RTL admin shell). Order/entitlement admin is a follow-on pass after layer
7; discount/review moderation follows Wave 2.

## 11. Approval

This document's checkable "done" is user approval, not a passing test suite. On
approval its status flips to **APPROVED**, gate `T-4c8a9e` is marked done, and —
with `T-e72b45`, `T-6d0f2c`, and `T-b13e77` also complete — Layer 6's completion
gate is satisfied, so `/next-layer` may advance.
