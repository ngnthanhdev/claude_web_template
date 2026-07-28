# Security review — compose public catalogue and auth resources (T-3fa9d0)

Commit: e0e9328 `feat(api): compose and verify public catalogue and auth resources`
Branch: codex/layer-4-api
Scope: apps/api/src/app.module.ts, apps/api/src/auth/auth.module.ts, apps/api/src/main.ts, apps/api/test/public-resources.integration.test.ts

## Verdict

No high-confidence findings. The commit is a pure composition/aggregation change plus
a test-only integration suite. It introduces no new route, DTO, service method, or
sink, and it does not weaken the auth/session posture established by the modules it
wires together. Low-confidence/speculative concerns were filtered out.

## What was traced

- **Module aggregation (auth.module.ts, app.module.ts).** AuthModule only re-imports
  the existing AuthCoreModule + MagicLinksModule + SessionsModule; AppModule registers
  CatalogueModule + AuthModule. No controller/provider/route is added or altered, so
  there is no new attacker-input -> sink path. BOLA/IDOR and mass-assignment are not in
  play (no new lookup or DTO).
- **Cookie registration (main.ts:37).** `@fastify/cookie` is registered without a
  signing secret. Verified this is correct: the session cookie carries an opaque random
  bearer that is hashed and validated server-side (session-auth.guard.ts:35,49-61 reads
  raw `request.cookies[...]`; no `unsignCookie`/`signCookie` is used anywhere). No
  reliance on cookie signing, so the missing secret is not a weakness.
- **Cookie flags unchanged (auth-cookie.ts).** `__Host-kitvera_session`, httpOnly,
  secure, path=/, sameSite=lax — the integration test asserts each flag and that the raw
  bearer never appears in any response body. Composition does not touch these.
- **CSRF still enforced (session-csrf.guard.ts).** Mutating session routes require the
  `x-csrf-token` header verified against the stored hash; the suite proves absent header
  -> 403 CSRF_INVALID on DELETE. Unchanged by this commit.
- **CORS (main.ts:33-36 + config/env.ts).** Credentialed CORS uses an explicit,
  env-validated URL allowlist (`CORS_ORIGIN` superRefined to reject non-URL entries).
  No reflect-any-origin. Unchanged.
- **trustProxy OFF preserved (main.ts:17-20).** FastifyAdapter is constructed with only
  `{ logger: true }`; no `trustProxy` option is passed, so the default (off) stands. The
  bootstrap does not re-introduce blanket proxy trust, keeping the IP rate-limit
  resistant to X-Forwarded-For spoofing.
- **Anti-enumeration intact.** The magic-link initiation seam still returns the generic
  202 `{ status: "accepted" }`; the test confirms no user row is created on initiation.
- **Error leakage (api-exception.filter.ts).** Unhandled exceptions return a generic
  INTERNAL_SERVER_ERROR body; the stack is logged server-side only. Unchanged.
- **Secrets.** No credential/token literal in the changed source. The base64url strings
  in the test file are throwaway fixtures (per task guidance) — not flagged. Env
  fail-closed is exercised by the suite (missing AUTH_SESSION_HASH_SECRET -> throws).

## ASVS coverage touched (all preserved, none regressed)

- V3 Session Management — cookie prefix/flags, server-side session validation.
- V4/V13 Access Control & CSRF — CSRF guard on mutating routes.
- V14 Configuration — CORS allowlist, trustProxy off, env fail-closed.

## Unresolved questions

None.
