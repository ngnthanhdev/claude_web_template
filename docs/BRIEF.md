# Brief

## The idea

A bilingual Vietnamese/English marketplace named **KITVERA** for downloadable website templates,
similar in breadth to ThemeForest but with its own product and visual identity.
The platform sells templates created and owned by the platform in v1 while
keeping the ownership model ready for a future multi-vendor marketplace.

## Who it is for

Developers, freelancers, agencies, and business owners in Vietnam and abroad
who need to discover, compare, preview, license, and download production-ready
website templates.

## Why it matters

Buyers need a trustworthy catalogue with clear compatibility, live demos,
version history, documentation, and predictable licensing. The product also
needs a repeatable way to produce and quality-check a large, diverse inventory
rather than publishing superficial recolours of one design.

## Rough scope

- Ten top-level catalogue groups: WordPress, Elementor, HTML, Shopify,
  Jamstack, Marketing, CMS, eCommerce, UI Templates, and Plugins.
- At least eight downloadable products per group (80 products minimum).
- Multiple pages/demos per product, with Regular and Extended licences.
- Public storefront, product discovery, live previews, cart/checkout sandbox,
  customer library, admin console, and a controlled template factory.
- Vietnamese/English locale routes and separately managed VND/USD prices.
- Next.js App Router web app backed by the template's locked NestJS/Fastify,
  Prisma/PostgreSQL, and shared-Zod-contract stack.

## Explicit non-goals for v1

- Production payment integration, automated tax/invoicing, refunds, or
  chargebacks.
- Public seller onboarding, KYC, commissions, payouts, or seller dashboards.
- Subscriptions, unlimited downloads, hosting, Client Workspace, a browser
  website builder, native apps, or offline mode.
- Languages other than Vietnamese/English or currencies other than VND/USD.

## Constraints

- KITVERA uses the approved browser-frame/modular-block `K` identity and Coral
  modern-minimal palette documented in `docs/brand/README.md`.
- Payment-provider integration is deferred and blocks production go-live.
- Every product must pass platform-specific build, install, accessibility,
  visual, security, packaging, and documentation gates.
- Template sources live in private per-product repositories; immutable release
  artifacts and isolated live previews are referenced by the marketplace.
- No invented sales counts, ratings, testimonials, scarcity, or compatibility
  claims.
