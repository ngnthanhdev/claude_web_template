# Architecture

## System overview

```text
Browser (untrusted)
  -> Next.js App Router storefront / account / admin
  -> NestJS API on Fastify (/v1)
  -> PostgreSQL through Prisma
  -> private object storage (immutable template artifacts)
  -> isolated preview origins
  -> external email and deferred payment adapters

Private product repositories
  -> isolated template-factory runners
  -> build / test / scan / package / final-install verification
  -> admin approval
  -> immutable artifact + preview publication
```

## Components

### `apps/web`

- Next.js App Router, Tailwind CSS, owned shadcn/ui source, and Hallmark
  semantic tokens.
- Locale-prefixed public, customer, and admin routes using `next-intl`.
- TanStack Query over a typed client that validates every API response against
  `packages/shared` Zod contracts.
- Public storefront uses a Hallmark modern-minimal, product-led system:
  Ecosystem Index home, Catalogue collections, N11 mega-menu, quiet
  mast-headed footer, and restrained state/continuity motion only.
- Live previews are external isolated origins and never share auth cookies.

### `apps/api`

NestJS modules: auth, users, sellers, categories, products, releases, search,
pricing/licences, carts, orders, payment attempts, entitlements/downloads,
discounts/referrals, reviews, admin audit, build orchestration, webhooks, and
health.

Every endpoint is URI-versioned under `/v1`, validates a shared schema, returns
the standard error envelope, and uses cursor pagination for growing
collections. Authorization is enforced server-side; the web client is never a
security boundary.

### `packages/shared`

Canonical Zod schemas and inferred types for identity, pagination/errors,
catalogue, product detail, release/artifact metadata, prices/licences, cart,
orders/payment attempts, entitlements/downloads, discounts/referrals, reviews,
admin actions, and template manifests.

### `packages/template-factory`

A platform-adapter pipeline that validates manifests, runs isolated builds and
tests, captures previews, runs accessibility/visual/security checks, produces a
clean ZIP, checksum and SBOM, installs from the final ZIP, and submits a draft
release for human approval. Product source is not stored in the marketplace
monorepo.

## Data model

- Identity: `User`, `Session`, `MagicLinkToken`, `Role`.
- Ownership: `SellerProfile` and `Product.sellerId` (one platform seller in
  v1).
- Catalogue: hierarchical `Category`, `Product`, `ProductTranslation`, `Tag`,
  `Compatibility`, `Media`, and `Demo`.
- Release: `ProductVersion`, `Artifact`, `BuildRun`, changelog, checksums, QA
  and publish states.
- Commerce: `LicenseOption`, `Price`, `Cart`, `CartItem`, `Order`, immutable
  `OrderItemSnapshot`, and `PaymentAttempt`.
- Delivery: `Entitlement` and `DownloadEvent`.
- Growth/trust: `Coupon`, `ReferralCode`, `DiscountRedemption`, `Wishlist`,
  and verified-purchase `Review`.
- Operations: `AdminAuditLog` and moderation/delist state.

Money uses integer minor units plus ISO currency. Licence terms, product data,
price, discounts, and currency are snapshotted into order items. Multi-write
order, redemption, and entitlement operations are transactional and accept an
idempotency key.

## Data flow

### Discovery

Locale route -> server-rendered catalogue request -> API filter validation ->
indexed PostgreSQL full-text/trigram query -> cursor envelope -> response Zod
validation -> product surfaces. Filter state remains encoded in the URL.

### Sandbox purchase and delivery

Cart -> server price/licence/discount calculation -> transactional order and
snapshot -> mock payment attempt -> entitlement -> library -> entitlement
check -> short-lived signed object-storage URL -> download audit.

### Template release

Private product repository -> ephemeral isolated runner -> platform build/test
adapter -> screenshots/accessibility/security/package gates -> final ZIP
install test -> immutable upload -> draft release -> admin approval -> publish.

## Key architectural decisions

- Marketplace platform and product-source repositories are separated.
- Object storage keys are immutable per product/version/artifact checksum.
- Preview sites use separate origins and no shared cookies.
- PostgreSQL search is sufficient for the initial catalogue; an external
  search service is deferred until measured need.
- Payments use a provider adapter but only mock/sandbox implementations are in
  current scope.
- VND and USD prices are explicitly authored, not calculated from a live FX
  rate.
- Locale and currency are independent user choices.
- Hallmark memory/tokens are isolated per product, while marketplace surfaces
  share the locked KITVERA brand system in `docs/brand/README.md`.

## Known risks

- Producing and maintaining at least 80 multi-page products across many
  platforms is the dominant schedule and compatibility risk.
- Preview code and build input are untrusted even when currently admin-owned;
  runners and origins must remain isolated before future sellers are enabled.
- Storage bandwidth and unauthorized link sharing require signed URLs, rate
  limits, entitlement checks, and audit data.
- Third-party assets, fonts, dependencies, platform marks, licence language,
  support commitments, privacy, and tax obligations require operational/legal
  approval.
- Production go-live is blocked until live payment, failure recovery, refund,
  and webhook verification are designed and tested.
