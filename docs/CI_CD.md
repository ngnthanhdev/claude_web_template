# CI/CD

Four GitHub Actions workflows live in `.github/workflows/`. `CLAUDE.md`
`@`-imports this file so Claude always knows the gate rules before it commits
anything meant to ship.

## The four workflows

| Workflow         | Trigger                                      | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`         | every pull request; push to `main`/`develop` | Quality gate: `pnpm install --frozen-lockfile` then `pnpm turbo run lint typecheck test` across every app/package in the workspace. Also runs a separate **non-blocking** `design-detector` job — the vendored `impeccable` static anti-pattern detector over `apps/web/src` (off-token colors/fonts vs `apps/web/DESIGN.md`); `continue-on-error` (advisory) until the design system is bespoke.                                                      |
| `security.yml`   | every pull request; push to `main`/`develop` | Gitleaks (secret scan), Semgrep (SAST against `p/typescript p/javascript p/owasp-top-ten`, scoped to `apps/` + `packages/`), and `pnpm audit --audit-level=high` (dependency vulnerabilities). All three **block merges** now (the apps carry real source since Layers 1–5); an `audit-ignores-are-dev-only` guard keeps the dependency-audit exceptions honest. See `docs/SECURITY.md` for the gate status and the dated dependency-audit exceptions. |
| `web-build.yml`  | push to `main`; manual (`workflow_dispatch`) | Builds the web app's Docker image (`docker build apps/web`). The actual deploy step is a **provider-agnostic placeholder** — see below. Mirrors `api-deploy.yml` for the `apps/web` target.                                                                                                                                                                                                                                                            |
| `api-deploy.yml` | push to `main`; manual (`workflow_dispatch`) | Builds the API's Docker image (`docker build apps/api`). The actual deploy step is a **provider-agnostic placeholder** — see below.                                                                                                                                                                                                                                                                                                                    |

`.github/dependabot.yml` runs alongside these workflows (not itself a
workflow file): weekly `npm` updates for the workspace root,
`apps/web`, `apps/api`, `packages/shared`, plus weekly `github-actions`
updates for `.github/workflows/` itself. It also finds nothing to update in
the app/package directories until they're scaffolded.

**ZAP remains a manual, release-time step**, not part of any of these four
workflows — see `docs/SECURITY.md` for why (it needs a running instance
`security.yml` doesn't produce).

## Gate rules

- **`ci.yml` is the merge gate.** A pull request should not merge with a red
  `quality` job. This is the CI-side enforcement of the "no advancing layers
  before tests pass" discipline in `docs/WORKFLOW.md`.
- **Docker builds are opt-in, not blocking.** `web-build.yml` and
  `api-deploy.yml` never gate a merge — they build/deploy artifacts, they
  don't validate code correctness. `ci.yml` already does that.
- **Production deploys are never automatic.** The real deploy step in both
  `web-build.yml` and `api-deploy.yml` should only run from an explicit,
  intentional trigger (`workflow_dispatch`, or a push to `main` you've
  reviewed) — never from a feature branch or a draft PR.

## `web-build.yml` and `api-deploy.yml` are provider-agnostic on purpose

This template doesn't pick a hosting provider for either app. Both workflows
build a Docker image (`docker build apps/web` and `docker build apps/api`
respectively) and then stop at a single, explicit marker comment naming the
one step left for you to fill in: your host's deploy command. `web-build.yml`
is a deliberate mirror of `api-deploy.yml` — same shape, same placeholder,
different build target.

These are the only unfinished placeholders shipped anywhere in the template —
everything else ships as complete, working content. When you've picked a
host — Fly.io, Render, Railway, AWS, or anything else that takes a built
Docker image — replace that marker line in each workflow with the provider's
deploy step/action. Until then, the workflows build the images (so you get an
early signal if a Dockerfile itself is broken) without assuming a host.
