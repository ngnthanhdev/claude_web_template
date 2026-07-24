# next-intl message loading (App Router)

## 2026-07-24 — Directory-merge auto-discovery breaks in standalone Docker

`i18n/request.ts` auto-discovers namespaces via
`fs.readdirSync(process.cwd()/messages/<locale>)` and deep-merges them, so a
feature task can drop in `messages/<locale>/<ns>.json` without editing
`request.ts` (this avoids two parallel task worktrees both editing `request.ts`).
It works in `next dev` and Vitest (cwd = `apps/web`) but **500s in the
`output: "standalone"` Docker image**: cwd is `/app`, and node-file-trace can't
follow the dynamic path, so the raw `messages/` dir is neither traced nor
shipped. Fix with a triple backstop — `COPY apps/web/messages` into the **build**
stage (so the analyzable `import(\`../../messages/${locale}/${ns}.json\`)`glob has
files to bundle) **and** the runner stage, plus`outputFileTracingIncludes: { "/**": ["./messages/**/*"] }`. Only a real
`docker build` proves it (heavy-build rule blocks it in-session).

Note: the `.json` suffix must stay a static literal in the `import()` template so
the bundler resolves it as a context glob; folding it into the variable makes it
an unanalyzable fully-dynamic specifier.

Source: apps/web/src/i18n/request.ts, apps/web/next.config.ts, apps/web/Dockerfile
