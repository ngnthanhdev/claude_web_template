# Next.js RSC / client boundaries (App Router)

## 2026-07-24 — Server Components, client boundaries, and data-fetch traps

Hard-won building the Layer 5 storefront:

- **A relative-path fetch client can't run in a Server Component.** The browser
  api-client fetches the same-origin proxy path `/api/v1/*`; Node's server-side
  `fetch` can't resolve a relative URL, so calling it from an RSC throws. Options:
  fetch client-side (TanStack Query, like the collection pages) OR add a separate
  server module that hits the absolute server-only `API_ORIGIN` directly
  (`catalogue-server.ts`) — the latter is what enables real SSR HTTP 404s for SEO.
- **RTL cannot render an async Server Component** (`render()` can't await a
  function component). Extract the pure logic (e.g. the `[...slug]` →
  `{category, subcategory} | null` resolver in `route-scope.ts`) and unit-test
  that; the page's `notFound()` gating itself is only provable via e2e.
- **StrictMode double-invokes effects in dev.** A single-use side effect that
  also mutates state on the first run (magic-link redeem that strips the
  `#token` fragment) must latch with a `useRef`, NOT a `cancelled`-flag cleanup —
  the cleanup cancels the real first run, and the second pass reads the
  now-empty fragment and renders a false "invalid/expired".
- **No `error.tsx` = ugly default error page.** After moving product/category to
  Server Components, a non-404 API failure unwinds to Next's unstyled,
  English-only default unless a `[locale]/error.tsx` client boundary (with a
  `reset()` retry) exists. `notFound()` still routes to `not-found.tsx`.
- **`getTranslations` server form:** use `getTranslations("Namespace")` (string)
  or `{ locale, namespace }` — `{ namespace }` alone fails typecheck (TS2769).

Source: apps/web/src/lib/catalogue-server.ts, .../auth/redemption-status.tsx,
.../categories/[...slug]/route-scope.ts, .../app/[locale]/error.tsx
