# Session Handoff — KITVERA Template Marketplace

**Date:** 2026-08-02 · **Branch:** `main` · **HEAD:** `279bfa4` · **Tree:** clean · **CI:** green

This handoff lets a fresh session continue without the prior conversation. Read
this, then `CLAUDE.md` + `docs/WORKFLOW.md`, then act.

---

## 1. Where we are

**Layer 7 — Commerce Wave 1 (core purchase path) is COMPLETE** and recorded in
`tasks/done.md`. Layers 0–7 are all done. The project drives the
`Phase-0 → scope-breakdown → layer-loop` workflow in `docs/WORKFLOW.md`.

- All 11 Layer-7 tasks: done, code-review + security-review clean, merged to `main`.
- Local suites green: `@marketplace/shared` 116, `@marketplace/web` 249,
  `@marketplace/api` 111 (its 7 integration suites self-skip locally without a DB).
- CI (`ci.yml`) runs the commerce/entitlements/composed-flow integration suites
  against disposable Postgres — **green** on `fc5fd8c` and `279bfa4`.
- The Playwright happy-path e2e (`apps/web/e2e/commerce.spec.ts`) is authored and
  static-valid; **its full browser run is an out-of-session terminal step** (the
  `playwright test` command is blocked in-session by a hook). Running it is
  optional-but-recommended to bank the cross-viewport + axe confirmation.

**What shipped in Wave 1:** `POST /v1/checkout` (server-computed money, immutable
`OrderItemSnapshot`s, idempotent), `POST /v1/payment-attempts/:id/settle`
(atomic settle→entitlement, disabled outside non-prod), `GET /v1/orders[/:id]`,
`GET /v1/account/library`, `POST /v1/entitlements/:id/download` (single-use
short-TTL HMAC signed URL + keyed IP-digest audit + access-log token redaction),
`GET /v1/downloads/token/:token` (dev/CI adapter). Web: commerce client +
client-only cart, cart page + add-to-cart, checkout dialog/sheet + result,
account orders/library/download.

---

## 2. THE DECISION for the next session

The next layer is a **product-priority choice** — three approved designs + deferred
commerce Wave 2 each feed a **separate `/scope-breakdown` pass**:

| Option               | Design doc                                                  | What it builds                                                                            |
| -------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Commerce **Wave 2**  | `docs/specs/2026-07-31-commerce-purchase-surface-design.md` | wishlist, coupons/referrals, `POST /v1/discount-quotes`, verified-purchase reviews        |
| **Seller** authoring | `docs/specs/2026-08-01-seller-authoring-design.md`          | first-party authoring role, submit-for-review, Artifact/BuildRun, external-factory builds |
| **Admin** surface    | `docs/specs/2026-08-01-admin-surface-design.md`             | single admin role, prod-flag-gated MFA, append-only audit, sequenced breadth              |

**To start any of them:** `/scope-breakdown` on the chosen design → it generates
`tasks/layer-8-todo.md` → then run the layer loop (below). No recommendation is
locked; ask the user which to prioritize.

**Recommended housekeeping BEFORE the next layer:** `/checkpoint` (refresh
`CHECKPOINT.md`), then `/learn` (capture the gotchas in §5 into `.learnings/`).

---

## 3. The layer loop that worked (repeat it)

For each dependency round in `tasks/layer-N-todo.md`:

1. Mark each round's independent (non-overlapping-Files, deps-satisfied) tasks
   `in-progress`; commit; push.
2. Fan out one `task-implementer` **per task** with `isolation: "worktree"`,
   background, parallel. **Prompt each to commit incrementally** (a mid-session
   process restart earlier wiped uncommitted worktree work).
3. When all land: merge each branch into `main` linearly (`git worktree remove
--force <path>`; `git merge --ff-only` the first, `git rebase main <branch> &&
git merge --ff-only` the rest — files are disjoint so rebases stay clean);
   **run `pnpm --filter … typecheck`/`test` on the MERGED tree** (isolation hides
   cross-task integration bugs — see §5).
4. Set tasks `review`; run `code-reviewer` **and** `security-reviewer` (parallel)
   on the merged diff. Fix-forward real findings (delegate the fix to one
   implementer, or inline for tiny ones); re-verify; set `done`.
5. Push. Repeat for the next round.

Then `/next-layer` (gate on green tests/CI → append to `done.md` → bump the
`CLAUDE.md` pointer). Then `/checkpoint` + `/learn`.

---

## 4. Non-blocking backlog (candidates for `/refine`)

