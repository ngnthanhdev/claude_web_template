# Fastify adapter (NestJS bootstrap)

## 2026-07-23 — Register @fastify/cookie in bootstrap or cookie auth breaks

Cookie-based session auth reads `request.cookies[...]` (guard) and writes
`reply.setCookie/clearCookie` (controller). These only work if
`@fastify/cookie` is registered on the app. Unit/integration tests register it
themselves (`await app.register(cookie)`), so they pass even when `main.ts`
does **not** — the gap only surfaces at runtime. Bootstrap must
`await app.register(cookie)` before `listen`, alongside versioning/pipe/filter.

Source: apps/api/src/main.ts, apps/api/src/auth/core/auth-cookie.ts (T-3fa9d0)

## 2026-07-23 — Keep trustProxy OFF as the safe default for IP rate-limiting

Auth rate limits key on a hash of `request.ip`. With `trustProxy` off (Fastify
default) `request.ip` is the socket address, so a spoofed `X-Forwarded-For`
cannot bypass the per-IP limit. Never set blanket `trustProxy: true`; behind a
real proxy configure an explicit hop count / known proxy IPs instead, or the
limiter sees only the proxy address.

Source: apps/api/src/main.ts, apps/api/src/auth/core/auth-rate-limit.service.ts
