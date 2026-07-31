# Commerce & Purchase-Surface Design (Gate T-6d0f2c)

**Status: APPROVED — 2026-07-31.** Foundational decisions settled via the
`/refine` brainstorm (§1); threat model from `/threat-model` (§9). This
satisfies the `T-6d0f2c` gate; a follow-on `/scope-breakdown` derives the
ordered commerce layers, and commerce code is written only through that scope
pass — never ahead of it. **Payment production remains an explicit go-live
blocker** (spec §6/§8).

## 1. Goal and locked decisions

Build the deferred customer commerce surface (spec §3/§6/§7) on the proven
Layers 0–5 foundation, with a **sandbox** purchase path that prefigures a real
provider without enabling live payment. Four decisions were made in the
brainstorm and are fixed for this pass:

- **Sandbox payment = two-step mock (pending → confirm).** Checkout creates an
  `Order` + a `pending` `PaymentAttempt`; a **non-production-guarded** server
  endpoint settles it and grants entitlement in one transaction. Production
  swaps only the settle trigger for a signature-verified webhook — the
  order → settled → fulfilment path is built now and reused unchanged.
- **Cart = client-only until checkout.** The cart is a browser-side list of
  `{productId, licence}` (no server `Cart` table, no guest-cart id, no merge).
  The server validates every item against the catalogue and computes all money
  server-side at checkout, so the untrusted client cart carries no authority.
- **Downloads = provider-neutral `StoragePort` + local dev adapter.** A
  `issueDownload(entitlement, product, version) → {url, expiresAt}` port; the
  dev/CI adapter issues an app route HMAC-signed token (short TTL, single-use)
  that streams a local private file; the prod adapter returns an S3/R2 presigned
  URL. Same domain code; provider is a config swap. A parallel `PaymentPort`
  abstracts the (deferred) real payment provider.
- **Sequencing = two waves.** Wave 1 ships the core money path
  (cart → checkout → sandbox settle → order → entitlement → signed download);
  Wave 2 adds engagement (wishlist, coupons/referrals/discount-quotes, verified
  reviews). Wave-1 checkout **reserves a server-validated discount seam** so
  Wave-2 coupons extend it rather than rewrite it.

**Inherited invariants (not re-litigated):** same-origin proxy; `__Host-`
session cookie (`HttpOnly`/`Secure`/`SameSite=Lax`); CSRF on every mutation;
per-IP/per-user rate limiting; every owned row scoped to `session.user.id`;
all money authoritative server-side; `packages/shared` zod contracts on both
sides; NestJS/Fastify/Prisma backend.

## 2. Scope and non-goals

**In scope (designed here):** `Order`/`OrderItemSnapshot`, sandbox
`PaymentAttempt`, `Entitlement` + `account/library`, signed-URL `DownloadEvent`

- audit, `Wishlist`, `Coupon`/`ReferralCode`/`DiscountRedemption` +
  `POST /v1/discount-quotes`, verified-purchase `Review`.

**Non-goals (spec §6, unchanged):** live payment/tax/refund/chargeback; public
sellers/KYC/payouts; subscriptions/unlimited downloads; customer executable
code. Reviews are read-only for others and **moderation/delete is deferred to
the admin gate** (`T-4c8a9e`). The real payment vendor + webhook is a **go-live
blocker**, designed as a boundary here but not enabled.

## 3. Reused from Layers 0–5

Same-origin Next proxy (`app/api/[...proxy]` → server-only `API_ORIGIN`);
`__Host-kitvera_session`; CSRF guard; rate-limit service; server-owned
`Product`/`SellerProfile`; signed cursor pagination; the `EmailDeliveryPort`
null/capture pattern (the non-prod-guarded settle endpoint mirrors it).

## 4. Data model (new Prisma models)

No `Cart` model (client-only). New models, all `userId`-scoped where owned:

- **`Order`** — `id, userId, currency, subtotalMinor, discountMinor,
totalMinor, status(pending|settled|cancelled), idempotencyKey @unique,
createdAt, settledAt?`.
- **`OrderItemSnapshot`** — `id, orderId, productId, version,
licenceIdentifier, titleSnapshot, unitPriceMinor, currency`. **Immutable**:
  captured at checkout, never re-derived from live catalogue.
