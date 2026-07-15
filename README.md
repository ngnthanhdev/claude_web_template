# Claude Code Full‑Stack **Web** Template

A native‑first Claude Code starter template for building a **web app (Next.js or Vite + React) +
NestJS API** monorepo through a disciplined Brainstorm → Design → Layer → Implement → Test →
Checkpoint → Refine workflow.

## What this is

This repo is **not** a finished app — it's a template. It ships a complete pnpm + Turborepo
monorepo skeleton, plus a full Claude Code "native engine" (skills, subagents, slash commands,
hooks, `settings.json`) that drives you through building your own product from a one‑line idea to
a tested, CI‑gated codebase.

It is **native‑first**: instead of simulating the workflow with plain markdown instructions, it
uses Claude Code's own primitives — skills, subagents, slash commands, hooks, `settings.json`, and
Plan Mode — as the actual workflow engine.

`apps/web`, `apps/api`, and `packages/shared` ship **empty** (only a `.gitkeep` each). They are
scaffolded for real during your project's own **Layer 0**, once your design spec is approved — this
template only provides the monorepo configuration around them.

Unlike a stack that locks its whole client, the **web framework and styling are a Phase‑0 choice**:
each project picks **Next.js (App Router)** or **Vite + React (SPA)**, with **Tailwind CSS +
shadcn/ui** as the default styling recommendation. The authored web skills cover both framework
paths, and an animation skill bakes in **Framer Motion** recipes and taste guidance from day one.
The API (NestJS + Fastify + Prisma), `packages/shared` (zod), and the pnpm + Turborepo monorepo are
locked.

**HARD GATE:** no code, no scaffolding, no `apps/*` changes before a design spec has been written to
`docs/specs/` and approved by you. A fresh clone has an empty `docs/specs/`, which is exactly what
triggers Phase 0 automatically the moment you open the repo in Claude Code.

## Requirements

