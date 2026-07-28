# Code review — T-3fa9d0 compose & verify public catalogue and auth (commit e0e9328)

Scope: apps/api/src/{app.module.ts, auth/auth.module.ts, main.ts},
apps/api/test/public-resources.integration.test.ts.

## Verdict
No correctness or security defects found. Module composition, bootstrap
ordering, and the integration assertions are sound. Only minor DRY /
simplification nits, none blocking.

## What I verified
- AuthModule aggregation is acyclic and instance-safe: AuthModule imports
  {AuthCoreModule, MagicLinksModule, SessionsModule}; both feature modules
  also import AuthCoreModule, which Nest de-duplicates by class → one
  AuthCryptoService / AuthSessionService / AuthRateLimitService instance. No
  circular import, no double-instantiated provider. The module doc comment is
  accurate.
- The `await app.register(cookie)` addition in main.ts is load-bearing:
  SessionAuthGuard reads `request.cookies[SESSION_COOKIE_NAME]` and
  auth-cookie.ts calls `reply.setCookie`/`clearCookie` — both decorated by
  @fastify/cookie. Without registration those paths would throw/500 at
  runtime. Registered before `listen`, so it applies to all routes.
- Bootstrap ordering matches the pre-existing pattern (versioning → Zod pipe →
  exception filter → CORS → cookie → helmet → shutdown hooks). Plugin
  registration order relative to Nest globals is immaterial for these plugins.
- The test mirrors that bootstrap and its assertions are meaningful, not
  tautological: schema `.parse()` on every body, cookie flag regexes
  (__Host- / HttpOnly / Secure / Path=/), body-does-not-contain-raw-token and
  -tokenHash/-csrfHash leakage checks, 403 CSRF_INVALID on missing header, 204
  on valid CSRF, 401 after revoke, fixed 401 on unknown token, 422 envelope on
  malformed query. The user-wide-logout test creates an independent second
  session via `sessions.createSession(userId)` (real overridden PrismaClient,
  committed) and proves BOTH tokens 401 — genuinely exercises revoke-all, not
  idle expiry.
- No cross-test leakage: each test uses a distinct email
  (buyer@ / multi@ / composed-owner@), so the accumulate-only DB (beforeEach
  resets only the email capture) cannot collide.

## Findings (all low, advisory)

1. LOW — simplification / drift risk
   apps/api/src/main.ts:27-38 vs apps/api/test/public-resources.integration.test.ts:~ (app setup block).
   The bootstrap wiring (enableVersioning + ZodValidationPipe +
   ApiExceptionFilter + cookie) is hand-duplicated between main.ts and this
   test — and, per grep, 8 other test files replicate the same fragment. If a
   future global guard/interceptor is added to main.ts, tests keep passing
   against a stale config → false confidence. Suggest extracting a shared
   `configureApp(app)` helper consumed by main.ts and the test setups.
   Verdict: CONFIRMED (project-wide pre-existing pattern, not introduced by
   this commit alone — worth a follow-up, not a blocker).

2. LOW — redundant parse
   public-resources.integration.test.ts, user-wide-logout test parses
   `redeem.text` through `magicLinkRedemptionResponseSchema.parse` three
   times (csrfToken, userId, plus the earlier body). Parse once into a
   `redeemBody` and read both fields. Verdict: CONFIRMED cosmetic.

3. INFO — misplaced, not wrong
   The "fails closed when a required signing secret is absent" case is a pure
   `validateEnv` unit assertion living in an integration file; it never
   touches the composed app. Harmless but arguably belongs with the env unit
   tests. Verdict: CONFIRMED non-issue.

4. INFO — harmless redundancy
   AuthModule lists AuthCoreModule in `imports` though it consumes none of its
   exports directly (the two feature modules already import it, and
   `app.get(AuthSessionService)` resolves globally regardless). Deduped by
   Nest, and the doc comment justifies it. No change needed.

## Not flagged (checked, fine)
- No duplicate provider causing multiple instances (AUTH_CLOCK re-provided in
  SessionsModule is the same `systemAuthClock` value; pre-existing).
- Overriding PrismaService with a raw PrismaClient is a standard test seam;
  the test manages connect/disconnect itself.
- 422 test genuinely requires `locale` to be mandatory (would return 200 and
  fail otherwise) — meaningful.
