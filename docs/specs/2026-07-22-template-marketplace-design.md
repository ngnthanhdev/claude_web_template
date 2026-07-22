# KITVERA Template Marketplace Design

**Date:** 2026-07-22
**Status:** Approved by user on 2026-07-22
**Approach:** Controlled template factory with a platform-owned v1 catalogue
and future multi-vendor boundaries

## 1. Goal and locked decisions

Build a bilingual Vietnamese/English marketplace for developers, freelancers,
agencies, and business owners to discover, preview, license, and download web
templates. V1 inventory is owned and published by the platform, while every
product has an explicit seller owner so a later refinement can add sellers
without rewriting catalogue authorization.

Locked decisions:

- Product and marketplace brand name: **KITVERA**.
- Approved identity: a browser-frame `K` with modular web-layout blocks, using
  the Coral modern-minimal palette documented in `docs/brand/README.md`.
- Ten catalogue groups: WordPress, Elementor, HTML, Shopify, Jamstack,
  Marketing, CMS, eCommerce, UI Templates, and Plugins.
- At least eight downloadable products per group (80 minimum), each with
  multiple pages/demos and Regular/Extended licences.
- The project creates both the marketplace and all template inventory.
- A controlled template factory standardises manifests, builds, QA,
  documentation, packaging, and release, but Hallmark structure/theme/content
  fingerprints vary per product; recolours of one layout do not qualify.
- Customer checkout begins with email and provisions a library/account after
  successful completion.
- Vietnamese/English routes and explicit VND/USD prices.
- Next.js App Router + Tailwind CSS + owned shadcn/ui components + Hallmark
  tokens. The locked API/shared/monorepo stack remains unchanged.
- Payment-provider integration is deferred. Mock/sandbox payment attempts are
  included; production go-live is blocked.

Hallmark composition:

`Surface: marketplace/catalogue · category: technology/digital goods · model:
platform-owned v1, multi-vendor-ready · decision: discovery + compatibility ·
platform: Next.js · conversion: discovery primary, direct commerce on product
detail · proof: live demos + specs + verified reviews · direction:
modern-minimal dense marketplace`

- Home macrostructure: **Ecosystem Index**.
- Collection macrostructure: **Catalogue**.
- Navigation: **N11 Mega-menu**, 3-column grouped payload, no invented promo
  proof, dim/blur scrim; accordion drawer on mobile.
- Brand theme: **KITVERA Coral modern-minimal**, light neutral paper and
  restrained accent so product imagery owns the catalogue. The approved logo
  concept and usage constraints live in `docs/brand/README.md`.
- Default-reflex result: reject a centred gradient hero, three generic feature
  cards, and a pixel copy of ThemeForest's horizontal menu. Product taxonomy,
  search, comparison, and honest inventory state determine the structure.

## 2. Repository and product structure

The marketplace monorepo contains `apps/web`, `apps/api`, `packages/shared`,
`packages/template-factory`, and version-controlled catalogue manifests. It
does not contain heavy product sources or release ZIPs.

Each template lives in a private repository with source, tests,
`template.manifest.json`, documentation, and preview fixtures. The factory
publishes versioned immutable ZIPs, checksums, screenshots, and live previews.
The marketplace stores their metadata and artifact identifiers.

Public storefront and authenticated customer/admin shells share brand tokens
but differ by job: storefront prioritises discovery; library prioritises
entitlements; admin prioritises dense operate/review/publish workflows.

## 3. Data model and API surface

PostgreSQL is the source of truth through Prisma. Core models:

- `User`, `Session`, `MagicLinkToken`, `Role`, `SellerProfile`.
- Hierarchical `Category`, `Product`, `ProductTranslation`, `Tag`,
  `Compatibility`, `Media`, `Demo`.
- `ProductVersion`, `Artifact`, `BuildRun`, QA and publication states.
- `LicenseOption`, `Price`, `Cart`, `CartItem`, `Order`,
  `OrderItemSnapshot`, `PaymentAttempt`.
- `Entitlement`, `DownloadEvent`, `Coupon`, `ReferralCode`,
  `DiscountRedemption`, `Wishlist`, verified-purchase `Review`, and
  `AdminAuditLog`.

Money is integer minor units + currency. Order items snapshot product,
licence, terms version, price, discount, and currency. Related order,
redemption, payment-attempt, and entitlement writes are transactional and
idempotent.

API conventions: `/v1`, plural kebab-case resources, one nesting level,
cursor pagination, single resources returned directly, collections in
`{data, meta}`, and errors in `{error:{code,message,details?}}`. All wire
shapes originate in shared Zod schemas.

Key resources:

- `GET /v1/categories`
- `GET /v1/products` and `GET /v1/products/:slug`
- `GET /v1/products/:id/reviews`, `POST /v1/reviews`
- `POST /v1/carts`, `POST /v1/carts/:id/items`,
  `PATCH /v1/cart-items/:id`
- `POST /v1/orders`, `GET /v1/orders/:id`
- `POST /v1/orders/:id/payment-attempts` (mock/sandbox)
- `GET /v1/entitlements`, `POST /v1/entitlements/:id/downloads`
- `POST /v1/auth/magic-links`, `POST /v1/discount-quotes`
- Admin resources for catalogue, releases/builds, orders, entitlements,
  discounts, reviews, and audit, with guarded publish/delist/approve actions.