- [Claude Code](https://docs.claude.com/claude-code) — CLI, desktop app, web (claude.ai/code), or IDE extension. This is the engine that runs the template's workflow (skills, subagents, slash commands, hooks); it's a build/assist dependency, not a runtime one — the web app and NestJS API you produce run without it.
- Node.js ≥ 20
- pnpm (`npm install -g pnpm@9` if you don't have it)
- git
- Optional: Docker, for building/running the `apps/web` and `apps/api` images locally the same way CI does
- Optional: [`graphify`](https://github.com/Graphify-Labs/graphify) + [`uv`](https://docs.astral.sh/uv/) for the `/graph`
  command (codebase dependency graphing)

## Quick start

Three parts: **(1)** bootstrap the project in a terminal, **(2)** open it in Claude Code — pick
your surface, **(3)** drive the build. Steps 1 and 3 are identical everywhere; only *how you open
the project* (step 2) differs between the CLI, the desktop app, and an IDE extension.

### 1. Bootstrap the project (terminal, once)

```bash
git clone <this-template-url> my-app
cd my-app
./scripts/start-project.sh          # Windows: scripts\start-project.ps1  (or .bat)
```

The script asks for a project name and either an existing spec/brain‑dump file **or** a short
description, then writes `docs/BRIEF.md` (and `docs/SPECIFICATIONS.md` if you gave it a file) and
makes sure `docs/specs/` is empty — that emptiness is exactly what triggers Phase 0 later.

> You only run this once, in a terminal, no matter which Claude Code surface you use next.

### 2. Open the project in Claude Code

Do **one** of the following. In every case, opening the folder makes Claude read `CLAUDE.md`, whose
hard gate sees the empty `docs/specs/` and starts **Phase 0** automatically. If it doesn't kick off
on its own, just type `/phase-0`.

**A — Terminal (CLI)**

```bash
cd my-app
claude                              # starts a session in this folder
```

Claude reads `CLAUDE.md` on start → Phase 0 begins in the terminal.

**B — Desktop app (macOS / Windows)**

1. Open the Claude Code desktop app.
2. **Open / add** the `my-app` folder as the project (so the app's working directory *is* the repo root).
3. Start a new session in that folder → `CLAUDE.md` loads → Phase 0 begins.

**C — IDE extension (VS Code / JetBrains)**

1. Install the **Claude Code** extension (VS Code Marketplace or JetBrains Plugins).
2. Open the `my-app` folder in the IDE.
3. Open the Claude Code panel and start a session → `CLAUDE.md` loads → Phase 0 begins.

### 3. Drive the build (same on every surface)

1. **Phase 0 (design).** Claude brainstorms your idea **one question at a time**, proposes a few
   approaches, and writes an approved design to `docs/specs/`. 🔒 **HARD GATE** — nothing is coded
   or scaffolded until you approve.
2. **`/scope-breakdown`** — turns the approved design into `tasks/layer-0-todo.md` (the foundation layer).
3. **`/run-layer`** — implements the current layer with worktree‑isolated `task-implementer`
   subagents, then `code-reviewer` + `security-reviewer`.
4. **`/next-layer`** — once the layer's tests pass, advances to the next layer. Repeat 3–4 until done.
5. **Between layers:** `/checkpoint`, `/learn`, `/graph`.
6. **Later bugs/features:** `/refine` (brainstorm → `tasks/layer-refinement-todo.md`).

### 4. (Optional) Watch progress on the task board

In a **separate** terminal, from the repo root:

```bash
pnpm board                          # → http://127.0.0.1:<port>  (prints the project name + URL)
```

A realtime kanban over `tasks/*.md`. Drag a card into **Ready** to queue it for the AI, then run
`/run-task` in your Claude Code session to have it picked up. Running several projects at once is
fine — each board auto‑picks a free port and shows its project name (see `tools/board/README.md`).

## Repo structure

```
claude_web_template/
├── CLAUDE.md                     # Source of truth; kept lean, @-imports sub-guides
├── README.md                     # Human-facing intro + how to start
│
├── .claude/
│   ├── settings.json             # hooks + permissions + env (committed)
│   ├── settings.local.json.example
│   ├── skills/                   # authored + vendored external skills
│   ├── agents/                   # subagent definitions
│   ├── commands/                 # slash commands
│   └── hooks/                    # hook scripts referenced by settings.json
│
├── docs/
│   ├── BRIEF.md  PRD.md  ARCHITECTURE.md  SCOPE_BREAKDOWN.md
│   ├── WORKFLOW.md  CI_CD.md  CONTINUOUS_LEARNING.md  GRAPH.md
│   ├── SECURITY.md               # web/backend OWASP ASVS standards, tool matrix, workflow
│   ├── EXTERNAL_SKILLS.md        # provenance/version/license of vendored skills
│   ├── specs/                    # design docs land here (empty until Phase 0 runs)
│   └── phases/phase-0.md
│
├── tasks/
│   ├── layer-0-todo.md  layer-refinement-todo.md  done.md
│
├── .learnings/.gitkeep
│
├── apps/
│   ├── web/.gitkeep              # web app (Next.js or Vite + React) — scaffolded in Layer 0
│   └── api/.gitkeep              # NestJS backend — scaffolded in Layer 0
├── packages/
│   └── shared/.gitkeep           # shared zod schemas + types + config
│
├── .github/workflows/
│   ├── ci.yml  security.yml  web-build.yml  api-deploy.yml
│
├── tools/
│   └── board/                     # realtime task-board dashboard (`pnpm board`)
│
├── scripts/
│   ├── start-project.sh / .ps1 / .bat   checkpoint.js
│
├── CHECKPOINT.md                 # generated after each layer
├── package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
├── .env.example  .gitignore
```

## Workflow summary

```
Fresh clone (no design in docs/specs/)
  → PHASE 0 (Plan Mode, HARD GATE): /phase-0 → brainstorming skill → design doc → user approve
  → SCOPE BREAKDOWN: /scope-breakdown → scope-planner → tasks/layer-*.md
       (Layer 0 = scaffold web app + API + shared + base config + CI)
  → LAYER LOOP (per layer):
       /run-layer → task-implementer (per-task worktree) → merge → code-reviewer → test-writer
       /next-layer  [gate: all tests pass]
  → BETWEEN LAYERS: /checkpoint → CHECKPOINT.md (+ compact context); /learn; /graph
  → REFINEMENT: user reports bug/feature → /refine → brainstorm → layer-refinement-todo.md → implement
```

Three discipline gates hold this together: (1) no code before the spec is approved; (2) no
advancing to the next layer before its tests pass; (3) no hard‑coded secrets — use `.env` /
`packages/shared/config` only. See `docs/WORKFLOW.md` for the full guide.

## Slash commands

| Command | What it does |
|---|---|
| `/phase-0` | Enter Plan Mode, run the `brainstorming` skill, write the approved design to `docs/specs/` (HARD GATE — no code first) |
| `/scope-breakdown` | Dispatch the `scope-planner` subagent against the approved spec → create `tasks/layer-*.md` |
| `/pick-task` | Show the next task in the current layer and load its relevant skills |
| `/run-layer` | Fan out independent tasks in the current layer to worktree‑isolated `task-implementer` subagents, merge, then run `code-reviewer` |
| `/next-layer` | Verify the layer's tests pass, advance `tasks/done.md`, create the next layer, bump "Current Layer" in `CLAUDE.md` |
| `/checkpoint` | Generate `CHECKPOINT.md` (git log + `done.md` + key decisions) and compact context |
| `/learn` | Extract patterns/gotchas from the finished layer into `.learnings/` |
| `/graph` | Run `graphify` over the monorepo and summarize `GRAPH_REPORT.md` |
| `/refine` | Brainstorm a reported bug/feature, then append it to `tasks/layer-refinement-todo.md` |
| `/security-review` | Run `security-review` over a diff/PR/path → high-confidence security findings |
| `/threat-model` | Run `security-threat-model` on a named feature before implementation |
| `/board` | How to launch the realtime task-board dashboard (`pnpm board`, runs outside this session) |
| `/run-task` | Drain every `Status: ready` task across `tasks/*.md` via worktree‑isolated `task-implementer`s |

## Task dashboard

`tools/board/` is a small, dependency-light realtime kanban view over
`tasks/*.md` — a PM-facing dashboard, not part of the Claude Code engine.
Run it with:

```bash
pnpm board
```

then open `http://127.0.0.1:4319`. It renders the six `Status` columns
(Todo → Ready → In Progress → Blocked → Review → Done) as swimlanes grouped
by layer, updating live over WebSocket whenever `tasks/*.md` changes on
disk. Dragging a card into **Ready** is the "assign to AI" action — it
PATCHes that task's `Status`, and `/run-task` picks up whatever's sitting in
Ready next. The board only ever writes `Status`/`Assignee`; task content
stays owned by Claude. It's a plain Node process — start it in its own
terminal, not inside a Claude Code session (see `/board` and
`tools/board/README.md`).

## Skills

### Authored

| Skill | Purpose |
|---|---|
| `brainstorming` | Phase 0 loop: clarify → 2‑3 approaches → design doc |
| `web-app-foundation` | Web foundation: Next.js App Router OR Vite+React setup, providers, responsive app shell, path aliases |
| `web-responsive` | Multi-screen design: breakpoints, container queries, fluid type, responsive images, anti-patterns |
| `web-styling` | Tailwind + shadcn/ui, design tokens, dark mode, theming |
| `web-auth-state` | Auth flows, cookie/token session, protected routes, auth store consuming `@shared` contracts |
| `web-api-integration` | TanStack Query + typed client validating `@shared` zod contracts |
| `web-data-forms` | `react-hook-form` + zod forms, tables/lists, optimistic updates |
| `web-i18n-theme` | i18n + light/dark theme tokens |
| `web-testing-release` | Vitest + RTL unit, Playwright e2e (cross-viewport), Docker release checklist |
| `web-animations` | Framer Motion recipes (page/route transitions, scroll, gestures) |
| `motion-design-principles` | When/why to animate vs. restrain — the taste layer |
| `api-design` | REST resource design, pagination, error envelopes, versioning |
| `nestjs-backend` | Modules/DI/guards/pipes, Fastify adapter, `nestjs-zod` validation |
| `database-orm` | Prisma schema, migrations, `PrismaModule`/`PrismaService`, transactions |
| `backend-auth-security` | Guards + Passport, RBAC, CORS/CSRF, helmet, OWASP top‑10, BOLA/IDOR + mass‑assignment (ASVS) |
| `backend-testing` | Jest unit + Supertest integration against the Nest app |
| `shared-contracts` | `packages/shared` zod schemas as the web↔api single source of truth |
| `typescript-strict` | No `any`, narrowing, discriminated unions, `satisfies` |
| `git-workflow` | Conventional commits, branch naming, 1 commit = 1 task |
| `security-threat-model` | STRIDE + trust boundaries before a large feature (see `docs/SECURITY.md`) |
| `security-review` | Audit a diff/PR for high‑confidence security findings (OWASP ASVS) |
| `web-security` | Web hardening to OWASP ASVS: CSP, cookies, CSRF, security headers, XSS |

### Vendored (external, license‑preserved)

| Skill | Source | Why |
|---|---|---|
| `ui-ux-pro-max` | nextlevelbuilder/ui-ux-pro-max-skill | Visual design intelligence (styles, palettes, typography) |
| `ponytail` | DietrichGebert/ponytail | Code‑minimalism discipline (anti over‑engineering) |
| `graphify` | Graphify-Labs/graphify | Codebase knowledge graph — powers `/graph` (needs the `graphifyy` CLI) |

See `docs/EXTERNAL_SKILLS.md` for pinned commits, licenses, and re‑sync commands.

## Animation

Web motion is built on **Framer Motion**. `web-animations` is the recipe library (page/route
transitions, scroll‑driven reveals, layout animations, gesture interactions); `motion-design-principles`
decides *whether and how much* to animate a given interaction (honoring `prefers-reduced-motion`,
200–350ms durations, springs, and compositor‑friendly transforms) before `web-animations` is used to
implement it. The `web-app-foundation` skill wires the animation provider into whichever framework
(Next.js or Vite + React) the project chose in Phase 0.

## CI/CD

Four GitHub Actions workflows live in `.github/workflows/`:

- `ci.yml` — on every PR/push: `pnpm turbo run lint typecheck test`
- `security.yml` — on every PR/push: Gitleaks (secrets), Semgrep (SAST), `pnpm audit` (dependencies)
- `web-build.yml` — on push to `main` / manual dispatch: builds the `apps/web` Docker image; the
  actual hosting deploy step is a provider‑agnostic placeholder you fill in (mirrors `api-deploy.yml`)
- `api-deploy.yml` — on push to `main` / manual dispatch: builds the API Docker image; the actual
  hosting deploy step is left as a provider‑agnostic placeholder for you to fill in

`.github/dependabot.yml` runs alongside these: weekly `npm` updates across the workspace and
`github-actions` updates for the workflows themselves.

See `docs/CI_CD.md` for gate rules and the Docker deploy details.

## License

MIT
