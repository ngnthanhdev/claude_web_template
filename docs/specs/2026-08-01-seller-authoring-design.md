# Seller Authoring Enablement Design (Gate T-b13e77)

**Status: APPROVED — 2026-08-01.** Produced by a `/refine` brainstorm
(design forks in §1) plus a `/threat-model` pass (§8). Satisfies spec §7's
requirement that "future seller features require a new refinement and threat
model before any seller-facing endpoint is enabled." Once approved, a follow-on
`/scope-breakdown` derives the seller implementation layer; this document writes
no endpoint, guard, model, or code.

## 1. Locked decisions

Two product forks were decided by the user; the rest are settled by repo
evidence (spec §2/§6 and the existing Prisma schema) and recorded here so a
later scope pass does not relitigate them.

1. **Seller surface = first-party authoring.** v1 enables a `seller`-scoped
   authoring surface for **trusted/internal authors only** — no public
   self-service signup. A seller may author their own products and product
   versions and **submit them for review**; they may never self-publish.
   Ownership rides entirely on the existing server-controlled `Product.sellerId`
   / `SellerProfile`. This unblocks template production (the §8 dominant
   schedule risk) with the smallest new attack surface.
2. **Builds run in the external factory / CI — the marketplace never executes
   product build code.** Per spec §2 ("the factory publishes versioned
   immutable ZIPs, checksums… the marketplace stores their metadata and artifact
   identifiers"), the marketplace **ingests a signed, checksummed artifact
   reference** and stores it. The scariest STRIDE row (malicious build code
   exhausting a runner / stealing credentials) therefore sits **outside** the
   marketplace trust boundary. Build-runner isolation is still _specified_ here
   (§7) as the standard the factory must meet and the bar any future
   in-marketplace runner would have to clear — but no such runner is enabled in
   v1.
3. **Role provisioning is admin-only.** The `seller` role is granted through the
   admin surface (gate `T-4c8a9e`), never through a self-service request. A user
   cannot escalate themselves, and the server derives `sellerId` from the
   authenticated principal, never from a request body.
4. **Authorization reuses the existing ownership model.** Every seller authoring
   query is scoped `where sellerId = principal.sellerId`. No new ownership
   primitive is introduced; the existing `SellerProfile` + `Product.sellerId` +
   `Role`/`UserRole` are the substrate.

## 2. Scope — what v1 enables vs defers

**v1 ENABLES (this gate → a future scope pass):**

- An admin-provisioned `seller` role and the guard that gates every authoring
  endpoint on it.
- A seller-scoped authoring surface: create/edit **own** `Product` (draft) and
  `ProductVersion`; attach translations, media, compatibility, specs, demo
  pages to own products; **submit-for-review**.
- Ingestion of a factory-produced, signed, checksummed **artifact reference**
  (new `Artifact` + `BuildRun` _record_ models — see §4) linked to a
  `ProductVersion`. These are metadata records, **not** executors.
- A minimal seller **read** view of the seller's own catalogue and each release's
  QA/publication state (no analytics — see deferrals).

**v1 DEFERS (documented, not designed here):**

| Deferred capability                                | Why                                                    | Source            |
| -------------------------------------------------- | ------------------------------------------------------ | ----------------- |
| Public seller signup / open marketplace-of-sellers | v1 is first-party authoring only                       | §6, fork 1        |
| KYC / identity verification                        | No public sellers to verify                            | §6                |
| Commissions, payouts, revenue split                | No monetary seller relationship in v1                  | §6                |
| Seller sales dashboards / revenue analytics        | Explicit §6 non-goal; leaks buyer/order data if rushed | §6, §8 threat row |
| In-marketplace build execution                     | Builds run in the external factory (fork 2)            | §2, fork 2        |
| Seller-initiated publish/delist                    | Publication is an admin-only guarded action            | §7, gate T-4c8a9e |

## 3. Primitives this builds on (already in the schema)

Grounded against `apps/api/prisma/schema.prisma` as of Layer 5:

- `SellerProfile { id, ownerId @unique, slug @unique, owner→User, products[] }`.
- `Product.sellerId` (`onDelete: Restrict`) with index `[sellerId,
publicationState, createdAt]` — ownership scoping is already indexed.
- `Role` / `UserRole` join — RBAC substrate exists.
- `PublicationState { draft, published, delisted }` (default `draft`).
- `ProductVersion { id, productId, version, releasedAt, translations[] }` with
  `@@unique([productId, version])`.

A scope pass therefore **extends**, it does not rewrite, catalogue
authorization.

## 4. New models to introduce (described, not coded)

- **QA/review state.** The current `PublicationState` has no "submitted / in
  review / approved" step between `draft` and `published`. Introduce a review
  sub-state — either an added `in_review` value plus an `approved` gate before
  `published`, or a small separate `ReviewState` on `ProductVersion`. The scope
  pass picks the concrete shape; the invariant is: **seller can move
  draft→in_review only; admin moves in_review→approved→published.**
- **`Artifact`** — an immutable record of a factory-produced ZIP: stable version
  key, storage id/URI, `checksum`, `signature`, size, produced-at. Linked to a
  `ProductVersion`. No file bytes flow through the marketplace beyond the signed
  download path already designed in the commerce gate.
- **`BuildRun`** — a **record** of an external factory build (status, started/
  finished, factory run id, resulting `Artifact` id, QA/scan verdicts from
  spec §5 steps 1–9). It documents provenance; it does **not** run anything.
- **Seller-role assignment** rides on the existing `UserRole`; no new model,
  only an admin-only provisioning path (owned by gate `T-4c8a9e`).

## 5. Authorization & data-flow

Trace for every seller authoring request: **controller → seller guard (role =
`seller`) → service scopes `where sellerId = principal.sellerId` → Prisma**.

- Input validated by an allowlist `createZodDto` DTO from `packages/shared`;
  server-owned fields (`sellerId`, `publicationState`, `isFeatured`, price
  authority, `Artifact.checksum/signature`) are **never** bindable from the body
  (mass-assignment defense).
- State transitions go through dedicated guarded endpoints, never a generic
  authoring `PATCH`.
- The client `seller` role is UX only — every endpoint re-checks role +
  ownership server-side.

## 6. API surface sketch (`/v1`, for the scope pass to formalize)

Seller-scoped, all behind the `seller` guard and owner-scoping:

- `POST /v1/seller/products`, `PATCH /v1/seller/products/:id` (own, draft only)
- `POST /v1/seller/products/:id/versions`
- `POST /v1/seller/products/:id/submit-for-review` (draft→in_review)
- `GET /v1/seller/products`, `GET /v1/seller/products/:id` (own only)
- Artifact/BuildRun ingest is **factory→API**, signature-verified, not a
  browser-facing seller endpoint.

Publish / approve / delist endpoints are **admin** resources — designed in gate
`T-4c8a9e`, not here.

## 7. Build-runner isolation standard (for the factory + any future runner)

Even though builds run in the external factory in v1, this gate fixes the bar so
a future decision to move builds in-house inherits it rather than inventing it
(spec §7 malicious-code row):

- Ephemeral, single-use environment per build; destroyed after.
- Hard CPU/memory/time/disk limits; no unbounded work.
- Network egress restricted to an allowlist; no access to the marketplace DB,
  secrets, or internal network.
- Least-privilege credentials scoped to writing one artifact to a private bucket.
- Output is a signed, checksummed artifact; the marketplace verifies the
  signature + checksum on ingest before linking it to a `ProductVersion`.

## 8. Threat model (STRIDE)

| Element                                | STRIDE                           | Threat                                                                                        | Mitigation                                                                                                                                | Standard             |
| -------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| SellerProfile / role provisioning      | Elevation                        | User self-escalates to seller or assigns another user's `sellerId`                            | Admin-provisioned role only; server derives `sellerId` from the authenticated principal, never the body                                   | ASVS 4.1             |
| Product/version authoring              | Elevation / BOLA                 | Seller A reads or edits Seller B's product/release                                            | Every query scoped `where sellerId = principal.sellerId`; reject on mismatch; no client owner id                                          | ASVS 4.2             |
| Product authoring                      | Tampering (mass-assignment)      | Seller sets server-owned fields (publication state, `isFeatured`, price, `sellerId`) via body | Allowlist DTO; state/feature/price changes only via dedicated guarded endpoints                                                           | ASVS 5.1             |
| Artifact / BuildRun (external factory) | DoS / Elevation (malicious code) | Untrusted build code exhausts a runner or steals credentials                                  | Builds run in the external factory under §7 isolation; the marketplace never executes product code — it only ingests a signed artifact id | ASVS Malicious Code  |
| Artifact ingest                        | Tampering                        | Forge/replace the ZIP after QA                                                                | Immutable version key + checksum/signature verified on ingest; publication references the approved artifact id only                       | ASVS File Integrity  |
| QA/publication state machine           | Elevation                        | Seller self-publishes, bypassing human QA                                                     | Server-enforced: seller may submit-for-review only; approve/publish is admin-only                                                         | ASVS 4.1             |
| Publication transition                 | Repudiation                      | No record of who changed release state                                                        | Append-only admin audit row (acting principal, from→to) — owned by gate `T-4c8a9e`                                                        | ASVS Logging         |
| Seller session                         | Spoofing                         | Customer magic-link session reused for privileged authoring                                   | Same session mechanism; every authoring/publication endpoint re-checks role + ownership server-side                                       | ASVS Session         |
| Profile media upload                   | DoS / SSRF                       | Unbounded upload or server-side fetch of a client-supplied URL                                | Size/type limits; no server-side fetch of client URLs                                                                                     | ASVS File Upload     |
| Seller read view                       | Info disclosure                  | Leaks other sellers' orders/revenue or buyer PII                                              | Reads scoped to own `sellerId`; no buyer PII; sales analytics deferred (§6)                                                               | ASVS Data Protection |

## 9. Reconciliation with spec §6

§6 lists as non-goals: _public sellers, KYC, commissions, payouts, and seller
dashboards._ This design honors all of them — v1 enables **only** first-party
authoring with admin-provisioned roles and **no** monetary relationship, signup,
KYC, payout, or analytics dashboard. The single capability it turns on is
trusted authors submitting products/versions for admin review, which §6 does not
prohibit and which §8 identifies as the schedule bottleneck.

## 10. Handoff to `/scope-breakdown`

Ordered dependency the scope pass will follow: `packages/shared` seller
contracts (SellerProfile read, seller authoring request/response, Artifact/
BuildRun) → Prisma (`Artifact`, `BuildRun`, review sub-state, migration) →
NestJS seller-scoped resources + `seller` guard → `apps/web` authoring surface →
factory→API signed-artifact ingest → tests (Supertest ownership/authorization,
Vitest/RTL authoring forms). Publish/approve/delist and the audit log are
inputs to gate `T-4c8a9e`, not this layer.

## 11. Approval

This document's checkable "done" is user approval, not a passing test suite. On
approval its status flips to **APPROVED**, gate `T-b13e77` is marked done, and
the follow-on `/scope-breakdown` may derive the seller implementation layer.
Payment/commerce and admin remain their own gates.
