# Web testing (Vitest + RTL + Playwright)

## 2026-07-24 — axe matcher, jsdom canvas, and Playwright lint gotchas

- **`vitest-axe`'s matcher doesn't type-check under Vitest 2** (`toHaveNoViolations`
  augments an old `Vi.Assertion` namespace Vitest 2 no longer uses; the
  `/matchers` subpath re-exports it type-only). Repo convention: assert directly
  on `(await axe(container)).violations` with `.toEqual([])` — a full real
  axe-core run, no custom matcher. Every Layer 5 component test uses this shape.
- **jsdom `HTMLCanvasElement.prototype.getContext` is unimplemented**, so axe's
  color-contrast rule prints a harmless `Not implemented: HTMLCanvasElement...`
  stderr line during every axe test — it does NOT fail the test. Don't chase it.
- **Playwright + `react-hooks` ESLint false-positive:** a fixture provider's
  conventional `use` callback param is mistaken for React's `use()` hook — rename
  it (e.g. `provideAxeBuilder`) so `react-hooks/rules-of-hooks` passes.
- Keep e2e specs out of the app's `tsc`/Vitest (the web `tsconfig.json` `include`
  already excludes `e2e/**`; Vitest never collects `*.spec.ts`). The real
  Playwright run needs a served app + browsers + seeded DB → outside-session, and
  the `__Host-` session cookie only sets over a secure context, so serve the web
  app at `http://localhost:<port>` (localhost secure exception), not a bare IP.

Source: apps/web/e2e/_, apps/web/src/\**/_.test.tsx
