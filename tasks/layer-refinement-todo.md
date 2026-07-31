# Refinement backlog

Status: **2 tasks queued**

This file holds bug fixes and feature requests reported _after_ the initial
layers have shipped. It is never hand-written directly — `/refine` brainstorms
each reported item first (what's actually being asked, bug vs. feature, what
"done" looks like) and then appends it below using the task block format, so
refinement tasks stay implementable through the same `/run-layer` loop as any
other layer.

Do not add tasks here without going through `/refine` — the brainstorming
step is what keeps a one-line bug report from turning into an underspecified
task that a `task-implementer` can't act on.

---

### T-5c3e8a — Tune Semgrep to a clean baseline and make the SAST scan block merges

- **Status:** todo
- **Assignee:** ai
- **Files:** .github/workflows/security.yml, .semgrepignore (new), docs/SECURITY.md
- **Acceptance:**
  - The `semgrep` job scopes the scan to first-party source (`apps/` + `packages/`) and excludes vendored/generated paths (`.claude/`, `scripts/`, `tools/`) — via a repo-root `.semgrepignore` and/or the job's target/`--exclude` args — so vendored skill scripts never gate merges.
  - The `p/nodejsscan` ruleset (the njsscan false-positive source — a variable merely named `secret`, `===` timing, a bounded fixed-length regex read as ReDoS) is dropped or replaced; any residual code-level false positive is silenced with a justified, rule-scoped `// nosemgrep: <rule-id>` (never a blanket ignore), and no genuine finding is suppressed.
  - The opinionated supply-chain/CI policy rules (`package_managers.*`, `yaml.github-actions.*mutable-action-tag`) are excluded from the SAST gate; adopting those hardening measures (pinning action SHAs, pnpm release-age/trust policy) is a separate decision, not bundled here.
  - After tuning, the `semgrep` job runs WITHOUT `continue-on-error`, and a real `semgrep ci` run (terminal/CI, per the heavy-build rule) exits 0 against the current tree.
  - `docs/SECURITY.md`'s gate-status records Semgrep as a merge gate with its scoped rulesets.
- **Skills:** security-review, git-workflow

Follows `T-e72b45` (layer 6, which left Semgrep advisory). A full `semgrep ci` run on 2026-07-29 with the four configured rulesets reported 52 blocking findings that triage showed were all false positives (njsscan noise + vendored `.claude/skills/` scripts) or opinionated supply-chain/CI policy suggestions — no genuine vulnerabilities (see `docs/SECURITY.md` gate-status). This task makes the scan a real, tuned gate rather than flipping it blind.

### T-8b4a1f — Guard that the pnpm audit-ignore exceptions stay on dev-only paths

- **Status:** review
- **Assignee:** ai
- **Files:** scripts/audit-ignores-are-dev-only.mjs (new), .github/workflows/security.yml, docs/SECURITY.md
- **Acceptance:**
  - A new script (`scripts/audit-ignores-are-dev-only.mjs`) runs `pnpm audit --json` and, for every advisory listed in the root `package.json` `pnpm.auditConfig.ignoreGhsas`, asserts that **every** dependency path resolving it starts with a known dev-tool root (e.g. `vitest`, `vite`, `esbuild`, `@nestjs/cli`, `@typescript-eslint`, `eslint`) — exiting non-zero the moment an ignored advisory appears on a runtime path of `apps/api` or `apps/web`.
  - The `security.yml` `dependency-audit` job runs this guard as a step after `pnpm audit`, so a suppressed advisory becoming runtime-reachable fails the merge instead of passing silently through the global-scope `ignoreGhsas`.
  - `docs/SECURITY.md` documents the guard alongside the exception ledger.
  - The guard passes today (all six current exceptions are dev-only) and is verifiable against a fixture where an ignored GHSA sits on a runtime path (it must exit non-zero).
- **Skills:** security-review, git-workflow

From the `T-e72b45` security review (2026-07-29): pnpm's `ignoreGhsas` mutes an advisory across the whole dependency graph, not on the specific dev-only path. Today all six suppressed GHSAs (`vitest`, `vite`, `esbuild`, `brace-expansion`, `launch-editor`) resolve to test/build tooling, but a future runtime dependency pulling a vulnerable version would pass the now-blocking audit silently. This guard closes that gap.

---

<!--
Task block format used by /refine when appending below. One block per task —
a level-3 heading with a stable T-xxxxxx id, then a metadata list:

### T-a3f9c1 — <short imperative title>
- **Status:** todo        <!-- todo | ready | in-progress | blocked | review | done -->

- **Assignee:** ai <!-- ai | human, per what /refine decided -->
- **Files:** <the concrete paths this task is expected to touch>
- **Acceptance:** <checkable definition of done>
- **Skills:** <relevant .claude/skills/* to load, if any>
- **Depends:** <other T-xxxxxx in this file, omit if none>

<optional free-form notes below, e.g. bug-vs-feature context from the brainstorm>

A new task always starts at `Status: todo`, with `Assignee: ai` unless the
brainstorm surfaced a decision only a human can make (`Assignee: human`).

(Delete this comment block's content when the first real task is added; keep
the format itself as the template for every task appended after it.)
-->
