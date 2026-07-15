---
name: web-security
description: Use when hardening apps/web to OWASP ASVS — setting a Content-Security-Policy (with a per-request nonce on Next.js), secure cookie flags, XSS prevention, CSRF for cookie-based auth, the security response-header set, and keeping secrets out of the client bundle. Covers both the Next.js and the Vite + React path. Defers session/token handling to web-auth-state and the API side to backend-auth-security; security-review audits a diff against this.
---

# web-security

Client-side hardening for `apps/web`, verified against **OWASP ASVS**
(Application Security Verification Standard) — the browser-facing counterpart
to the API-side controls in `backend-auth-security`. Covers
Content-Security-Policy (with a Next.js nonce), secure cookies, XSS, CSRF for
cookie auth, the security response-header set, dependency/supply-chain
hygiene, and build config so no secret ever ships in a client bundle.

## Goal

Every response carries a restrictive CSP and the standard hardening headers;
inline script runs only under a per-request nonce, never `'unsafe-inline'`;
untrusted HTML is never injected without sanitizing; and a secret never
reaches the browser because it was never prefixed into the public build. The
session/token mechanism itself is owned by `web-auth-state` — this skill
hardens everything around it.

## Content-Security-Policy

CSP is the highest-leverage control against XSS: even if a payload lands, a
strict `script-src` stops it executing. How you deliver it forks by client
path.

### Next.js — a per-request nonce in middleware

A Server-Rendered app can mint a fresh nonce per request, so inline framework
scripts run under `'nonce-…' 'strict-dynamic'` and nothing else does:

```ts
// apps/web/middleware.ts
import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: https:`,
    `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? ""}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce); // pass the nonce down to the layout
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)" }],
};
```

```tsx
// apps/web/app/layout.tsx (excerpt) — any inline/third-party script must carry the nonce
import { headers } from "next/headers";
import Script from "next/script";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined; // headers() is async in Next 15+
  return (
    <html lang="en">
      <body>{children}</body>
      <Script src="/analytics.js" nonce={nonce} strategy="afterInteractive" />
    </html>
  );
}
```

### Vite + React — no per-request nonce

A static SPA has no server on the request path to generate a nonce, so don't
fake one. Serve a CSP with `script-src 'self'` (no inline scripts — Vite's
production build emits external bundles) from whatever fronts the static
files, and use hashes only for any unavoidable inline snippet:

```nginx
# nginx serving the Vite build
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

## Security response headers

CSP aside, ship the standard set on every response. On Next.js the static
ones go through `next.config` (CSP stays in middleware because it needs the
nonce); on Vite they're `add_header` lines next to the CSP above.

```ts
// apps/web/next.config.ts (excerpt)
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" }, // belt-and-suspenders with CSP frame-ancestors
];

export default {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
```

`Strict-Transport-Security` forces HTTPS; `nosniff` stops MIME-confusion
attacks; `Referrer-Policy` avoids leaking full URLs cross-origin;
`Permissions-Policy` denies powerful APIs the app doesn't use.

## XSS prevention

React and Next auto-escape every interpolated value — `{userInput}` in JSX is
safe by construction. The single hole is `dangerouslySetInnerHTML`:

```tsx
// BAD — stored XSS: whatever the API returns is injected as live HTML.
<div dangerouslySetInnerHTML={{ __html: post.body }} />

// GOOD — sanitize with an allowlist first (or render as plain text / a
// vetted markdown-to-safe-HTML pipeline instead).
import DOMPurify from "isomorphic-dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body) }} />
```

Also never build an `href`/`src` from untrusted input without checking the
scheme — a `javascript:` URL is script execution. Validate any URL field
through a `@shared` zod schema (`z.string().url()`) before it reaches an
attribute, so a bad value is rejected at the contract boundary.

## Cookies and CSRF — follow the auth transport

Whether the app uses cookie sessions or a bearer token in the `Authorization`
header is `web-auth-state`'s decision, and it determines two controls here:

- **If cookie-based:** the auth cookie is set **server-side** (by the API or
  a Next.js Route Handler), never from client JS, with non-negotiable flags —
  `HttpOnly` (JS can't read it, so XSS can't steal it), `Secure`,
  `SameSite=Lax` (or `Strict`), and a narrow `Path`. Cookie auth **needs
  CSRF protection**: rely on `SameSite` plus an anti-CSRF token (double-submit
  or synchronizer) on every state-changing request.

```
Set-Cookie: session=…; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900
```

- **If bearer-token-in-header:** a header the browser never attaches
  automatically, so classic CSRF doesn't apply and no CSRF token is needed —
  the same reasoning `backend-auth-security` applies on the API side. Adding
  CSRF middleware to a header-only client is complexity guarding a risk that
  isn't there.

The client must never write an auth cookie via `document.cookie`, and never
persist a raw token where XSS can read it — see `web-auth-state` for the
storage decision.

## Build-config hygiene — no secrets in the client bundle

`NEXT_PUBLIC_*` (Next.js) and `VITE_*` (Vite) env vars are **inlined into the
client bundle at build time and are fully public** — anyone can read them in
DevTools. A secret must never carry those prefixes. Server-only secrets stay
unprefixed and are read exclusively in server code (Server Components, Route
Handlers, the API — never a Client Component).

```bash
# apps/web/.env
NEXT_PUBLIC_API_URL=https://api.example.com   # PUBLIC — fine, it is just a URL
API_SIGNING_SECRET=…                          # SERVER ONLY — never prefix NEXT_PUBLIC_
# Vite: VITE_API_URL is PUBLIC; anything without VITE_ is not exposed to the client at all.
```

Verify before shipping: grep the built bundle for a known secret value, and
scan the release image (`web-testing-release`'s "no secrets in the image"
step). A leaked `NEXT_PUBLIC_`/`VITE_` secret is not revocable by redeploy —
it's already in every shipped bundle.

## Dependency and supply-chain

- Commit `pnpm-lock.yaml`; run `pnpm audit --audit-level=high` in CI
  (`security.yml`) and keep Dependabot's weekly updates flowing.
- Prefer bundling third-party code over loading it at runtime. If an external
  `<script>`/`<link>` is unavoidable, pin it with Subresource Integrity
  (`integrity=` + `crossorigin`) and add its origin to the CSP allowlist —
  never a blanket `script-src *`.
- Treat a new dependency as new attack surface: check it's maintained and
  scoped before adding it, the same scrutiny `security-review` applies to a
  diff.

## Do

- Ship a strict CSP on every response — a per-request nonce +
  `'strict-dynamic'` on Next.js, `script-src 'self'` from the host layer on
  Vite — plus HSTS, `nosniff`, `Referrer-Policy`, and `Permissions-Policy`.
- Sanitize with DOMPurify before any `dangerouslySetInnerHTML`, and validate
  URL fields through a `@shared` zod schema.
- Set auth cookies server-side with `HttpOnly; Secure; SameSite`, and add a
  CSRF token whenever auth is cookie-based (defer the transport choice to
  `web-auth-state`).
- Keep every secret unprefixed and server-only; verify none leaked into the
  bundle or image before release.

## Don't

- Don't use `'unsafe-inline'` in `script-src` to make inline scripts work —
  use the nonce (Next.js) or externalize the script (Vite).
- Don't inject unsanitized HTML, and don't build `href`/`src` from untrusted
  input without checking the scheme.
- Don't add CSRF middleware to a bearer-token-only client, and don't set an
  auth cookie from client JS.
- Don't prefix a secret with `NEXT_PUBLIC_`/`VITE_` — those values are public
  the moment the bundle builds.
