# Session Handoff — Layer 9 (Admin Surface) ready to build

**Date:** 2026-08-03 · **Branch:** `main` · **HEAD:** `55d6ba3` · **Tree:** clean · **CI:** green

Fresh session: read `CHECKPOINT.md`, then `tasks/layer-9-todo.md`, then act. This
file is the one-screen orientation.

---

## Where we are

- **Layers 0–8 DONE.** Layer 8 (Seller Authoring) shipped, CI-green, recorded in
  `tasks/done.md` + `CHECKPOINT.md`.
- **Layer 9 (Admin Surface, first pass) is SCOPED** in `tasks/layer-9-todo.md` —
  12 tasks, 5 rounds. Nothing implemented yet; all tasks `Status: todo`.
- Admin is the **approval half** of Layer 8's state machine: seller does
  `draft→in_review`; admin does `in_review→approved`, flips `PublicationState
draft→published`, may `delist`. **Reuse Layer 8's `ReviewState`/
  `PublicationState`/`Artifact` shapes exactly — no parallel state model.**

## First action

`/run-layer` for **Round 1** (two parallel, disjoint-file tasks):

- `T-e1b7a4` — shared `@marketplace/shared/admin` Zod contracts
  (`packages/shared/src/admin.ts` + test + index + package.json)
- `T-7f3c92` — Prisma `AdminAuditLog` + MFA models (`AdminMfaFactor` encrypted
  secret, `AdminMfaRecoveryCode` hashed) + admin-role seed + migration
  (`apps/api/prisma/schema.prisma` + a `20260803…_admin_surface` migration)

They don't depend on each other; fan out one worktree-isolated `task-implementer`
each.

## The layer loop that worked (repeat per round)

1. Mark the round's tasks `in-progress` in `tasks/layer-9-todo.md`; commit; push.
2. One worktree per task (`git worktree add -b layer9-<id> ../wt-<id> main`),
   dispatch one `task-implementer` each (background, parallel). **Prompt each to
   commit incrementally** and to `pnpm install` + `prisma generate` first.
3. Merge each branch into `main` linearly (remove worktree; `merge --ff-only`
   the first; `git rebase main <branch> && merge --ff-only` the rest — files are
   disjoint so rebases stay clean).
4. **Merged-tree verify** (this is where cross-task drift surfaces — see gotchas):
   `pnpm --filter … typecheck/test`, and for API run the new integration suites
   against a disposable `postgres:16-alpine` (self-skip locally without the DB).
5. Set tasks `review`; run `code-reviewer` + `security-reviewer` (parallel) on the
   round diff. Fix-forward real findings (inline for tiny, delegate for bigger);
   re-verify; set `done`; push.
6. Repeat. After Round 5: `/next-layer` (gate on CI green → append `done.md` →
   bump `CLAUDE.md`), then `/checkpoint` + `/learn`.

Round order: R1 contracts+prisma → R2 `T-c4a8e0` security core (single task, the
spine) → R3 five parallel modules (mfa/review/publish/users/web-client) → R4
compose+shell → R5 CI gate+e2e. **R3 is a wide 5-way fan-out** — watch session
token pressure (`.learnings/parallel-worktrees.md`).

## Carry these gotchas (all bit us in Layer 8)

- **When you add a required env key** (this layer adds `ADMIN_MFA_ENFORCED`,
  `ADMIN_MFA_SECRET_ENCRYPTION_KEY`, `ADMIN_BOOTSTRAP_EMAILS`): grep EVERY test
  that builds a full `Env` literal and add it there too — a stale fixture passes
  only because Turbo caches it. Don't trust green CI; run a suspect suite directly
  against a disposable DB. (`.learnings/ci-gates.md`)
- **Zod↔Prisma enum drift** when a round splits shared + prisma in parallel; the
  union typecheck won't catch it, only review does. Give both R1 tasks the exact
  enum member lists (audit `action`/`targetType`, MFA `type`).
  (`.learnings/parallel-worktrees.md`)
- **Under Vitest, pass the schema explicitly to `ZodValidationPipe` per-param**
  and use `@Inject(Service)` — esbuild emits no `design:paramtypes`.
  (`.learnings/nestjs-zod.md`)
- **Seed the WHOLE guard.** `AdminRolesGuard` needs the `admin` role; the e2e
  seed must grant it. Same trap as the Layer-8 seller seed.
- **One disposable DB per integration file** (parallel Vitest). Layer 9 adds 6.

## Decisions already locked (do not relitigate)

- **6 per-suite integration DBs are intentional** (each proves distinct edge
  coverage; isolation is the learned-correct call). `T-f14b83` must **parallelize
  the `prisma migrate deploy` loop** in `ci.yml` so provisioning time stays flat
  (and fail the job if any migrate fails). Decided with the user 2026-08-03.
- **MFA:** TOTP secret **encrypted** at rest (verification needs it), recovery
  codes **hashed**; enforced only behind `ADMIN_MFA_ENFORCED` (on in prod, off in
  dev/test — mirrors the sandbox-settle `NODE_ENV` gate). Production admin MFA
  stays a go-live blocker; this layer does NOT lift it.
- **Admin bootstrap** via `ADMIN_BOOTSTRAP_EMAILS` startup path (audited), not a
  public endpoint.
- **Seller-role provisioning** (`T-d9017b`, deferred here from Layer 8): granting
  `seller` also upserts a minimal `SellerProfile` (guard needs both); revoke keeps
  the profile/products.
- **Excluded this layer** (spec §2 SEQUENCES/DEFERS): order/entitlement admin,
  discount management, review moderation, finer role split. Do NOT scope them.

## Verify-CI recipe (disposable Postgres, full env)

Heavy builds (`next build`/`vite build`/`docker build`/`playwright test`) are
hook-blocked in-session → out-of-session terminal steps. To run an API
integration suite locally: `docker run -d --rm -e POSTGRES_PASSWORD=postgres
-e POSTGRES_USER=postgres -p 55432:5432 postgres:16-alpine`, create+`prisma
migrate deploy` the DB, export the suite's `*_INTEGRATION_DATABASE_URL` + the full
env (`PUBLIC_WEB_ORIGIN`, all `*_SECRET`s distinct, `LOCAL_ARTIFACT_STORAGE_DIR`,
`FACTORY_INGEST_HMAC_SECRET`, and the new admin secrets), then `vitest run <file>`;
stop the container after. (The api `test` script in `apps/api/package.json`
exports most inline secrets.)