- **`PaymentAttempt`** — `id, orderId, provider('sandbox'),
status(pending|settled|failed), createdAt, settledAt?`. Status server-owned.
- **`Entitlement`** — `id, userId, productId, version, orderId, createdAt`,
  `@@unique([userId, productId])`. Created **only** inside a settled-order
  transaction.
- **`DownloadEvent`** — `id, entitlementId, userId, productId, version,
issuedAt, sourceIpDigest`. Append-only audit, one row per issued URL.
- **Wave 2:** `WishlistItem(userId, productId, @@unique)`;
  `Coupon(code @unique, kind(percent|fixed), value, currency?, maxRedemptions,
perUserLimit, startsAt?, endsAt?, active)`;
  `ReferralCode(code @unique, ownerUserId, reward…)`;
  `DiscountRedemption(id, couponId?, referralCodeId?, userId, orderId,
redeemedAt, @@unique([couponId, userId]))`;
  `Review(id, userId, productId, rating(1–5), title, body, createdAt,
@@unique([userId, productId]))`.

## 5. API surface (new `/v1` endpoints)

All mutations: session-auth + CSRF + rate-limited; responses are zod DTOs.

**Wave 1**

- `POST /v1/checkout` — body `{ items:[{productId, licence}], idempotencyKey,
discountCode? }`. Validates each item against the published catalogue,
  computes `subtotal/discount/total` **server-side** (discount seam accepts an
  optional server-validated code; no code in Wave 1), creates `Order` +
  `OrderItemSnapshot`s + `pending` `PaymentAttempt`. Idempotent on
  `idempotencyKey`. Returns the order + payment-attempt id.
- `POST /v1/payment-attempts/:id/settle` — **sandbox only, non-production
  guard** (env-gated like the capture-email adapter). Scoped to the order's
  `userId`. Transitions `PaymentAttempt`+`Order` to `settled` and creates the
  `Entitlement`s in one transaction. _(Production: this trigger is replaced by
  a signature-verified `PaymentPort` webhook; the fulfilment code is reused.)_
- `GET /v1/orders`, `GET /v1/orders/:id` — scoped to `userId`; 404 on
  non-owned id. Returns snapshots + status only.
- `GET /v1/account/library` (entitlements) — scoped to `userId`.
- `POST /v1/entitlements/:id/download` — verifies the session user owns the
  entitlement, issues a signed URL via `StoragePort`, records a
  `DownloadEvent`. Returns `{ url, expiresAt }`.
- `GET /v1/downloads/token/:token` — **dev/CI adapter only**: HMAC + TTL +
  single-use, streams the local private file.

**Wave 2**

- `GET/POST/DELETE /v1/wishlist` — scoped to `userId`.
- `POST /v1/discount-quotes` — body `{ items, code }` → server-computed,
  **non-authoritative** quote; the real discount is recomputed atomically at
  checkout.
- Coupon/referral redemption folded into `POST /v1/checkout` (`discountCode`),
  writing a `DiscountRedemption` atomically.
- `GET /v1/products/:id/reviews`; `POST /v1/products/:id/reviews` — requires an
  active entitlement for `(user, product)`; one review per pair.

## 6. Web pages and navigation (`apps/web`)

- **Wave 1:** `/[locale]/cart` (client cart from the store); a checkout
  **dialog** (desktop) / full-screen **sheet** (mobile) following spec §4's
  Global/Vietnam + email + name + continue hierarchy, **clearly labelled
  "Sandbox — no real payment"**; `/[locale]/checkout/result`;
  `/[locale]/account/orders` + `/account/orders/[id]`;
  `/[locale]/account/library` with a Download action.
- **Wave 2:** wishlist (heart toggle on cards + `/[locale]/account/wishlist`);
  a coupon field in checkout; a verified-purchase review form + list on the
  product-detail page.
- All prices/discounts shown are **display-only**; the server response is
  authoritative. Downloads trigger a POST then open the returned short-lived
  URL — never a token in a link/query string.

## 7. Implementation sequencing (feeds `/scope-breakdown`)

- **Wave 1 — Core purchase path:** shared zod contracts (`Order`, checkout
  req/res, entitlement, download) → Prisma models/migration → NestJS resources
  (checkout, sandbox settle, orders, entitlements, `StoragePort` + dev adapter,
  download + audit) → web (cart, checkout dialog/sheet, result, orders,
  library). Ships a working buy-and-download product.
