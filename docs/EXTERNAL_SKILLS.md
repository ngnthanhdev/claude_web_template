# External skills — provenance and re-sync

This template vendors a small set of external, community-maintained skills
into `.agents/skills/` alongside the skills authored for this repo (Layers
1–3). Vendoring means the upstream skill content is copied in-tree, at a
pinned commit, with its license preserved — not installed as a live
dependency. This keeps the skill set reproducible (no surprise upstream
changes between sessions) and keeps attribution intact.

3 external skills are vendored. Everything else in `.agents/skills/` is
authored for this template.

## Vendored skills

| Skill | Source repo | Pinned commit | License | Re-sync command |
|---|---|---|---|---|
| `hallmark` | [ngnthanhdev/hallmark-next](https://github.com/ngnthanhdev/hallmark-next) | `ee88fb8d704299c935f92217143dcce752f0f08b` | See upstream repository | Install with Codex, then copy the installed `hallmark` skill into `.agents/skills/hallmark` and record the source commit in `.upstream-commit` |
| `ponytail` | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | `1b2760d384c44e573a9d8c7a729fac616e5c3a76` | MIT (top-level `LICENSE` file, copied verbatim) | `tmp=$(mktemp -d) && git clone --depth 1 https://github.com/DietrichGebert/ponytail "$tmp/ponytail" && rm -rf .claude/skills/ponytail && cp -R "$tmp/ponytail/skills/ponytail" .claude/skills/ponytail && ( cd "$tmp/ponytail" && git rev-parse HEAD ) > .claude/skills/ponytail/.upstream-commit && rm -rf "$tmp"` |
| `graphify` | [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | `53efaf89b68190d367feb73f9ef5dba15899377c` | MIT (top-level `LICENSE` file, copied verbatim) | `tmp=$(mktemp -d) && git clone --depth 1 https://github.com/Graphify-Labs/graphify "$tmp/graphify" && rm -rf .claude/skills/graphify && mkdir -p .claude/skills/graphify && cp "$tmp/graphify/graphify/skill.md" .claude/skills/graphify/SKILL.md && cp -R "$tmp/graphify/graphify/skills/claude/references" .claude/skills/graphify/references && cp "$tmp/graphify/LICENSE" .claude/skills/graphify/LICENSE && ( cd "$tmp/graphify" && git rev-parse HEAD ) > .claude/skills/graphify/.upstream-commit && rm -rf "$tmp"` |

Each vendored folder contains, in addition to the skill content:

- `SKILL.md` — valid frontmatter (`name:` + `description:`), required for
  Claude Code to discover and load the skill.
- `LICENSE` — the upstream license (copied verbatim where a `LICENSE` file
  existed upstream; reproduced with a provenance note where the repo only
  declared its license in prose — see the per-skill notes below).
- `.upstream-commit` — the exact commit the vendored copy was cut from. Diff
  against a fresh clone at this commit to see if upstream has drifted.

No skill was left install-only: all 3 requested skills are vendored in-tree at
the pinned revisions shown above. `graphify` is
the one exception to "no live dependency": the skill content itself is fully
vendored, but the skill is only *useful* once its companion CLI is installed
separately (see its per-skill note below) — it's a documentation/knowledge
skill wrapping an external runtime tool, not a self-contained skill like the
other two.

### Per-skill notes

- **`hallmark`** — the workspace copy comes from
  [ngnthanhdev/hallmark-next](https://github.com/ngnthanhdev/hallmark-next).
  It provides the anti-AI-slop design flow, audits, responsive rules, theme
  direction, and supporting references used by KITVERA. It replaces the
  previously vendored `ui-ux-pro-max` skill.
- **`ponytail`** — upstream repo ships the same "lazy senior dev" behavior as
  a skill, a slash command, and native integrations for several other coding
  agents (Cursor rules, Cline rules, Windsurf rules, OpenCode plugin, Gemini
  extension, Codex/Devin plugins, etc.), plus a family of sibling skills
  (`ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`,
  `ponytail-review`) not requested here. Only the Claude-Code-relevant piece
  was vendored: `skills/ponytail/SKILL.md`, which is already a complete,
  self-contained Claude Code skill (valid `name:`/`description:`/`license:`
  frontmatter, no external references). The plugin/hook/command scaffolding
  for other agents was left upstream, not vendored.
- **`graphify`** — upstream repo: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify).
  `SKILL.md` is copied from upstream `graphify/skill.md`; the `references/`
  directory is copied from upstream `graphify/skills/claude/references/`
  (8 files: extraction spec, query, update, output formats, hooks, add-watch,
  transcribe, github-and-merge); `LICENSE` is the upstream top-level file,
  copied verbatim. Unlike the other two vendored skills, `graphify` is not
  fully self-contained: the skill content only documents how to *use* the
  tool, and running it for real needs the `graphify` CLI on `PATH`, installed
  separately with `uv tool install graphifyy` (PyPI package name is
  `graphifyy`, double `y`; the command it installs is `graphify`). See
  `docs/GRAPH.md` for the full install/usage flow and `/graphify .` for the
  vendored skill's invocation.

## `ponytail` vs the built-in `/simplify` skill — when to use which

Both push toward less/simpler code, but they act at different points in the
workflow and with different scope:

| | `ponytail` (vendored) | `/simplify` (built-in) |
|---|---|---|
| **When it runs** | Proactively, while code is being written — a standing posture ("ACTIVE EVERY RESPONSE") that shapes the first draft of a solution. | Reactively, after a diff already exists — reviews changed code and applies fixes. |
| **Scope** | Any coding task, any file, before a line is written: "does this need to exist", stdlib-first, fewest files, YAGNI. | The current diff only: reuse, simplification, efficiency, and "altitude" cleanups on code that's already there. |
| **Output style** | Governs the *shape* of the solution itself (ladder of "simplest thing that holds"), plus terse output discipline (code first, ≤3 lines of explanation). | A review pass — reports/applies findings, doesn't dictate how the original code should have been written. |
| **Use when** | Starting a new task, feature, or fix, especially if there's a risk of over-engineering it from the outset, or the user says "keep it simple" / "lazy mode" / "yagni". | After implementation, before committing/PR — a final quality pass on a diff that's otherwise done, independent of whether ponytail was active while writing it. |

In short: reach for `ponytail` to shape how code gets written in the first
place; reach for `/simplify` to clean up code that's already written. They're
complementary, not redundant — running `/simplify` after a ponytail-written
diff is still useful (it catches leftover complexity ponytail's per-response
posture missed), and running ponytail doesn't replace a review pass before
merge.

## Recommended companion ClaudeKit skills (not vendored)

These are **not** vendored into this repo — they ship with ClaudeKit and are
available globally when it's installed. They complement the authored `web-*`
skills for the web-client work this template centers on; reach for them when
the situation below comes up:

- **`ck:web-design-guidelines`** — reviews UI code against the Web Interface
  Guidelines (accessibility, UX). Use it as the review pass on a screen the
  `web-responsive`/`web-styling` skills built.
- **`ck:ui-styling`** — deeper shadcn/ui + Tailwind component/theming
  recipes. Extends `web-styling` when a project leans hard on shadcn/ui.
- **`ck:web-testing`** — Playwright/Vitest/k6 patterns (flakiness, Core Web
  Vitals, load, a11y). Extends `web-testing-release` beyond the baseline.
- **`ck:react-best-practices`** — React/Next.js rendering and performance
  patterns. Use it when a component tree needs profiling or optimization.
- **`ck:web-frameworks`** — Next.js (App Router, RSC/SSR/ISR) and Turborepo
  depth. Use it for framework-specific caching/rendering questions the
  `web-app-foundation` fork raises.
- **`ck:frontend-design`** — turning designs/screenshots into polished
  frontend code. Use it when visual fidelity to a reference is the priority.

## Re-syncing a vendored skill

To pick up upstream changes, re-run that skill's re-sync command above, then
diff the result against the currently vendored folder before committing —
upstream authors may rename files, change frontmatter, or (as with
`hallmark`) restructure between releases.
After re-syncing, re-run the frontmatter check every vendored skill must pass:

```bash
for f in .agents/skills/*/SKILL.md; do
  grep -q "^name:" "$f" && grep -q "^description:" "$f" || echo "BAD: $f"
done
```

Commit format for a re-sync: `chore(skill): re-sync <name> to <short-sha>`.
