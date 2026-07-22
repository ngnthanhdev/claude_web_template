# Layer 0 — Template Marketplace Foundation

Status: **done**

This layer establishes the project skeleton required by every later marketplace
feature. It intentionally stops before catalogue models, authentication,
commerce, storefront screens, admin workflows, and template inventory. Those
belong to later layers derived after this foundation is proven green.

Tasks run in dependency waves. Tasks whose `Depends` requirements are already
complete may run in parallel, and no two tasks own the same file. To avoid
worktree conflicts, only the final CI task updates `pnpm-lock.yaml`; preceding
tasks may install locally with `--no-lockfile` for verification but must not
commit lockfile changes.

---

### T-a463b5 — Establish shared wire-contract primitives
- **Status:** done
- **Assignee:** ai
- **Files:** packages/shared/package.json, packages/shared/tsconfig.json, packages/shared/vitest.config.ts, packages/shared/src/index.ts, packages/shared/src/api.ts, packages/shared/src/localization.ts, packages/shared/src/money.ts, packages/shared/src/api.test.ts
- **Acceptance:**
  - `@marketplace/shared` is a strict TypeScript package exporting Zod schemas and inferred types for the `/v1` error envelope, health response, cursor-page metadata, supported locales (`vi`, `en`), supported currencies (`VND`, `USD`), and integer-minor-unit money values.
  - The primitives encode only cross-cutting wire conventions from the approved spec; catalogue, auth, cart, order, and entitlement contracts are deferred.
  - Package scripts provide `build`, `lint`, `typecheck`, and `test`, with contract tests covering valid data and representative invalid boundaries such as fractional money and unsupported locale/currency values.
  - `pnpm --filter @marketplace/shared typecheck` and `pnpm --filter @marketplace/shared test` pass.
- **Skills:** shared-contracts, typescript-strict

### T-6c8d2e — Scaffold the controlled template-factory package
- **Status:** done
- **Assignee:** ai
- **Files:** packages/template-factory/package.json, packages/template-factory/tsconfig.json, packages/template-factory/vitest.config.ts, packages/template-factory/src/index.ts, packages/template-factory/src/manifest.ts, packages/template-factory/src/adapter.ts, packages/template-factory/src/pipeline.ts, packages/template-factory/src/manifest.test.ts, packages/template-factory/fixtures/valid/template.manifest.json
- **Acceptance:**
  - `@marketplace/template-factory` is a strict TypeScript package with `build`, `lint`, `typecheck`, and `test` scripts.
  - A versioned `template.manifest.json` schema validates identity, category, version, compatibility, Regular/Extended licence metadata, demo-page declarations, and build-adapter identity without embedding a specific product or vendor implementation.
  - Typed adapter and pipeline-stage interfaces establish the later validate → build/install test → browser/axe/visual QA → security/licence scan → package/checksum/SBOM/docs → install-from-ZIP → human approval → immutable publish flow; provider integrations and executable build runners remain deferred.
  - The committed fixture passes, malformed manifest cases fail with useful validation errors, and `pnpm --filter @marketplace/template-factory typecheck` plus `pnpm --filter @marketplace/template-factory test` pass.
- **Skills:** typescript-strict

### T-13ab58 — Scaffold the Next.js marketplace shell
- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/package.json, apps/web/tsconfig.json, apps/web/next-env.d.ts, apps/web/next.config.ts, apps/web/eslint.config.mjs, apps/web/postcss.config.mjs, apps/web/components.json, apps/web/vitest.config.ts, apps/web/src/app/layout.tsx, apps/web/src/app/page.tsx, apps/web/src/app/globals.css, apps/web/src/components/app-shell.tsx, apps/web/src/components/providers.tsx, apps/web/src/components/ui/button.tsx, apps/web/src/lib/api-client.ts, apps/web/src/lib/query-client.ts, apps/web/src/lib/utils.ts, apps/web/src/app/page.test.tsx
- **Acceptance:**
  - The app uses the locked Next.js App Router stack with strict TypeScript, Tailwind CSS, owned shadcn/ui source, TanStack Query, react-hook-form with Zod resolver support, and Framer Motion.
  - The root provider stack and a responsive public-shell placeholder render without introducing any product screen; `@/*` and `@shared/*` resolve, and the typed API client validates a health response with `@marketplace/shared` before returning it.
  - Global CSS defines the approved Coral modern-minimal Hallmark foundation as semantic tokens (neutral paper surfaces, restrained coral accent, typography, spacing, radius, borders, focus, and motion durations) without a gradient hero or invented marketing proof.
  - The shell preserves zoom, uses visible keyboard focus, provides at least 44px interactive targets, respects reduced motion, and has no page-level horizontal overflow at a 320px viewport.
  - Package scripts provide `build`, `lint`, `typecheck`, and `test`; the component test verifies the shell, provider wiring, and accessible landmark/focus behavior.
  - `pnpm --filter @marketplace/web typecheck` and `pnpm --filter @marketplace/web test` pass, and `pnpm --filter @marketplace/web dev` boots without console errors.