- **Wave 2 — Engagement:** wishlist; coupons/referrals/`discount-quotes` +
  `DiscountRedemption` (extends the Wave-1 discount seam); verified reviews.

## 8. Trust boundaries and data flow

```
[ Web (untrusted, client cart) ] --same-origin /api/v1/*--> [ Next proxy ] --> [ NestJS API ] --Prisma--> [ Postgres ]
                                                                                     |
                                                                +--------------------+--------------------+
                                                                v                                         v
                                                       [ StoragePort ]                          [ PaymentPort ]
                                              (dev: HMAC app route; prod: presigned)   (sandbox settle now; prod webhook = blocker)
```

Two new external boundaries beyond Layers 0–5: **API ↔ object storage**
(signed download URLs) and **API ↔ payment provider** (sandbox now; a
signature-verified webhook is the production boundary shaped but not enabled).
The whole surface obeys: money/discount/entitlement/payment state are computed
and owned server-side; the browser is display-only; every owned row is scoped
to `session.user.id`.

## 9. STRIDE threat model

| Element                        | STRIDE                     | Threat                                                                     | Required mitigation                                                                                                                                         | Standard                   |
| ------------------------------ | -------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Client cart → `POST /checkout` | Tampering                  | Client sends arbitrary items / prices / licence                            | Server validates every `productId`+`licence` against the **published** catalogue and computes all money server-side; reject unknown/delisted/draft products | ASVS 5.1 / Business Logic  |
| `POST /checkout`               | Spoofing                   | Place an order as another user                                             | `order.userId = session.user.id` only, never from the body                                                                                                  | ASVS 4.1                   |
| `POST /checkout`               | Tampering (replay)         | Double-submit creates duplicate orders/charges                             | Idempotency key with a unique constraint so a retry returns the same order                                                                                  | ASVS Business Logic        |
| `OrderItemSnapshot`            | Tampering                  | Later catalogue price/licence edits alter a past order                     | Snapshot price/currency/licence/title/version at purchase; immutable, never re-derived                                                                      | ASVS Integrity             |
| `Order` read                   | Elevation (BOLA/IDOR)      | `GET /orders/:id` for someone else's order                                 | Scope by `userId`; 404 (not 403) on non-owned id                                                                                                            | ASVS 4.1 / 4.2             |
| `Order` detail                 | Information disclosure     | Response leaks payment refs / internal fields                              | zod response DTO whitelist; snapshot + status only                                                                                                          | ASVS 8.x / 14.x            |
| Sandbox settle endpoint        | Elevation                  | Endpoint called in production to mint free entitlements                    | **Non-production env guard** + CSRF + order-owner scope; disabled outside sandbox, mirroring the capture-email adapter                                      | ASVS 4.2 / Business Logic  |
| Sandbox `PaymentAttempt`       | Spoofing                   | Client reports "paid" to unlock for free                                   | Entitlement granted only by the server-side settle transaction; no client-reported success is trusted                                                       | ASVS 4.2                   |
| Future payment webhook         | Spoofing/Replay            | Forged/replayed event grants entitlement (production boundary)             | HMAC signature + timestamp window + unique `eventId` idempotency before any state change; **go-live blocker, not enabled**                                  | ASVS 13.x                  |
| Order → `Entitlement` grant    | Elevation                  | Obtain an entitlement without a settled order                              | Entitlements created only inside the settle transaction; no client-writable entitlement endpoint                                                            | ASVS 4.1                   |
| `Entitlement`/`library` read   | Elevation (BOLA)           | See another user's owned templates                                         | Scope by `userId`                                                                                                                                           | ASVS 4.1                   |
| Download issue                 | Elevation (BOLA/IDOR)      | Download an artifact the user isn't entitled to (tamper productId/version) | Re-verify an active entitlement for the exact `(product, version)` before signing; scope the URL to that object key                                         | ASVS 4.1 / 4.2             |
| Signed download URL            | Information disclosure     | Shared/leaked URL grants open access                                       | Private store, short TTL, single-use, **redact the URL/token from all logs**                                                                                | ASVS 8.x                   |
| `DownloadEvent`                | Repudiation                | No record of who downloaded what                                           | Append-only event (user, product, version, time, ip-digest) per issued URL                                                                                  | ASVS 7.x                   |
| Download                       | DoS                        | Mass/automated re-download drains bandwidth                                | Rate-limit issuance per user/entitlement; short TTL bounds reuse                                                                                            | ASVS 12.x                  |
| `Wishlist`                     | Elevation (BOLA)           | Read/modify another user's wishlist                                        | Scope by `userId`; cap entries; ignore duplicates                                                                                                           | ASVS 4.1 / 13.x            |
| `POST /discount-quotes`        | Tampering                  | Client forces a discount amount                                            | Quote is server-side, **non-authoritative**; discount recomputed + re-validated atomically at checkout                                                      | ASVS 5.1                   |
| Coupon/referral                | Information disclosure     | Response reveals code existence/value (enumeration)                        | Generic response for invalid/ineligible; don't distinguish unknown vs expired; rate-limit attempts                                                          | ASVS 8.x / 4.2             |
| `DiscountRedemption`           | Tampering (double-spend)   | Concurrent/duplicate redemption beats a cap                                | Atomic transaction + unique `(couponId, userId)` + capped counter (row lock / conditional update)                                                           | ASVS Business Logic        |
| Referral                       | Business logic             | Self-referral / reward farming                                             | Reject `referrer == referee`; cap rewards; tie to a settled order                                                                                           | ASVS Business Logic        |
| Coupon brute force             | DoS                        | Automated guessing of valid codes                                          | Per-IP + per-user rate limit on quote/redeem; generic errors                                                                                                | ASVS 12.1                  |
| Verified `Review` write        | Elevation (Business logic) | Review a product never bought                                              | Server checks an active entitlement for `(user, product)`; one review per pair (unique constraint)                                                          | ASVS 4.2                   |
| `Review` write                 | Spoofing                   | Post as another user                                                       | `review.userId = session.user.id` only                                                                                                                      | ASVS 4.1                   |
| `Review` content               | Tampering (stored XSS)     | Malicious markup renders in others' browsers                               | Validate rating range + length server-side; output-encode on render; CSP nonce                                                                              | web-security (XSS/CSP)     |
| All commerce mutations         | Spoofing (CSRF)            | Cross-site request drives checkout/wishlist/review/download                | Existing CSRF token required; `SameSite=Lax` + same-origin proxy keep the cookie first-party                                                                | web-security (CSRF)        |
| Checkout/library flows         | Tampering                  | Browser-side price/ownership checks bypassed via devtools/curl             | Client is display-only; every authorization + money calc re-done server-side                                                                                | web-security (trust model) |
| Download/entitlement tokens    | Information disclosure     | Token leaks via a URL query string / referrer                              | Never place tokens in URLs; POST to issue + open the short-lived signed URL only                                                                            | ASVS 8.x / privacy         |
| New list endpoints             | DoS                        | Unbounded orders/entitlements/reviews queries                              | Cursor pagination, schema limits, indexes on every new list                                                                                                 | ASVS API Security          |

