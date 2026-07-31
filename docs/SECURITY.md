# Security

This template's security posture in one place: the standards it verifies
against, the tools that check for what a human/agent review misses, and the
point in the workflow each one runs.

## Standards

**OWASP ASVS** (Application Security Verification Standard) is the single
standard for both apps — it covers web clients and their back ends, so every
finding across `apps/web` and `apps/api` maps to an ASVS chapter/category.

- **`apps/api`** — authentication, access control, input validation, and
  injection findings map to their ASVS category. Used throughout
  `backend-auth-security` and `security-review`.
- **`apps/web`** — browser-side controls map to ASVS too: Content Security
  Policy and security headers, session management (httpOnly/`Secure`/
  `SameSite` cookies vs. token storage), CSRF defenses, and output
  encoding/XSS prevention. Used throughout `web-security`. The OWASP
  **Cheat Sheet Series** (CSP, XSS Prevention, Session Management, CSRF
  Prevention) provides the concrete verification steps behind each control.

Every finding produced by `security-review` or `web-security` cites the
relevant ASVS category — a finding without one isn't tied to a verifiable
standard.

## Tool matrix

| Concern                             | Tool                   | Notes                                                                                                                                                                                                   |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web + NestJS SAST (static analysis) | Semgrep or CodeQL      | Runs against source in CI; catches pattern-level issues (injection, unsafe deserialization, dangerous DOM sinks) `security-review`'s manual trace complements but doesn't replace.                      |
| Dependency vulnerabilities          | Dependabot or Renovate | Automated PRs for outdated/vulnerable `package.json` dependencies across the workspace.                                                                                                                 |
| Committed secrets                   | Gitleaks               | Scans git history/diffs for credential-shaped strings before they land on `main`.                                                                                                                       |
| Container/IaC                       | Trivy                  | Scans both Docker images (`apps/web` built in `web-build.yml`, `apps/api` built in `api-deploy.yml`) and any IaC for known CVEs/misconfiguration.                                                       |
| Running web app + API               | OWASP ZAP              | Dynamic scan (DAST) against a **running** `apps/web` and `apps/api` — spiders the deployed web app and probes the API, checking headers/CSP/cookies live. Needs a live target, see workflow note below. |

## Workflow — where each step runs

1. **Threat-model the feature** — `security-threat-model` (STRIDE + trust
   boundaries), during Phase 0/brainstorming or `/refine`, before code exists.
2. **Implement the NestJS API** — guards, DTOs, scoped Prisma queries per
   `backend-auth-security` and `database-orm`.
3. **Implement the web client** — Content Security Policy and security
   headers, httpOnly/`Secure`/`SameSite` session cookies, CSRF defenses, and
   output encoding/XSS prevention per `web-security`.
4. **`security-review` on the diff** — high-confidence findings before merge,
   complementing `code-reviewer`'s correctness/simplification pass.
5. **Run scanners in CI** — `.github/workflows/security.yml` (Gitleaks
   secret scan, Semgrep SAST against `p/typescript p/javascript
p/owasp-top-ten p/nodejsscan`, and `pnpm audit --audit-level=high` for
   dependency vulnerabilities) plus `.github/dependabot.yml` (weekly `npm`
   updates for the workspace root, `apps/web`, `apps/api`,
   `packages/shared`, and weekly `github-actions` updates). All
   source/dependency-level, no running app or build artifact required, so
   this fits the "no heavy builds in CI" rule this template otherwise
   enforces (`CLAUDE.md`'s Token discipline section).

   **Gate status (2026-07-29):** **Gitleaks** and the **`pnpm audit`**
   dependency scan both run _without_ `continue-on-error`, so a committed
   credential or a NEW high/critical dependency advisory fails CI. The audit
   baseline (assessed 2026-07-28) carried 11 advisories and was cleared as
   follows: the runtime-reachable ones — `find-my-way` (Fastify's router) and
   `sharp` (Next.js image optimization) — plus `postcss` were bumped to
   patched versions via `pnpm.overrides` (root `package.json`); the residual
   six dev-tooling advisories, whose fixes are major-version bumps deferred to
   avoid destabilizing the test/build toolchain and which are not reachable in
   the production runtime, are recorded as dated `pnpm.auditConfig.ignoreGhsas`
   exceptions in the root `package.json` and tracked by Dependabot —
   `GHSA-5xrq-8626-4rwp` (`vitest`, critical), `GHSA-fx2h-pf6j-xcff` and
   `GHSA-4w7w-66w2-5vf9` (`vite`), `GHSA-67mh-4wv8-2f99` (`esbuild`),
   `GHSA-mh99-v99m-4gvg` (`brace-expansion`), and `GHSA-v6wh-96g9-6wx3`
   (`launch-editor`, pulled via vite's error overlay). Revisit
   those exceptions when the toolchain is next upgraded. Because `ignoreGhsas`
   mutes a GHSA graph-wide, the `dependency-audit` job also runs
   `scripts/audit-ignores-are-dev-only.mjs` after the audit: it re-audits only
   the production graph with the ignores disabled and fails the build if any
   excepted advisory is ever reachable through a runtime dependency, so a
   global-scope ignore can never silently mask a production vulnerability.
   **Semgrep** now gates too. It was advisory because a full run against the
   whole repo with `p/nodejsscan` reported 52 findings that triage (2026-07-31)
   showed were **all false positives** — `p/nodejsscan` (njsscan) noise on
   first-party code (a variable merely named `secret` read from config, `===`
   against `null`, a bounded fixed-length regex read as ReDoS, test-fixture
   UUIDs), findings inside the vendored `.claude/skills/` scripts, and
   opinionated supply-chain/CI policy suggestions (pin GitHub Action SHAs,
   npm/pnpm minimum-release-age cooldowns, pnpm trust policy) — never a real
   vulnerability. The `semgrep` job now runs `semgrep scan` **without**
   `continue-on-error`, scoped to `apps/` + `packages/` (explicit targets, plus
   a repo-root `.semgrepignore`) with `p/nodejsscan` dropped; the remaining
   rulesets (`p/typescript`, `p/javascript`, `p/owasp-top-ten`) run clean on
   first-party source, so any new finding blocks the merge. Adopting the
   supply-chain/CI hardening the excluded policy rules suggest (pinning action
   SHAs, pnpm release-age/trust policy) stays a separate decision.

6. **Deploy, then scan the running app** — OWASP ZAP against the
   deployed/running `apps/web` and `apps/api`, at release time.

## ZAP is a manual, release-time step — not CI

Unlike the scanners in step 5, **ZAP is not run in this template's CI**: it
needs a running target to point at. This template's CI (`ci.yml`) runs
`lint`/`typecheck`/`test` against source — it never boots a live,
network-reachable instance of the web app or the API for a scanner to hit.
Standing one up means the Docker builds in `web-build.yml`/`api-deploy.yml`
and an actual deploy, which is exactly the "heavy build" work this template's
CI and `block-build-output.sh` hook deliberately keep out of routine sessions
(`CLAUDE.md`'s Token discipline section, `docs/CI_CD.md`).

Run ZAP manually (or from a separate, deliberately-triggered pipeline) at
release time: spider the deployed web app and probe the API on a staging
deployment before promoting to production.

## Skills

- `security-threat-model` — run before a large feature is built.
- `backend-auth-security` — apply while building the NestJS API.
- `web-security` — apply while building the web client.
- `security-review` — run on the diff before merge.
