# Commerce & Purchase-Surface Design (Gate T-6d0f2c)

**Status: DRAFT — threat model only. NOT yet an approved design.**
This document currently holds the `/threat-model commerce` output (§4 below).
The product design — cart persistence model, checkout flow, the sandbox
payment approach, and the §5 provider decisions — still needs a `/refine`
brainstorm (approaches + a recommendation, one question at a time) and
explicit user approval before this gate (`T-6d0f2c`) is complete and a
follow-on `/scope-breakdown` pass may layer it. No commerce code, Prisma
model, shared contract, or endpoint is written until then; **payment
production remains an explicit go-live blocker** (spec §6/§8).

## 1. Scope

The deferred customer commerce surface from `tasks/layer-6-todo.md` (`T-6d0f2c`)
and spec §3/§6/§7: `Cart`/`CartItem`; checkout (desktop dialog / mobile sheet,
clearly-labelled **sandbox**); mock `PaymentAttempt`; `Order`/
`OrderItemSnapshot`; `Entitlement` + `account/library`; signed-URL
`DownloadEvent` + download audit; `Wishlist`; `Coupon`/`ReferralCode`/
`DiscountRedemption` + `POST /v1/discount-quotes`; and verified-purchase
`Review` (sequences after purchase, since it depends on entitlement data).

**Out of scope / go-live blockers (spec §6):** live payment, tax/invoice,
refund, chargeback; subscriptions/unlimited downloads. The sandbox path grants
entitlement by a _server-side_ state transition only and calls no real vendor.

## 2. What already exists (reused, not re-litigated)

From Layers 0–5 (`CHECKPOINT.md`): the same-origin Next.js proxy
(`app/api/[...proxy]` → server-only `API_ORIGIN`), the first-party
`__Host-kitvera_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`), CSRF
enforcement on mutating endpoints, per-IP/per-email rate limiting,
server-controlled `Product.sellerId`/ownership, and signed cursor pagination.
The commerce surface inherits all of these — every new mutating endpoint is
CSRF-guarded, session-authenticated, and rate-limited by the existing patterns.

## 3. Trust boundaries & data flow

```
[ Web (untrusted) ] --same-origin /api/v1/*--> [ Next proxy ] --> [ NestJS API ] --Prisma--> [ Postgres ]
                                                                        |
                                                          +-------------+-------------+
                                                          v                           v
                                                 [ Object storage ]        [ Payment provider ]
                                                 (private bucket,           (SANDBOX now; prod
                                                  signed download URLs)      webhook = blocker)
```

Two new external boundaries beyond Layers 0–5: **API ↔ object storage**
(artifact downloads via short-TTL signed URLs) and **API ↔ payment provider**
(sandbox now; a signature-verified webhook is the production boundary this
design must pre-shape). The authoritative rule for the whole surface: **price,
licence, discount, entitlement, and payment state are computed and owned
server-side; the browser is display-only.** Every cart/order/entitlement/
download/wishlist/review row is scoped to `authenticatedUser.id` from the
session — never a client-supplied owner/id.

## 4. STRIDE threat model

