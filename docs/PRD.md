# Product Requirements Document

## Problem

Template buyers must currently evaluate products across inconsistent demos,
compatibility claims, licences, documentation, and download experiences. The
platform needs to make discovery and comparison reliable while also producing
a broad inventory at a repeatable quality level.

## Users

- Developers and freelancers buying a starting point for client or internal
  work.
- Agencies comparing reusable templates across platforms and niches.
- Business owners seeking a ready-made site with a clear preview and licence.
- Platform administrators creating, testing, releasing, and supporting the
  catalogue.

Future sellers are represented in the ownership model but have no v1-facing
onboarding or dashboard.

## Goals

- Publish a bilingual catalogue across ten top-level groups with at least eight
  downloadable, QA-approved products per group.
- Let a buyer search, filter, inspect compatibility, view live demos, compare
  Regular/Extended licences, add to cart, exercise a sandbox checkout, and
  access an entitled download from their library.
- Standardise product production through a template factory without reducing
  the inventory to recolours of a shared layout.
- Keep product ownership and authorization boundaries ready for a future
  multi-vendor refinement.
- Make every release traceable through immutable artifacts, checksums, build
  results, changelogs, approvals, and audit logs.

## Non-goals

- Production payment providers and live monetary settlement.
- Seller KYC/onboarding, marketplace commission, payout, or dispute flows.
- Subscription/unlimited-download plans.
- Hosting, Client Workspace, a browser editor, native apps, or offline mode.
- Automated tax, invoice, refund, and chargeback handling.
- More than two locales or currencies in v1.
- DRM that claims to make downloadable source impossible to copy.

## Features

### Discovery and catalogue

- Hallmark Ecosystem Index homepage with editor's picks, newest products,
  category/niche surfaces, and data-backed bestseller surfaces only when real
  sales exist.
- N11 mega-menu for ten groups; mobile accordion drawer.
- URL-backed search, filters, sort, pagination, and state restoration.
- Product cards with decision-critical facts and no fabricated proof.

### Product evaluation

- Localized product detail, media gallery, isolated live preview, demo-page
  list, compatibility/specifications, documentation, changelog, version, and
  verified-purchase reviews.
- Regular/Extended licence comparison and separately managed VND/USD prices.

### Cart, checkout sandbox, and delivery

- Guest cart, licence selection, coupon/referral quote, immutable order-item
  snapshot, and mock/sandbox payment attempts.
- Email-first checkout; successful sandbox completion provisions a customer
  library and permits magic-link account completion.
- Entitlement-checked, short-lived signed download URLs and download audit.

### Admin and template factory

- Category, product, translation, media, demo, price/licence, compatibility,
  build, release, order, entitlement, coupon/referral, review, and audit tools.
- Manifest validation, platform adapter builds, test/visual/accessibility
  checks, security scans, ZIP packaging, checksum/SBOM generation, immutable
  artifact publication, and final-install verification.
- Human visual QA and publish/delist approval.

## Success metrics

V1 readiness is operational rather than fabricated marketing performance:

- Ten groups each contain at least eight publishable products.
- Every published artifact passes its automated and human release gates.
- Marketplace contract, API, component, e2e, accessibility, responsive, and
  performance gates pass.
- The sandbox browse-to-download journey passes in both locales/currencies.
- Production go-live remains false until a real payment provider and signed,
  idempotent webhooks pass production-readiness review.

## Open questions

- Which production providers will handle international cards/PayPal and
  Vietnamese bank transfers?
- Which object-storage, preview-hosting, email, and deployment vendors will be
  selected? The design keeps adapters provider-neutral.
- What exact licence text, support duration, refund policy, and tax obligations
  will legal/operations approve before go-live?
