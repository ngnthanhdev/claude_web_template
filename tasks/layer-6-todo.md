# Layer 6 — Commerce, Seller, and Admin Enablement Gates

Status: **todo**

Layers 0–5 shipped everything the approved spec calls for that stands on a
proven Layer-4 endpoint: the shared contracts, the catalogue + passwordless-auth
persistence, the live public API (`GET /v1/categories|products|products/:slug`,
`POST /v1/auth/magic-links`, `POST /v1/auth/magic-link-redemptions`,
`GET|DELETE /v1/sessions/current`, `DELETE /v1/sessions`), the full public
Next.js storefront (home, catalogue, search, product detail, sign-in,
magic-link redemption, account/session management), and the web release gates
(CI Postgres integration gate, cross-viewport Playwright + axe, standalone
Docker). All of that is `done` and green.

**The substantive remaining spec scope is GATED, not merely unbuilt.** The
entire customer commerce surface — cart → checkout → sandbox/mock payment →
orders → entitlements/library → signed-URL downloads → wishlist →
coupons/referrals/discount-quotes → verified-purchase reviews — plus **seller
authoring** and the entire **admin surface**, has no Layer-4 endpoint, no
Prisma model, and no shared Zod contract yet. Per spec §6 (payment deferred,
public sellers a non-goal), spec §7 ("Future seller features require a new
refinement and threat model before any seller-facing endpoint is enabled"), and
the Layer 5 completion gate (commerce is downstream of a dedicated future
commerce layer; sellers/admin additionally require a new refinement + threat
model), none of it may be scoped into ready-to-implement tasks until a `/refine`
brainstorm + `/threat-model` pass produces an approved design a follow-on
`/scope-breakdown` can layer.

Therefore **Layer 6 is a decision/gate layer, not a build layer for those
surfaces.** It emits the human-owned gates that unblock a future commerce layer
and future seller/admin layers, plus the single genuinely-unblocked
release-readiness task that stands entirely on Layers 0–5. No task below writes
application code, a Prisma model, a shared contract, or an endpoint for any
deferred surface.

## Dependency rounds

All four tasks are independent — there is no intra-layer `Depends` and no two
tasks touch the same file.

1. **Gates (human, `T-6d0f2c` / `T-b13e77` / `T-4c8a9e`)** — each produces one
   approved design document. They do **not** themselves build anything; each
   must complete (design approved) and then be handed to a _fresh_
   `/scope-breakdown` pass, which is what turns the approved design into an
   ordered implementation layer (shared contracts → Prisma → NestJS resources →
   web screens). Until then, no commerce/seller/admin implementation task
   exists to run.
2. **Unblocked readiness (ai, `T-e72b45`)** — fully independent of the gated
   surfaces; can proceed immediately.

## Explicitly still deferred (and why)

- **Customer commerce surface** (cart, checkout, `checkout/result`, sandbox
  payment, orders, `account/orders/[id]`, entitlements/`account/library`,
  downloads, wishlist, coupons/referrals/discount-quotes, verified reviews):
  no backing endpoint/model/contract; payment production is an explicit go-live
  blocker (§8). Gated by `T-6d0f2c`.
- **Seller authoring** (seller-scoped product/version/artifact/build authoring,
  QA/publication states, seller dashboard): spec §7 mandates a new refinement +
  threat model first; §6 lists public sellers/KYC/commissions/payouts as v1
  non-goals. Gated by `T-b13e77`.
- **Admin surface** (`/[locale]/admin/*`; catalogue/release/build/order/
  entitlement/discount/review/audit management with guarded
  publish/delist/approve): spec §7 admin-API elevation requires RBAC + MFA +
  append-only audit designed before any endpoint is enabled. Gated by
  `T-4c8a9e`.
- **Template inventory production + provider decisions** (the ≥80 real template
  products and the factory build runners; storage, preview hosting, email, and
  deployment vendors): spec §8's dominant schedule risk and open
  provider-neutral decisions. Not scoped here; the commerce gate resolves only
  the payment/storage decisions that block _commerce_ go-live.

---

### T-6d0f2c — Commerce & purchase-surface enablement gate (/refine + /threat-model)

- **Status:** todo
- **Assignee:** human
- **Files:** docs/specs/2026-07-28-commerce-purchase-surface-design.md (new approved design doc; the concrete date is the day the gate is run)
- **Acceptance:**
  - A new approved design document under `docs/specs/` is produced by a `/refine`
    brainstorm (clarifying questions one at a time, 2–3 approaches with a
    recommendation) plus a `/threat-model` pass, covering the full deferred
    customer commerce surface: `Cart`/`CartItem`; checkout (dialog on desktop /
    full-screen sheet on mobile, following the spec §4 Global/Vietnam + email +
    name + coupon + referral + continue hierarchy, clearly labelled sandbox);
    sandbox/mock `PaymentAttempt` (production payment + webhooks remain an
    explicit go-live blocker per §6/§8); `Order`/`OrderItemSnapshot`;
    `Entitlement` + `account/library`; signed-URL `DownloadEvent` + download
    audit; `Wishlist`; `Coupon`/`ReferralCode`/`DiscountRedemption` +
    `POST /v1/discount-quotes`; and verified-purchase `Review` (which depends on
    entitlement data existing, so it is designed to sequence after purchase).
  - The doc turns spec §7's high-level rows into concrete, per-endpoint
    mitigations before any endpoint is enabled: server-side price/discount
    calculation with immutable order-item snapshots (no client price/licence/
    discount authority); server-scoped ownership + entitlement checks with no
    client-supplied owner id (order/download BOLA/IDOR); private-bucket,
    short-TTL, redacted-log signed download URLs; and atomic, idempotent,
    uniquely-capped coupon/referral redemption.
  - The doc resolves — or explicitly records as still-open behind the
    sandbox-only boundary — the §8 provider-neutral decisions that gate commerce
    go-live (payment provider + webhook signing, entitlement/artifact storage),
    so a later scope pass is not forced to invent them.
  - The document is marked **approved by the user** and is structured so a
    follow-on `/scope-breakdown` pass can derive an ordered commerce layer
    (shared Zod contracts → Prisma models/migrations → NestJS resources → web
    screens) without re-litigating scope. This task writes **no** application
    code, Prisma model, shared contract, or endpoint; its checkable "done" is
    the approved, internally consistent design doc plus a linked follow-on scope
    pass, not a passing test suite.
- **Skills:** brainstorming, security-threat-model, api-design, backend-auth-security, database-orm, shared-contracts, web-data-forms

### T-b13e77 — Seller authoring enablement gate (/refine + /threat-model)

- **Status:** todo
- **Assignee:** human
- **Files:** docs/specs/2026-07-28-seller-authoring-design.md (new approved design doc; the concrete date is the day the gate is run)
- **Acceptance:**
  - Per spec §7 ("Future seller features require a new refinement and threat
    model before any seller-facing endpoint is enabled"), a new approved design
    doc under `docs/specs/` is produced by a `/refine` brainstorm +
    `/threat-model` covering the intended seller surface: seller onboarding and
    seller-scoped product authoring, `ProductVersion`/`Artifact`/`BuildRun`, the
    QA/publication state machine, and any seller dashboard — building on the
    existing server-controlled `Product.sellerId` / `SellerProfile` ownership so
    a later scope pass does not rewrite catalogue authorization.
  - The doc names the concrete trust boundaries and mitigations: seller RBAC and
    ownership scoping so one seller cannot read or modify another seller's
    products/releases, and ephemeral, resource-limited, least-privilege
    build-runner isolation (spec §7 malicious-code row) before any build runner
    executes untrusted product code.
  - The doc explicitly reconciles with spec §6 (public sellers, KYC,
    commissions, payouts, and seller dashboards are v1 non-goals) by stating
    which seller capabilities, if any, v1 enables versus defers, so a follow-on
    `/scope-breakdown` pass inherits an unambiguous boundary.
  - The document is marked **approved by the user** and structured for a
    follow-on `/scope-breakdown` pass; this task writes **no** seller-facing
    endpoint, guard, model, or code. Its checkable "done" is the approved,
    internally consistent design doc, not a passing test suite.
- **Skills:** brainstorming, security-threat-model, backend-auth-security, api-design, database-orm, shared-contracts

### T-4c8a9e — Admin surface enablement gate (/refine + /threat-model)

- **Status:** todo
- **Assignee:** human
- **Files:** docs/specs/2026-07-28-admin-surface-design.md (new approved design doc; the concrete date is the day the gate is run)
- **Acceptance:**
  - A new approved design doc under `docs/specs/` is produced by a `/refine`
    brainstorm + `/threat-model` covering the admin surface the spec calls for
    (§3 admin resources + §4 `/[locale]/admin/*` pages): catalogue authoring,
    releases/builds, orders, entitlements, discounts, review moderation, and
    audit, with guarded publish/delist/approve actions on the dense
    operate/review/publish shell described in §2.
  - The doc turns spec §7's admin-API elevation row into concrete mitigations
    before any admin endpoint is enabled: server-enforced admin RBAC (no
    client-supplied role/owner authority), production MFA, and an append-only
    `AdminAuditLog` capturing the acting admin for every release/publication
    state change (§7 repudiation row).
  - The document is marked **approved by the user** and structured for a
    follow-on `/scope-breakdown` pass; this task writes **no** admin endpoint,
    guard, model, or code. Its checkable "done" is the approved, internally
    consistent design doc, not a passing test suite.
- **Skills:** brainstorming, security-threat-model, backend-auth-security, web-security, api-design, database-orm

### T-e72b45 — Promote security.yml scanners from advisory to blocking now the apps are populated

- **Status:** done
- **Assignee:** ai
- **Files:** .github/workflows/security.yml, docs/SECURITY.md
- **Acceptance:**
  - `docs/CI_CD.md` scopes the `security.yml` scanners' `continue-on-error` to
    the era when "`apps/*`/`packages/shared` are still empty skeletons" — a
    condition Layers 1–5 have ended. The Gitleaks secret-scan step therefore no
    longer runs `continue-on-error`: a detected secret blocks the merge,
    completing the documented "no hard-coded secrets" discipline gate rather than
    leaving secret detection advisory.
  - Semgrep (`p/typescript p/javascript p/owasp-top-ten p/nodejsscan`) and
    `pnpm audit --audit-level=high` are escalated to blocking **only** against a
    confirmed-clean baseline. Where a finding cannot yet be resolved, it is
    recorded as an explicit, narrowly-scoped, dated exception with rationale in
    `docs/SECURITY.md` (not left as a blanket advisory step). The separate
    non-blocking `design-detector` job and ZAP's manual, release-time status are
    unchanged.
  - The PR / `main` / `develop` triggers, the existing steps and rulesets, and
    the provider-neutral posture are preserved; no production credential is
    introduced. `security.yml` passes static YAML validation, and the full
    security workflow run is verified in a real terminal outside the agent
    session per the repository heavy-build rule; the task changes only
    `security.yml` and `docs/SECURITY.md`.
- **Skills:** security-review, git-workflow, backend-auth-security, web-security

---

## Layer completion gate

Layer 6 is complete when: `T-e72b45` has merged with a green `security.yml`
(secret scan blocking; any Semgrep/audit exceptions recorded in
`docs/SECURITY.md`); and each of `T-6d0f2c`, `T-b13e77`, and `T-4c8a9e` has a
user-approved design document under `docs/specs/`. Those three approved designs
are the inputs to **separate future `/scope-breakdown` passes** — the commerce,
seller, and admin implementation layers are created by those passes, not by this
file. No commerce, seller, or admin endpoint, model, contract, or screen is
implemented until its gate's design is approved and layered, and payment
production remains an explicit go-live blocker per spec §6/§8.
