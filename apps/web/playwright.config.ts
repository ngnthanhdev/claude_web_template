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
    { name: "mobile-320", use: { viewport: { width: 320, height: 720 } } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 } } },
    { name: "tablet-768", use: { viewport: { width: 768, height: 1024 } } },
    { name: "laptop-1024", use: { viewport: { width: 1024, height: 800 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
