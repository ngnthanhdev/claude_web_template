---
name: web-testing-release
description: Use when writing Vitest + React Testing Library unit/component tests for apps/web, Playwright cross-viewport e2e + visual-snapshot tests, axe accessibility checks, a Core Web Vitals budget, or the Docker/self-host release checklist for the web app. Covers both the Next.js and the Vite + React client path. Pairs with backend-testing for the API side and web-responsive for the viewports the Playwright projects exercise.
---

# web-testing-release

Test strategy and release readiness for `apps/web`: Vitest + React Testing
Library for unit/component tests, Playwright for cross-viewport e2e and
visual regression, `@axe-core/playwright` for accessibility, a Core Web
Vitals budget, and a Docker/self-host release checklist. Component fixtures
are built from the same `@shared` zod schemas the API validates against, so a
test can never assert against a shape the contract no longer produces (the
client-side counterpart to `backend-testing`'s fixture discipline).

## Goal

Component tests prove a component's rendered output and interaction in
isolation (no network); Playwright e2e proves the real app behaves at both a
desktop and a mobile width, with a per-viewport visual baseline and an axe
pass at each; a release ships as a reproducible Docker image that carries no
secrets, exposes a healthcheck, and takes all runtime config from the
environment.

## Vitest + React Testing Library

Vitest runs the same whichever client path was chosen in Phase 0, but the
config lives in a different place:

- **Next.js path** — a dedicated `apps/web/vitest.config.ts` (Next has no
  Vite config of its own to hang the `test` block off).
- **Vite + React path** — the `test` block can live directly in the existing
  `apps/web/vite.config.ts` (add `/// <reference types="vitest/config" />`).

```ts
// apps/web/vitest.config.ts  (Next.js path; Vite path folds this into vite.config.ts)
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()], // tsconfigPaths resolves the @shared/* alias
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: true,
  },
});
```

```ts
// apps/web/vitest.setup.ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup()); // unmount between tests so queries don't bleed across cases
```

### A component test, fixture built from a `@shared` schema

```tsx
// apps/web/src/components/post-card.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { postSchema } from "@shared/contracts/post";
import { PostCard } from "./post-card";

const post = postSchema.parse({
  id: "00000000-0000-0000-0000-000000000001",
  title: "Hello world",
  body: "Body text",
  authorId: "00000000-0000-0000-0000-000000000002",
  createdAt: new Date().toISOString(),
});

it("renders the title and calls onOpen with the post id when clicked", async () => {
  const onOpen = vi.fn();
  render(<PostCard post={post} onOpen={onOpen} />);

  expect(screen.getByRole("heading", { name: "Hello world" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /open/i }));
  expect(onOpen).toHaveBeenCalledWith(post.id);
});
```

Parsing through `postSchema` (not a plain object literal cast `as Post`)
means a fixture that drifts from the contract fails in the fixture itself,
not with a misleading assertion later. Query by **role/name**, not test ids —
a test that finds "the button named open" also asserts the element is
reachable by assistive tech; a `getByTestId` doesn't.

## Playwright — cross-viewport e2e + visual snapshots

The project list is where responsive coverage comes from: every spec runs
once per viewport, and the widths mirror the breakpoints `web-responsive`
designs to. Desktop and mobile snapshots are stored as separate baselines
(Playwright keys the file on project name), so a regression at one width
fails loudly without the other masking it.

```ts
// apps/web/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  // Playwright boots the built app itself, so e2e runs against production
  // output, not the dev server.
  webServer: {
    command: "pnpm --filter web start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "phone-chrome", use: { ...devices["Pixel 7"] } },   // ~412px width
    { name: "phone-safari", use: { ...devices["iPhone 14"] } }, // ~390px width
  ],
});
```

```ts
// apps/web/e2e/home.spec.ts
import { test, expect } from "@playwright/test";

test("home renders and matches the per-viewport visual baseline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // One baseline per project — desktop.png and mobile.png live side by side.
  await expect(page).toHaveScreenshot("home.png", { maxDiffPixelRatio: 0.01 });
});
```

Generate/refresh baselines with `--update-snapshots` **inside a container
that matches CI** (`mcr.microsoft.com/playwright`) — font antialiasing
differs between macOS and Linux, so a locally-generated PNG will diff against
CI forever otherwise.

## Accessibility — axe at every viewport

```ts
// apps/web/e2e/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("home has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});
```

Because it runs under the same projects, axe checks contrast, labels, and
focus order at both desktop and mobile widths — complementing the tap-target
and reflow rules `web-responsive` enforces in the design itself.

## Core Web Vitals budget

Ship a budget and gate it, don't eyeball it. Report field metrics from the
running app with the `web-vitals` library (LCP, INP, CLS to your analytics
sink), and enforce lab thresholds in CI with Lighthouse CI against the built
image:

```jsonc
// apps/web/lighthouserc.json (excerpt) — `pnpm dlx @lhci/cli autorun`
{ "ci": { "assert": { "assertions": {
  "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
  "interaction-to-next-paint": ["error", { "maxNumericValue": 200 }],
  "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }]
}}}}
```

## Release checklist — Docker/self-host

The web app deploys as its own image (the API ships separately; both are
provider-agnostic). Next.js uses `output: "standalone"`; a Vite SPA builds
to static assets served by nginx.

```dockerfile
# apps/web/Dockerfile — Next.js standalone, multi-stage
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S web && adduser -S web -G web
COPY --from=build --chown=web:web /app/apps/web/.next/standalone ./
COPY --from=build --chown=web:web /app/apps/web/.next/static ./apps/web/.next/static
USER web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
```

Before tagging a release, all of these must hold:

- `pnpm --filter web build` is green with zero type errors, and the full
  suite passes: Vitest, Playwright (every viewport project), axe, Lighthouse.
- The image builds from the multi-stage Dockerfile, runs as a **non-root**
  user, and exposes a healthcheck route (`/api/health` for Next.js; a static
  `/health` served by nginx for the Vite path) wired to `HEALTHCHECK` or the
  orchestrator's probe.
- **Runtime config comes from the environment at container start.** Server
  secrets are read only in server code and are never prefixed `NEXT_PUBLIC_`/
  `VITE_` — those are public and baked into the client bundle (see
  `web-security`).
- **No secrets in the image.** `.dockerignore` excludes `.env*`; confirm with
  a scan (`docker history`, `docker sbom`, or Trivy) that no credential is a
  build arg or a baked layer.

## Do

- Build component fixtures by parsing a `@shared` zod schema; query by
  role/name, not test ids.
- Give Playwright a desktop **and** a mobile project so every e2e + visual
  snapshot runs at both widths, mirroring `web-responsive`'s breakpoints.
- Run axe under the same projects and gate Core Web Vitals with Lighthouse CI.
- Regenerate visual baselines in a CI-matching container; run the app as a
  non-root user with a wired healthcheck.

## Don't

- Don't cast a fixture `as Post` without parsing it — a silently-drifted
  fixture tests a shape the API no longer returns.
- Don't rely on a single desktop viewport — a phone-width layout break ships
  invisibly without a mobile Playwright project.
- Don't bake a secret into the image or expose it as `NEXT_PUBLIC_`/`VITE_`;
  runtime config is read from the environment (see `web-security`).
- Don't commit visual baselines generated on macOS and expect them to match
  Linux CI — regenerate them in the CI container.