- **Skills:** web-app-foundation, web-styling, hallmark, web-responsive, web-api-integration, web-data-forms, motion-design-principles, web-animations, web-security, web-testing-release, typescript-strict
- **Depends:** T-a463b5

### T-2f2057 — Scaffold the NestJS Fastify API
- **Status:** done
- **Assignee:** ai
- **Files:** apps/api/package.json, apps/api/tsconfig.json, apps/api/nest-cli.json, apps/api/eslint.config.mjs, apps/api/vitest.config.ts, apps/api/.env.example, apps/api/prisma/schema.prisma, apps/api/src/main.ts, apps/api/src/app.module.ts, apps/api/src/config/env.ts, apps/api/src/common/filters/api-exception.filter.ts, apps/api/src/prisma/prisma.module.ts, apps/api/src/prisma/prisma.service.ts, apps/api/src/health/health.module.ts, apps/api/src/health/health.controller.ts, apps/api/src/health/health.controller.test.ts
- **Acceptance:**
  - NestJS boots on the Fastify adapter with `ConfigModule`, PrismaModule/PrismaService, `nestjs-zod` global validation, and a global exception filter that emits the shared `{error:{code,message,details?}}` envelope.
  - Prisma is configured for PostgreSQL through validated environment variables and contains generator/datasource configuration only; marketplace domain models and migrations are deferred.
  - `GET /health` returns `200` with a body accepted by the shared health schema, while future API resources are configured under the `/v1` prefix.
  - The baseline config uses no hard-coded credentials, does not expose stack traces in production responses, and leaves provider-neutral CORS/origin configuration explicit in `.env.example`.
  - Package scripts provide `build`, `lint`, `typecheck`, and `test`; the health/exception smoke tests pass with the Fastify-backed Nest application.
  - `pnpm --filter @marketplace/api typecheck` and `pnpm --filter @marketplace/api test` pass.
- **Skills:** api-design, nestjs-backend, database-orm, backend-auth-security, backend-testing, shared-contracts, typescript-strict
- **Depends:** T-a463b5

### T-9e4c1a — Add production container definitions
- **Status:** done
- **Assignee:** ai
- **Files:** apps/web/Dockerfile, apps/web/.dockerignore, apps/api/Dockerfile, apps/api/.dockerignore, .github/workflows/web-build.yml, .github/workflows/api-deploy.yml
- **Acceptance:**
  - Both apps have multi-stage, workspace-aware Dockerfiles that build from the repository-root context, include required shared workspace packages, copy only production output, and run as non-root users without baking secrets into images.
  - The web container runs the Next.js standalone production output; the API container runs compiled NestJS output and exposes a container health check against `/health`.
  - Both workflows invoke `docker build` with repository-root context and their app-specific Dockerfile, retain manual/main-only triggers, and retain an explicit provider-neutral deploy placeholder because hosting remains an open decision.
  - Dockerfiles and workflow YAML pass static validation; full image builds are verified in a real terminal outside the agent session, consistent with the repository's heavy-build rule.
- **Skills:** web-testing-release, web-security, backend-auth-security
- **Depends:** T-13ab58, T-2f2057

### T-f5834d — Reconcile the workspace lockfile and CI gate
- **Status:** done
- **Assignee:** ai
- **Files:** pnpm-lock.yaml, turbo.json, .github/workflows/ci.yml
- **Acceptance:**
  - `pnpm install --lockfile-only` produces a frozen lockfile covering `@marketplace/web`, `@marketplace/api`, `@marketplace/shared`, and `@marketplace/template-factory` without changing any package manifest.
  - Turbo runs dependency-aware `build`, `lint`, `typecheck`, and `test` tasks across all four packages with cache outputs appropriate to Next.js, NestJS, and coverage artifacts.
  - CI installs with `--frozen-lockfile` and gates pull requests plus pushes to `main`/`develop` on `pnpm turbo run lint typecheck test` using Node.js 20 and pnpm 9.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass from the repository root; CI workflow syntax is valid.
- **Skills:** git-workflow
- **Depends:** T-a463b5, T-6c8d2e, T-13ab58, T-2f2057, T-9e4c1a

---

## Layer completion gate

Do not create or start Layer 1 until every task above is `done`, the root
lint/typecheck/test commands pass, and the external Docker build checks have
been reported green. Then run `/next-layer` so the next scope-planning pass can
derive the first product layer from the approved design and the foundation that
actually shipped.
