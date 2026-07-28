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

   **Gate status (2026-07-28):** the **Gitleaks** secret scan now runs
   _without_ `continue-on-error` — a committed credential fails CI, enforcing
   the "no hard-coded secrets" discipline gate. **Semgrep** and **`pnpm
audit`** stay `continue-on-error` pending a confirmed-clean baseline.
   `pnpm audit --audit-level=high` currently reports 11 distinct advisories
   (1 critical / 7 high / 3 moderate) — mostly dev tooling (`vitest`, `vite`,
   `postcss`, `esbuild`, `brace-expansion`), plus two runtime-reachable
   (`find-my-way`, Fastify's router; `sharp`, Next.js image optimization).
   Making the audit blocking as-is would fail every PR against a
   correctly-working tree, so it is deferred to a dedicated
   dependency-hardening pass that updates what has a patched version and
   records any residual advisory as a dated `pnpm.auditConfig.ignoreGhsas`
   exception with rationale — both touch `package.json`/the lockfile, outside
   this workflow's own scope. Semgrep's baseline stays unconfirmed until the
   workflow runs once against real source. Escalate each to blocking only
   against its own clean-or-excepted baseline.

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