## 10. Provider-neutral decisions (spec §8)

- **Resolved this pass:** sandbox two-step payment; client-only cart;
  `StoragePort` with a local dev adapter (+ `PaymentPort` for the future
  provider); two-wave sequencing.
- **Still open (go-live blockers, not enabled here):** the real **payment
  provider + webhook signing scheme**, and the production **object-storage
  provider** (S3/R2 bucket + presigned config). The boundaries are designed;
  wiring a vendor is a later, explicit decision.

## 11. Testing strategy (this feature's risk areas)

- **Server money authority:** checkout unit tests proving client-sent
  prices/discounts are ignored and totals derive from the catalogue; immutable
  snapshot after a later catalogue price change.
- **Fulfilment:** integration test of `checkout → settle → entitlement →
download` on a seeded disposable Postgres (extends the Layer-5 harness); the
  sandbox settle endpoint is proven **disabled** outside the non-prod env.
- **BOLA/IDOR:** a second user cannot read another's order/entitlement or issue
  a download for an entitlement they don't own (404).
- **Discount atomicity (Wave 2):** concurrent redemptions never exceed the cap;
  `security-review` audits each resulting diff against §9.

## 12. Next steps

1. **User approval of this document** (satisfies the `T-6d0f2c` gate).
2. `/scope-breakdown` derives the Wave-1 commerce layer (shared contracts →
   Prisma → NestJS → web), then Wave 2, each gated by `security-review`.
3. Payment-production and storage-vendor decisions are revisited before go-live.
