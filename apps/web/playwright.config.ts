import { defineConfig } from "@playwright/test";

/**
 * `apps/web`'s own `next start` default (port 3000) collides with apps/api's
 * default `PORT=3000` (apps/api/.env.example) — this repo's convention is API
 * on 3000, web on 3001, matching apps/api/.env.example's
 * `CORS_ORIGIN`/`PUBLIC_WEB_ORIGIN=http://localhost:3001` and
 * apps/web/.env.example's `API_ORIGIN=http://localhost:3000`. Override with
 * `E2E_BASE_URL` if your environment serves the web app elsewhere.
 */
const DEFAULT_BASE_URL = "http://localhost:3001";

/** Viewport widths the browse suite is fanned across (see `projects` below). */
const BROWSE_VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 720 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

/** The auth spec runs on exactly one project to stay under the API's per-IP magic-link rate limit (see `projects` below). */
const AUTH_SPEC = /auth\.spec\.ts/;

/**
 * No `webServer` entry here on purpose: this suite needs the API served
 * against a seeded disposable database *and* the web app built and served
 * against it, per this repository's heavy-build rule — standing those up is
 * a real-terminal step this config doesn't own. See `e2e/README.md`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? DEFAULT_BASE_URL,
    browserName: "chromium",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // Representative CSS viewport widths spanning the acceptance's 320-1440px
  // range, straddling the shell's sm=640px breakpoint (below: MobileDrawer,
  // at/above: MegaMenu — see src/components/app-shell.tsx) so both nav
  // surfaces get exercised. One engine (Chromium) is enough: the acceptance
  // asks for cross-viewport coverage, not cross-browser coverage.
  projects: [
    // Browse runs on every viewport — cross-viewport coverage is its point.
    ...BROWSE_VIEWPORTS.map((viewport) => ({
      name: viewport.name,
      testIgnore: AUTH_SPEC,
      use: { viewport: { width: viewport.width, height: viewport.height } },
    })),
    // Auth runs on a single viewport on purpose. Every viewport project shares
    // one source IP (the Playwright process), and apps/api rate-limits
    // magic-links per IP (auth-rate-limit.service.ts: 20 initiations and 10
    // redemptions per 15-min window). Fanning auth.spec.ts across all five
    // viewports multiplies its initiations/redemptions 5x and trips those
    // caps; auth flows are not viewport-sensitive the way browse layout is
    // (browse still covers 320-1440px above), so one representative width is
    // enough. `fullyParallel: false` also serializes them into a predictable,
    // burst-free order. See e2e/README.md.
    {
      name: "auth",
      testMatch: AUTH_SPEC,
      fullyParallel: false,
      use: { viewport: { width: 1024, height: 800 } },
    },
  ],
});
