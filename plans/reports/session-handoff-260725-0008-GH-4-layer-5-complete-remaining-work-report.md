# Session handoff — Layer 5 web complete, remaining work

**Written:** 2026-07-25 · **Branch:** `codex/layer-4-api` · **HEAD:** `2350a7f` (local only, NOT pushed)

Read this top-to-bottom; it is self-contained. Then read `CHECKPOINT.md` for the
architecture/decisions/contracts, and `tasks/layer-5-todo.md` for the authoritative
task blocks. Durable gotchas are in `.learnings/`.

---

## 1. Where we are

Layer 5 (**Public Storefront + Passwordless Auth Web**) is **code-complete** on
`codex/layer-4-api`. Full workspace gate is green:

```bash
pnpm turbo run lint typecheck test
# → 15/15 tasks: shared 81 · api 59 (+40 DB-skipped) · web 173 · lint · typecheck
```

13 tasks `done` in `tasks/layer-5-todo.md`; **one task still `todo` (`T-2f8b41`)**
plus two terminal-only verifications and the `/next-layer` gate. Nothing is pushed;
no PR opened. All Layer-5 git worktrees were merged and removed (working tree clean;
only `plans/` is untracked).

**The app works end-to-end** (verified by unit/component tests + code+security
review, not yet by a live run): home → mega-menu/category/search → product detail;
sign-in → magic-link redemption → account → sign out. Browser talks only to a
same-origin proxy; product/category pages are Server Components returning real 404s.

## 2. Remaining work — do in this order

### 2a. Two terminal-only verifications (heavy-build rule blocks them inside Claude)

```bash
# (i) i18n standalone Docker image must serve BOTH locales (the one T-7c4f10 item unverified)
docker build -f apps/web/Dockerfile -t kitvera-web .
#   copy apps/web/.dockerignore to root first if web-build.yml does; then run the
#   container and curl /vi and /en — expect 200 + localized copy, NOT a 500.

# (ii) Playwright e2e (needs served web + served API + seeded disposable Postgres + Chromium)
pnpm --filter @marketplace/web exec playwright test
#   BROWSE specs run now. AUTH specs stay test.skip until 2b lands (see e2e/README.md
#   for exact env/services + the E2E_MAGIC_LINK_CAPTURE_FILE contract).
```

If the Docker i18n image 500s on a localized route, see `.learnings/nextjs-i18n.md` —
the fix (build+runner `COPY apps/web/messages` + `outputFileTracingIncludes`) is
already in `apps/web/Dockerfile` + `next.config.ts`; this run just confirms it.

### 2b. `T-2f8b41` — capture-only email adapter (unblocks auth e2e) — `apps/api`

Authoritative block: `tasks/layer-5-todo.md` → `### T-2f8b41`. Summary:

- Today `apps/api/src/auth/magic-links/` wires only `NullEmailDeliveryAdapter`
  (suppresses everything), so nothing outside the API can learn a magic-link URL →
  `auth.spec.ts` `test.skip`s its seam block.
- Implement a **test-only, capture-only** `EmailDeliveryPort` adapter: when
  `E2E_MAGIC_LINK_CAPTURE_FILE` is set, append one JSONL line per delivery
  (`{ email, locale, link }`, mirroring the real `MagicLinkDelivery` type) to that
  file; deliver to no real vendor. When unset → existing null/suppress behavior.
  **Must be impossible to enable in production** (guard on the explicit env var +
  a non-production check). Document the var in `apps/api/.env.example`.
- Pattern to follow: `email-delivery.port.ts` + `null-email-delivery.adapter.ts` +
  the provider binding in `magic-links.module.ts`. The web-side contract is already
  written in `apps/web/e2e/README.md` — satisfy it exactly.
- Gate: `pnpm --filter @marketplace/api lint typecheck test` green; no real vendor/credential.
- Skills: `nestjs-backend`, `backend-auth-security`, `backend-testing`, `typescript-strict`.

After it lands, re-run 2a(ii) with the env var set — the auth happy-path specs
should go green in a real terminal.

### 2c. `/next-layer` gate (then advance to Layer 6)

- The Wave-2b code review flagged `apps/web/src/hooks/use-product-collection.ts`
  ships **without a unit test** (its forward/back cursor-stack + `updateFilters`
  cursor-reset logic is only trace-verified). The `/next-layer` `test-writer` step
  should cover it.
- `/next-layer` then verifies **all tests pass**, appends Layer 5's tasks to
  `tasks/done.md`, creates `tasks/layer-6-todo.md`, and bumps the **Current Layer /
  Current Task** pointer in `CLAUDE.md` (still points at Layer 5 today).
- Do NOT advance while `T-2f8b41` is `todo` or the two verifications are unrun — the
  layer's completion gate (bottom of `tasks/layer-5-todo.md`) requires the browse +
  auth Playwright flows to actually pass.

## 3. Critical context the new session needs (don't relearn the hard way)

- **Same-origin proxy topology:** the browser calls ONLY `/api/v1/*` →
  `app/api/[...proxy]/route.ts` forwards to the server-only `API_ORIGIN` (keeps
  `__Host-` cookies first-party). Server Components fetch `API_ORIGIN` **directly**
  via `lib/catalogue-server.ts` (no cookies, public reads) — that's what gives real
  SSR 404s. Never make the browser call `API_ORIGIN` directly; never move auth
  reads server-side.
- **Run the FULL workspace gate,** not `--filter web` — a web export deletion once
  broke an `apps/api` cross-package test. See `.learnings/ci-gates.md`.
- **Import alias in `apps/web` is `@shared/*`** (→ `packages/shared/src/*`), not the
  package name.
- **axe in web tests:** assert on `(await axe(container)).violations` `.toEqual([])`
  (the `vitest-axe` matcher doesn't type-check under Vitest 2). `.learnings/web-testing.md`.
- **RSC traps** (StrictMode effect latch, RTL-can't-render-async-RSC, `error.tsx`,
  `getTranslations` string form): `.learnings/nextjs-rsc.md`.
- **Parallel worktrees:** keep `/run-layer` fan-outs to **≤2–3 concurrent** heavy
  agents (a 5-wide one exhausted the token window mid-run). `.learnings/parallel-worktrees.md`.

## 4. Tracked non-blocking follow-ups (already in `tasks/layer-5-todo.md`, don't re-file)

- `T-9d3c05` is **done** (error boundary + resolver test) but flagged: no RTL test
  exists for `error.tsx` itself — minor, optional.
- `T-7c4f10` chose the var name `PREVIEW_ORIGIN` for the CSP `frame-src` preview host
  (fail-closes to `'none'`); confirm that name + that preview hosting is single-origin
  before release, and set it in every deploy env or product demo iframes are blocked.
- Root `.env.example` still has a stale commented `NEXT_PUBLIC_API_URL` line (harmless).

## 5. Open decisions for you

- Push `codex/layer-4-api` / open a PR? (Not done — your call.)
- Do `T-2f8b41` now, or leave auth e2e skipped for a later backend pass?

---

**First command in the new session:** `git -C /Users/nguyenthanh/Documents/prj_web_template log --oneline -3`
to confirm you're on `2350a7f`, then `pnpm turbo run lint typecheck test` to confirm green, then pick up at §2.
