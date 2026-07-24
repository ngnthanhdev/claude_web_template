# Fastify adapter (NestJS bootstrap)

## 2026-07-23 — Register @fastify/cookie in bootstrap or cookie auth breaks

Cookie-based session auth reads `request.cookies[...]` (guard) and writes
`reply.setCookie/clearCookie` (controller). These only work if
`@fastify/cookie` is registered on the app. Unit/integration tests register it
themselves (`await app.register(cookie)`), so they pass even when `main.ts`
does **not** — the gap only surfaces at runtime. Bootstrap must
`await app.register(cookie)` before `listen`, alongside versioning/pipe/filter.

Source: apps/api/src/main.ts, apps/api/src/auth/core/auth-cookie.ts (T-3fa9d0)

## 2026-07-24 — Global request wiring belongs in configureApp(), not main.ts

The class of bug above (prod-only gap because tests wire themselves) is now
structurally prevented: `apps/api/src/bootstrap/configure-app.ts` holds the
shared request-handling wiring (URI versioning, Zod pipe, exception filter,
cookie) and is called by `main.ts` **and** every api test. Add any new global
pipe/filter/guard/interceptor there. Only ConfigService-dependent, network-level
concerns (CORS, Helmet, `listen`) stay in `main.ts`.

Source: apps/api/src/bootstrap/configure-app.ts

## 2026-07-23 — Keep trustProxy OFF as the safe default for IP rate-limiting

Auth rate limits key on a hash of `request.ip`. With `trustProxy` off (Fastify
default) `request.ip` is the socket address, so a spoofed `X-Forwarded-For`
cannot bypass the per-IP limit. Never set blanket `trustProxy: true`; behind a
real proxy configure an explicit hop count / known proxy IPs instead, or the
limiter sees only the proxy address.

Source: apps/api/src/main.ts, apps/api/src/auth/core/auth-rate-limit.service.ts