| Element                              | STRIDE                     | Threat                                                                                      | Required mitigation                                                                                                                                                                     | Standard                        |
| ------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `Cart`/`CartItem` write              | Tampering                  | Client sends `price`/`licence`/`discount` in the cart body                                  | Server ignores any client money/licence field; cart stores only `{productId, licenceIdentifier}`, all pricing derived from the catalogue at read/checkout time                          | ASVS 5.1 / Business Logic       |
| `Cart` read/write                    | Elevation (BOLA)           | Read or mutate another user's cart                                                          | Scope every cart query by `userId = session.user.id`; no client `cartId` as owner key                                                                                                   | ASVS 4.1                        |
| `Cart`                               | DoS                        | Unbounded items/quantity inflate the cart                                                   | Cap distinct items; digital licence quantity fixed at 1 per (product, licence); reject duplicates                                                                                       | ASVS 12.1 / 13.x                |
| Guest cart (if allowed)              | Spoofing                   | Guessable guest-cart id hijacked                                                            | If guest carts exist, bind to an unguessable id in the `__Host-` session, migrate to the user on sign-in; else require auth to add to cart                                              | ASVS 3.x (session)              |
| `POST /checkout`                     | Tampering                  | Client-supplied total/currency/licence trusted                                              | Recompute the order total server-side from catalogue price × licence × server-validated discount at checkout time; reject client amounts                                                | ASVS 5.1 / Business Logic       |
| `POST /checkout`                     | Spoofing                   | Place an order as another user                                                              | `order.userId = session.user.id` only; never from the body                                                                                                                              | ASVS 4.1                        |
| `POST /checkout`                     | Tampering (replay)         | Double-submit creates duplicate orders/charges                                              | Idempotency key per checkout; unique constraint so a retry returns the same order                                                                                                       | ASVS Business Logic             |
| `OrderItemSnapshot`                  | Tampering                  | Later catalogue price/licence edits alter a past order                                      | Snapshot price, currency, licence, title, version at purchase; snapshots immutable, never re-derived from live catalogue                                                                | ASVS Business Logic / Integrity |
| `Order` read                         | Elevation (BOLA/IDOR)      | `GET /orders/:id` for someone else's order                                                  | Scope by `userId`; return 404 (not 403) on non-owned id to avoid existence disclosure                                                                                                   | ASVS 4.1 / 4.2                  |
| `Order` detail                       | Information disclosure     | Response leaks payment refs / internal fields                                               | DTO whitelist (zod response schema); expose only snapshot + status                                                                                                                      | ASVS 8.x / 14.x                 |
| Sandbox `PaymentAttempt`             | Spoofing                   | Client reports "paid" to unlock entitlement for free                                        | Entitlement is granted ONLY by a server-side order→fulfilment transaction; the sandbox auto-settles server-side and is clearly labelled; no client-driven "success" callback is trusted | ASVS 4.2 / Business Logic       |
| Sandbox `PaymentAttempt`             | Tampering                  | Client flips `PaymentAttempt.status`                                                        | Status is server-owned; the mutation endpoint never accepts a client status                                                                                                             | ASVS Business Logic             |
| Future payment webhook               | Spoofing/Replay            | Forged/replayed event grants entitlement (production boundary)                              | HMAC signature verify + timestamp window + unique `eventId` idempotency before any state change; **production only, go-live blocker** — design the boundary now, do not enable it       | ASVS 13.x (API/webhook)         |
| Order → `Entitlement` grant          | Elevation                  | Obtain an entitlement without a paid order                                                  | Entitlements created only inside the fulfilment transaction of a settled order; no client-writable entitlement endpoint                                                                 | ASVS 4.1 / Business Logic       |
| `Entitlement`/`account/library` read | Elevation (BOLA)           | List/see another user's owned templates                                                     | Scope by `userId`; library query filters entitlements to the session user                                                                                                               | ASVS 4.1                        |
| Signed download URL issue            | Elevation (BOLA/IDOR)      | Download an artifact the user isn't entitled to (tamper productId/versionId in the request) | Re-verify the session user owns an active entitlement for the exact requested (product, version) before signing; scope the URL to that object key                                       | ASVS 4.1 / 4.2                  |
| Signed download URL                  | Information disclosure     | Shared/leaked URL grants open access                                                        | Private bucket, short TTL, single-use where possible, and **redact the signed URL/token from all logs**                                                                                 | ASVS 8.x / Data Protection      |
| `DownloadEvent`                      | Repudiation                | No record of who downloaded what                                                            | Append-only `DownloadEvent` (user, product, version, time, ip-digest) per issued URL, for audit and abuse detection                                                                     | ASVS 7.x (logging)              |
| Download                             | DoS                        | Mass/automated re-download drains storage/bandwidth                                         | Rate-limit issuance per user/entitlement; short TTL bounds reuse                                                                                                                        | ASVS 12.x / 13.x                |
| `Wishlist`                           | Elevation (BOLA)           | Read/modify another user's wishlist                                                         | Scope by `userId`; no client owner id                                                                                                                                                   | ASVS 4.1                        |
| `Wishlist`                           | DoS                        | Unbounded wishlist entries                                                                  | Cap entries; ignore duplicates                                                                                                                                                          | ASVS 13.x                       |
| `POST /v1/discount-quotes`           | Tampering                  | Client computes/forces a discount amount                                                    | Quote is a **server-side, non-authoritative** calculation; the real discount is recomputed and re-validated atomically at checkout                                                      | ASVS 5.1 / Business Logic       |
| Coupon/referral                      | Information disclosure     | Response reveals whether a code exists / its value (enumeration)                            | Generic quote response for invalid/ineligible codes; do not distinguish "unknown" vs "expired"; rate-limit attempts                                                                     | ASVS 8.x / 4.2                  |
| `DiscountRedemption`                 | Tampering (double-spend)   | Concurrent/duplicate redemption beats a per-user or global cap                              | Atomic transaction with a unique `(userId, couponId)` constraint and a capped counter (row lock / conditional update); reject over-cap                                                  | ASVS Business Logic             |
| Referral                             | Business logic             | Self-referral or reward farming                                                             | Reject `referrer == referee`; cap referral rewards; tie to a settled order                                                                                                              | ASVS Business Logic             |
| Coupon brute force                   | DoS                        | Automated guessing of valid codes                                                           | Per-IP + per-user rate limit on quote/redeem; generic errors                                                                                                                            | ASVS 12.1                       |
| Verified `Review` write              | Elevation (Business logic) | Review a product the user never bought                                                      | Server checks an active entitlement for (user, product) before accepting; one review per (user, product) via unique constraint                                                          | ASVS 4.2 / Business Logic       |
| `Review` write                       | Spoofing                   | Post a review as another user                                                               | `review.userId = session.user.id` only                                                                                                                                                  | ASVS 4.1                        |
| `Review` content                     | Tampering (stored XSS)     | Malicious markup in review body/title renders in other users' browsers                      | Validate rating range + length server-side; output-encode on render; CSP nonce (existing web-security posture)                                                                          | web-security (XSS/CSP)          |
| `Review`                             | Repudiation                | Silent edit/delete of a review                                                              | Record author + timestamps; moderation/delete is an admin action (deferred to the admin gate `T-4c8a9e`) with its own audit                                                             | ASVS 7.x                        |
| All commerce web pages               | Spoofing (CSRF)            | Cross-site request drives checkout/cart/wishlist/review/download                            | Cookie-auth mutations require the existing CSRF token; `SameSite=Lax` + same-origin proxy keep the cookie first-party                                                                   | web-security (CSRF)             |
| All commerce web pages               | Tampering                  | Browser-side price/discount/ownership "checks" bypassed via devtools/curl                   | Client UI is display-only; every authorization + money calc re-done server-side (this table's server rows are the real gate)                                                            | web-security (trust model)      |
| Checkout/library URLs                | Information disclosure     | Entitlement/download token leaks via a URL query string / referrer                          | Never place entitlement or download tokens in URLs; issue via POST + short-lived signed object URL only                                                                                 | ASVS 8.x / privacy              |
| Catalogue browse under load          | DoS                        | New commerce filters add unbounded/expensive queries                                        | Keep cursor pagination, schema limits, and indexes on every new list (orders, entitlements, reviews)                                                                                    | ASVS API Security               |

## 5. Open decisions (feed the `/refine` brainstorm — provider-neutral per spec §8)

- **Payment provider + webhook signing** (sandbox now; production is the
  go-live blocker). The webhook boundary above must be designed before any
  real provider is wired.
- **Entitlement/artifact storage** — private bucket + signed-URL mechanism
  (TTL, single-use, key scheme).
- **Cart persistence** — authenticated-only vs guest cart migrated on sign-in.
- **Review moderation ownership** — sits behind the admin gate (`T-4c8a9e`).

## 6. Next steps to close the gate

1. `/refine` brainstorm: cart model, checkout UX, sandbox-payment approach, and
   the §5 provider decisions — approaches + a recommendation, one question at a
   time; fold the choices into §5 and a new design section here.
2. User marks this document **approved**.
3. A follow-on `/scope-breakdown` derives the ordered commerce layer (shared
   zod contracts → Prisma models/migrations → NestJS resources → web screens),
   with `security-review` auditing each resulting diff against §4 above.