- **Library shows `productId`, not a product title** — `entitlementSchema` carries
  no title; the library list renders a truncated UUID. Needs entitlement
  enrichment or a by-id product lookup (catalogue reads are by-slug today).
- **Multi-currency checkout** — Wave-1 checkout is **VND-only** (the
  `checkoutRequestSchema` has no currency; server computes VND). The storefront
  USD toggle is browse-only; cart/checkout are pinned to VND with a note. Real
  multi-currency belongs to the payments wave (needs a currency field on the
  contract + real payment).
- **Re-purchase version semantics** — `Entitlement @@unique([userId, productId])`
  - settle's `skipDuplicates` means re-buying an owned product at a new version
    grants nothing / doesn't upgrade the entitlement version. Undefined in the
    design; decide upgrade-vs-block.
- **DRY** — `parseRequest` is duplicated across 4 API controllers; the base64url
  cursor codec + keyset filter is duplicated between `orders`/`entitlements`.
- **CI redundancy** — `ci.yml` sets job-level `DOWNLOAD_TOKEN_HMAC_SECRET`/
  `LOCAL_ARTIFACT_STORAGE_DIR` that `apps/api/package.json`'s test script already
  provides (shadowed, harmless).
- **e2e viewport coverage** — `commerce.spec.ts` is pinned to the 320 + 1440
  extremes (2 of 5 projects) to stay under the auth rate-limit budget; a
  `playwright.config.ts`-scope follow-up could give commerce its own project(s).

## Go-live blockers (by design, unchanged)

Payment production + signature-verified webhook · object-storage provider (S3/R2
presigned; local adapter only today) · production admin MFA enforcement ·
template inventory production (≥80 real products).

---

## 5. Gotchas / learnings (feed these into `/learn`)

- **`ConfigModule.forRoot({ validate })` freezes validated config at import time**,
  not at `TestingModule#compile()`. To boot a second app with a different
  `NODE_ENV` (e.g. the production-settle-guard test), use `vi.resetModules()` +
  dynamic re-import of `AppModule` and every DI-token class. (`apps/api/test/
commerce-flow.integration.test.ts`.)
- **One dedicated disposable Postgres DB per integration suite** — never share a
  DB across suites (`COMMERCE_/ENTITLEMENTS_/COMMERCE_FLOW_INTEGRATION_DATABASE_URL`).
- **Merge-verify on the combined tree.** Task-implementers pass in isolation but
  cross-task contract drift only surfaces after merge — e.g. the download body
  (`{productId, version}`) the API required vs the web client omitting it (fixed
  via a shared `downloadIssueRequestSchema` SSOT); and env-var additions in one
  task breaking another's test `Env` literal. Always run merged typecheck/test.
- **Heavy-build hook** blocks `next build` / `vite build` / `docker build` /
  `docker compose build` / `playwright test` in-session — run those in a real
  terminal, paste back only errors.
- **Worktree agents** start with no `node_modules` — they run `pnpm install`
  (fast via the pnpm store). Commit incrementally so a restart can't wipe work.
- **`pnpm/action-setup` + `packageManager`**: never add `with: version:` in a
  workflow when the root `package.json` pins `packageManager` (fails CI).
- **Semgrep**: don't re-add `p/nodejsscan` (false positives); `.semgrepignore`
  uses an exclude-list, not whitelist-negation (which scans 0 files).
- **Delegation model**: keep the controller lean by delegating implementation +
  fixes to worktree subagents; the controller only orchestrates (merge/review/
  bookkeeping). This is how Layer 7 was built without overflowing context.

---

## 6. How to resume (concrete)

```bash
# sanity
git -C /Users/nguyenthanh/Documents/prj_web_template status
git log --oneline -5
gh run list --workflow=ci.yml --limit 3   # confirm green

# optional: run the e2e in a real terminal (out-of-session) to bank the flow
#   (needs served web+api + disposable Postgres + the local StoragePort adapter;
#    see apps/web/e2e/README.md for env: DOWNLOAD_TOKEN_HMAC_SECRET,
#    LOCAL_ARTIFACT_STORAGE_DIR, the seeded purchasable product)
```

Then, in a Claude session with this repo:

1. `/checkpoint` → `/learn`.
2. Ask the user which next layer (Wave 2 / seller / admin).
3. `/scope-breakdown` on the chosen `docs/specs/*` design → `tasks/layer-8-todo.md`.
4. Run the layer loop (§3).

**Do not** touch `apps/*` for a surface that has no approved spec — the Phase-0
gate + `docs/specs/` are the source of truth.