Initial search uses indexed PostgreSQL full-text/trigram queries. An external
search service is deferred until catalogue/query measurements justify it.

## 4. Web pages, navigation, and interactions

Locale-prefixed routes:

- `/[locale]`
- `/[locale]/categories/[...slug]`
- `/[locale]/templates/[slug]`
- `/[locale]/search`, `/wishlist`, `/cart`, `/checkout`, `/checkout/result`
- `/[locale]/account/library`, `/account/orders/[id]`, `/account/profile`
- `/[locale]/admin/*`

`/` negotiates locale from stored choice and `Accept-Language`. Locale and
currency toggles are independent. All message catalogues have identical keys.

Homepage discovery surfaces include editor's picks, newest, by category and by
niche. Bestseller/sales/review surfaces remain hidden until real data exists.
Collection state is URL-backed and restored on back navigation. Product detail
shows live demos, demo pages, compatibility/specs, documentation, changelog,
licence comparison, price, purchase action, and verified reviews.

Checkout follows the supplied information hierarchy (Global/Vietnam choice,
email, name, coupon, referral, continue action) but uses project tokens rather
than copying pixels. It is a dialog on desktop and full-screen sheet on mobile,
clearly labelled sandbox until production payments exist.

Mobile prioritises search, filters, price/licence, cart, and checkout. Targets
are at least 44px, zoom remains enabled, media reserves aspect ratio, and no
page-level horizontal overflow is allowed.

Motion is limited to state and continuity: mega-menu, drawer, filter state, and
checkout transitions at 200-300ms. Dense product rails do not animate on
scroll. Reduced Motion uses instant changes or a short fade.

## 5. Testing and release gates

Marketplace:

- Shared-contract tests; API unit coverage of at least 80% on logic classes.
- Fastify/Supertest integration tests with a disposable PostgreSQL database.
- Vitest/Testing Library components and Playwright browse-to-download/admin
  flows in `vi`/`en`, VND/USD, and representative viewports from 320-1440px.
- Axe WCAG 2.2 AA, keyboard navigation, visual regression, zero horizontal
  overflow, LCP <=2.5s, INP <=200ms, and CLS <=0.1.

Each template product:

1. Validate manifest, compatibility, licence, version, and demos.
2. Run its platform adapter build/install tests.
3. Run cross-viewport Playwright, visual snapshots, and axe on every demo.
4. Review Hallmark fingerprint and content honesty.
5. Scan secrets, dependencies, malware, and licences.
6. Produce a clean ZIP with no environment files, credentials, caches, or
   dependency directories.
7. Generate checksum, SBOM, changelog, and documentation.
8. Install/test from the final ZIP itself.
9. Publish immutable artifact only after human visual approval.

A category is v1-complete only when eight products pass. Content readiness is
ten complete categories. Production readiness additionally requires live
payment and webhook gates.

## 6. Non-goals

- Live payment, tax/invoice, refund, and chargeback automation.
- Public sellers, KYC, commissions, payouts, and seller dashboards.
- Subscription/unlimited downloads.
- Hosting, Client Workspace, browser site builder, native apps, offline mode.
- Additional locales/currencies.
- Customer-submitted executable code.
- Absolute DRM or indefinite compatibility commitments.

## 7. Security threat model

| Element | STRIDE | Threat | Required mitigation | Standard |
|---|---|---|---|---|
| Magic link/session | Spoofing | Token theft/replay | Hashed one-time token, short TTL, session rotation, rate limit | ASVS Authentication/Session |
| Cart/order | Tampering | Client changes price/licence/discount | Server calculation and immutable snapshot | ASVS Business Logic |
| Order/download | Elevation/BOLA | Access another user's purchase | Server-scoped ownership + entitlement query; no client owner ID | ASVS Access Control |
| Signed URL | Disclosure | Shared/leaked download URL | Private bucket, short TTL, redacted logs, download audit | ASVS Data Protection |
| Artifact | Tampering | Replace ZIP after QA | Immutable version key, checksum/signature, approval record | ASVS File Integrity |
| Build runner | DoS/Elevation | Malicious build exhausts runner or steals credentials | Ephemeral isolation, resource limits, least-privilege credentials | ASVS Malicious Code |
| Preview origin | Disclosure/Elevation | Demo script reaches storefront session | Separate origin, no shared cookies, CSP/sandbox/network controls | ASVS Web Security |
| Admin API | Elevation | Non-admin publishes/delists/grants access | Server RBAC, production MFA, audit log | ASVS Access Control |
| Coupon/referral | Tampering/DoS | Duplicate/brute-force redemption | Atomic caps, unique redemption, rate limit | ASVS Business Logic |
| Future webhook | Spoofing/Replay | Forged event grants entitlement | Signature/HMAC, timestamp, unique event and idempotency | ASVS API Security |
| Search | DoS | Unbounded expensive query | Schema limits, cursor pagination, indexes, rate limit | ASVS API Security |
| Publication | Repudiation | Unknown actor changes release state | Append-only admin audit record | ASVS Logging |

Future seller features require a new refinement and threat model before any
seller-facing endpoint is enabled.

## 8. Risks and open decisions

- Inventory production/compatibility is the dominant schedule risk.
- Third-party asset/font/dependency licences, product licence text, support
  terms, refund policy, privacy, and tax need operational/legal approval.
- Storage, preview hosting, email, deployment, and payment vendors remain
  provider-neutral decisions.
- Payment production integration is an explicit go-live blocker.
