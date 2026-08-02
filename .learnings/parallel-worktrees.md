# Parallel task-implementers (/run-layer worktrees)

## 2026-07-24 — A wide fan-out can exhaust the session token window; salvage, don't restart

A 5-wide parallel `task-implementer` fan-out (five heavy web screens at once)
burned through the session token limit mid-run — all five agents died with a
`session limit` API error at different stages. Recovery that worked: inspect each
worktree's `git status`; the two that had finished (green gate, uncommitted only
because the agent died before its commit step) were **verified + committed by
hand** (one needed a one-line typecheck fix); the three that crashed during
exploration (empty worktrees) were **re-dispatched fresh** in a smaller batch.
Prefer **≤2–3 concurrent heavy agents** per wave and bank completed worktrees
before launching the next batch, so a mid-wave limit hit costs little rework.

Also: when the layer's tasks touch disjoint directories, verify it before
merging (`git diff --name-only <base>..<branch>` piped to `sort | uniq -d` across
all branches should be empty) — clean merges are then guaranteed, but you must
still run the **union gate** in the main tree afterward, because no single
worktree tested the combined state.

Source: Layer 5 wave 2b (tasks/layer-5-todo.md)

## 2026-08-02 — The union gate catches cross-task CONTRACT drift, not just build breaks

Layer 7 fanned commerce across worktrees; two isolation-green tasks still
disagreed at the seam: the API download endpoint required a `{productId, version}`
body (its own controller test passed) while the web client sent none — a **422 at
runtime** no unit suite hit and the union _typecheck_ didn't catch (the web fetch
stub was permissive; only the e2e trace surfaced it). Fix: move the request shape
into a shared `downloadIssueRequestSchema` both sides import — **never leave a
request DTO local to the API for a client to mirror.** Corollary reconfirmed: a
mid-session process restart discards _uncommitted_ worktree work, so instruct
every implementer to **commit incrementally**, not only at the end.

Source: packages/shared/src/commerce.ts + apps/api/src/entitlements (layer-7 download-contract fix)
