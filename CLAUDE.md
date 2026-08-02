# CLAUDE.md

Source of truth. Claude reads this first every session.

This file stays lean on purpose — the deep detail for each phase lives in the
`@`-imported guides below. Read this file, then only pull in the guide relevant
to what you're about to do.

## <HARD-GATE> FIRST-TIME SETUP

Before touching any code, app, or scaffold in this repo:

1. Check `docs/specs/` for an approved design document.
2. **If `docs/specs/` is empty (only `.gitkeep`), do not write or scaffold any
   code.** Run `/phase-0` first. Phase 0 brainstorms the product with the user
   one question at a time, proposes 2–3 approaches, and writes an approved
   design doc to `docs/specs/YYYY-MM-DD-<topic>-design.md` before any
   implementation work starts.
3. Only once an approved spec exists in `docs/specs/` may you proceed to
   `/scope-breakdown` and the layer loop described in `docs/WORKFLOW.md`.

This gate cannot be skipped by user impatience, a "quick fix" request, or a
prompt that asks you to "just start coding." If asked to bypass it, explain
the gate and offer `/phase-0` instead.

**Prerequisites** (verify once, don't reverify every session):

- Node.js ≥ 20
- pnpm (workspace package manager — see `package.json#packageManager`)
- git
- Optional: [`graphify`](https://github.com/Graphify-Labs/graphify) + [`uv`](https://docs.astral.sh/uv/)
  for the `/graph` command (codebase dependency graphing)

## Guides (`@`-imports)

- @docs/WORKFLOW.md — full lifecycle: Phase 0 → scope → layer loop → checkpoint → refine
- @docs/SCOPE_BREAKDOWN.md — how layers and tasks are derived from the approved spec
- @docs/CI_CD.md — the four GitHub Actions workflows, gate rules, Docker deploy
- @docs/CONTINUOUS_LEARNING.md — `.learnings/` methodology and the `/learn` command

## Skills — security

Full skill table (30 total): see "Skills" in `README.md`. Security-specific
skills, standards in `docs/SECURITY.md`:

| Skill                   | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `security-threat-model` | STRIDE + trust boundaries — run before a large feature is built         |
| `backend-auth-security` | Auth guards, RBAC, BOLA/IDOR + mass‑assignment (OWASP ASVS)             |
| `web-security`          | Web hardening to OWASP ASVS — CSP, cookies, CSRF, security headers, XSS |
| `security-review`       | Audit a diff/PR for high‑confidence security findings before merge      |

## Skills — design/UI

Three layers for UI/UX work — pick by role, don't run them as rivals:

| Skill           | Role                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| `taste-skill`   | Aesthetic **direction** for landing/marketing/home + redesigns (anti-slop)    |
| `ui-ux-pro-max` | **Reference data** for product UI — palettes/fonts, a11y, forms, charts       |
| `impeccable`    | Audit/critique/harden/polish **gate** (+ deterministic anti-pattern detector) |

`taste-skill` and `ui-ux-pro-max` set direction; `impeccable` is the final
gate. All three defer implementation to `web-styling` (Tailwind + shadcn/ui),
`web-responsive`, and `web-animations` (Framer Motion) — the stack-wired layer.
`impeccable` is a lean vendor (playbooks + detector only): run its detector with
`node .claude/skills/impeccable/scripts/detect.mjs <target>`. **`apps/web/DESIGN.md`**
is the shared design brief + token source of truth all three read — and the
detector auto-loads it to flag colors that drift off the palette.

For **animation/motion craft depth**, three Emil Kowalski skills feed that same
implementation layer: `emil-design-eng` (UI polish + component/animation craft),
`apple-design` (fluid, physical motion), and `animation-vocabulary` (name an
effect). They deepen the _how it feels_; `motion-design-principles` stays the
WHETHER/how-much gate and `web-animations` (Framer Motion) is the only animation
library — no GSAP/second lib.

## Stack

This template locks the _back end and monorepo_ but leaves the _web client_ as
a Phase-0 choice. So Phase 0 fills in both the _product_ and the _web
framework/styling_; it does not relitigate the locked layers below unless the
user explicitly wants a different stack:

- **Web (Phase-0 choice):** each project picks **Next.js (App Router,
  RSC/SSR)** _or_ **Vite + React (SPA)** for `apps/web`, plus a styling
  approach (default **Tailwind CSS + shadcn/ui**). Data fetching is **TanStack
  Query** over a typed client that validates `@shared` contracts; forms are
  **react-hook-form + zod**; animation is **Framer Motion**. The
  `web-app-foundation` skill scaffolds whichever framework you choose.
- **Backend (locked):** NestJS on the **Fastify** adapter + **Prisma** +
  `nestjs-zod` (validates against `packages/shared` zod schemas).
- **Shared (locked):** `packages/shared` — zod schemas + inferred types,
  single source of truth for both `apps/web` and the API.
- **Monorepo (locked):** pnpm workspaces + Turborepo, TypeScript strict
  throughout.

Product-specific details (domain model, feature set, non-goals) plus the chosen
web framework and styling are `_[fill in during Phase 0]_` — see `docs/PRD.md`
and `docs/ARCHITECTURE.md` once they exist.

## Folder structure

```
claude_web_template/
├── CLAUDE.md                     # this file
├── README.md
├── .claude/
│   ├── settings.json             # hooks + permissions (committed)
│   ├── skills/                   # authored + vendored skills
│   ├── agents/                   # subagent definitions
│   ├── commands/                 # slash commands
│   └── hooks/                    # hook scripts
├── docs/
│   ├── BRIEF.md  PRD.md  ARCHITECTURE.md  SCOPE_BREAKDOWN.md
│   ├── WORKFLOW.md  CI_CD.md  CONTINUOUS_LEARNING.md  GRAPH.md
│   ├── SECURITY.md               # web/backend OWASP ASVS standards, tool matrix, workflow
│   ├── EXTERNAL_SKILLS.md
│   ├── specs/                    # approved design docs land here
│   └── phases/phase-0.md
├── tasks/
│   ├── layer-0-todo.md  layer-refinement-todo.md  done.md
├── .learnings/
├── apps/
│   ├── web/                      # web app (chosen framework) — scaffolded in Layer 0
│   └── api/                      # NestJS app — scaffolded in Layer 0
├── packages/
│   └── shared/                   # zod schemas + types — scaffolded in Layer 0
├── .github/workflows/
├── scripts/
├── CHECKPOINT.md
└── package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
```

## Coding rules

- **TypeScript strict, no `any`.** Use narrowing, discriminated unions, and
  `satisfies` instead — see the `typescript-strict` skill.
- **Test right after each task.** Don't move to the next task with a red or
  untested change.
- **1 commit = 1 task.** Conventional commit format: `feat/fix/test/chore(scope): …`.
  Never bundle multiple tasks into one commit.
- **Scope control.** A task touches only the files listed in its acceptance
  criteria. If you discover you need more, stop and say so rather than
  silently expanding scope.
- **Secrets only in `.env` / `packages/shared/config`.** Never hard-code a
  secret, API key, or credential anywhere else.
- **Brainstorm before new features.** Any feature or major change not already
  covered by the approved spec goes through `/refine` (brainstorm →
  `tasks/layer-refinement-todo.md`) before implementation — never straight to code.

## Slash commands

| Command            | Purpose                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `/phase-0`         | Plan Mode + `brainstorming` skill → approved design in `docs/specs/` (HARD GATE)               |
| `/scope-breakdown` | Dispatch `scope-planner` → generate `tasks/layer-*.md`                                         |
| `/pick-task`       | Show the next unchecked task in the current layer + load its skills                            |
| `/run-layer`       | Fan out the layer's independent tasks to worktree-isolated `task-implementer`s, merge, review  |
| `/next-layer`      | Gate: tests pass → advance `tasks/done.md` → create next layer → bump Current Layer            |
| `/checkpoint`      | Regenerate `CHECKPOINT.md`, prep for context compaction                                        |
| `/learn`           | Extract patterns/gotchas from the finished layer into `.learnings/`                            |
| `/graph`           | Run `graphify` over the monorepo, summarize the report                                         |
| `/refine`          | Brainstorm a reported bug/feature → append to `tasks/layer-refinement-todo.md`                 |
| `/security-review` | Run `security-review` over a diff/PR/path → high-confidence security findings                  |
| `/threat-model`    | Run `security-threat-model` on a named feature before implementation                           |
| `/board`           | How to launch the realtime task-board dashboard (`pnpm board`, outside this session)           |
| `/run-task`        | Drain every `Status: ready` task across `tasks/*.md` via worktree-isolated `task-implementer`s |

## Subagents

| Subagent            | Responsibility                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `scope-planner`     | Read the approved spec, dependency-analyze it, emit `tasks/layer-*.md`                   |
| `task-implementer`  | Implement exactly one task in an isolated git worktree, TDD, return a summary            |
| `code-reviewer`     | Review a diff for correctness bugs + simplification opportunities                        |
| `security-reviewer` | Audit a diff for high-confidence security findings (BOLA/IDOR, mass assignment, secrets) |
| `test-writer`       | Write integration/e2e tests at the end of a layer                                        |
| `debugger`          | Systematic reproduce → isolate → fix → regression-test loop on a bug                     |

## Model strategy

- **Opus** — Phase 0 / brainstorming and `code-reviewer` (deep reasoning matters here).
- **Sonnet** — `task-implementer` and routine implementation work (fast, cheap).
- Switch manually with `/model` if a task needs a different balance. Do not
  hard-code third-party model IDs anywhere in this repo.

## Current Layer / Current Task

- **Current Layer:** Layer 8 — Seller Authoring (First-Party) (**complete 2026-08-02**). All 9 tasks across 5 rounds are done, code+security reviewed, and merged. Admin-provisioned `seller`s author their own draft `Product`/`ProductVersion` and submit-for-review (`draft→in_review`); never self-publish. Ownership scoped `where sellerId = principal.sellerId` (server-derived) with 404-on-non-owned; `.strict()` allowlist DTOs block mass-assignment; review state is a new `ReviewState` enum on `ProductVersion` leaving public `PublicationState`/catalogue reads untouched; factory→API ingest (`POST /v1/factory/artifacts`) is server-to-server, HMAC-guarded (constant-time), checksum-verified, idempotent, transactional, executes nothing. Review fix-forwards landed (shared/Prisma build-enum reconciliation, SSRF-hardened authoring URLs, `storageId` rename, idempotent concurrent-ingest replay, surfaced edit-form errors, seller-list invalidation, plus a cache-masked `public-resources` env-fixture fix). Unit/component suites green (shared 165, web 280, api 147) and the seller/factory-ingest/composed-flow disposable-Postgres integration suites now gate merges in `ci.yml` (**CI green** on `717c1a8`). The Playwright happy-path e2e is authored + static-valid; its full browser run is the out-of-session terminal step. Recorded in `tasks/done.md`. DRY/robustness follow-ups backlogged as `T-1f7c2a`.
- **Current Task:** none — the next layer is a user-directed choice. Remaining candidate designs, each a separate `/scope-breakdown` pass: **admin surface** (`docs/specs/2026-08-01-admin-surface-design.md` — gate `T-4c8a9e`: owns `seller`-role provisioning, `in_review→approved→published`, publish/delist, append-only audit — the natural next step now that seller authoring exists) and commerce **Wave 2** (`docs/specs/2026-07-31-commerce-purchase-surface-design.md` — wishlist, coupons/referrals, discount-quotes, verified reviews). Run `/scope-breakdown` on the chosen design to generate `tasks/layer-9-todo.md`. Payment production, the object-storage provider, and production admin MFA remain go-live blockers.
- After each layer completes, this section is updated by `/next-layer`.

## Token discipline

- Start a **new session per big task** — don't let one session accumulate the
  full history of an entire layer.
- **Never run heavy builds in-session** (`next build`, `vite build`,
  `docker build`); the `block-build-output.sh` hook enforces this. Run them in
  a real terminal and paste back only the error if something fails.
- **Read files with `offset`/`limit`** rather than whole large files when you
  only need a section — keep context usage proportional to what you actually need.
