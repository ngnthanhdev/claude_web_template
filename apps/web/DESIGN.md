---
name: Kitvera Web Template
description: Warm paper-and-ink surfaces, one confident vermilion accent, Geist type. Editorial restraint over decoration — not another generic SaaS gradient. Product-specific brand voice, audience, and anti-references are filled per project in Phase 0.

# The values below mirror apps/web/src/app/globals.css (the source of truth).
# If a token changes there, update this frontmatter too. Light mode only in the
# scaffold; dark mode is added per project via the web-i18n-theme skill.
colors:
  # Surfaces
  paper: "oklch(96.8% 0.009 62)" # page ground        → --color-background
  paper-raised: "oklch(99% 0.006 62)" # panels, inputs     → --color-muted
  # Text
  ink: "oklch(20.5% 0.008 48)" # foreground         → --color-foreground
  muted-ink: "oklch(45% 0.012 48)" # secondary text     → --color-muted-foreground
  # Lines
  rule: "oklch(84% 0.015 54)" # borders            → --color-border
  # Accent — a single brand color
  accent: "oklch(67.4% 0.185 37.5)" # vermilion          → --color-primary  (backgrounds / large text only — see Craft floor)
  accent-strong: "oklch(58% 0.19 37.5)" # hover / pressed    → --color-primary-strong
  accent-ink: "oklch(17% 0.012 38)" # text on accent     → --color-primary-foreground
  focus: "oklch(52% 0.2 37.5)" # focus ring         → --color-ring
  danger: "oklch(55% 0.2 25)" # destructive        → --color-destructive
  scrim: "oklch(18% 0.01 48 / 0.28)" # overlays

typography:
  display:
    fontFamily: "Geist, sans-serif" # headings           → --font-display
  body:
    fontFamily: "Geist, sans-serif" # body               → --font-body (Geist Sans)
  wordmark:
    fontFamily: "Geist Mono, monospace" # brand lockup, labels → --font-wordmark

rounded:
  control: "0.625rem" # buttons, inputs    → --radius-control
  panel: "0.75rem" # cards, panels      → --radius-panel
---

# Design system — Kitvera web template

The shipped design system for `apps/web`. Source of truth is
`apps/web/src/app/globals.css`; this file is the portable brief that the design
skills (`taste-skill`, `impeccable`) and the anti-pattern detector read, and the
place to record per-project brand decisions in Phase 0.

## Character

Warm paper surfaces (never pure white), near-black warm ink, one confident
vermilion accent, and Geist type. Editorial restraint over decoration: a single
accent, generous type, hairline rules, real hierarchy — no gradient soup, no
glassmorphism-by-default, no drop-shadow stacks doing a border's job.

## Tokens → semantics

Author with the **semantic** Tailwind tokens, never the raw palette or literal
colors. The raw scale (`--color-paper`, `--color-accent`, …) exists only to feed
the semantic layer in `globals.css`:

| Use            | Semantic token                           | Raw                     |
| -------------- | ---------------------------------------- | ----------------------- |
| Page ground    | `bg-background`                          | `paper`                 |
| Panel / input  | `bg-muted`                               | `paper-raised`          |
| Body / heading | `text-foreground`                        | `ink`                   |
| Secondary text | `text-muted-foreground`                  | `muted-ink`             |
| Border         | `border-border`                          | `rule`                  |
| Primary action | `bg-primary` + `text-primary-foreground` | `accent` / `accent-ink` |
| Focus ring     | `ring-ring`                              | `focus`                 |
| Destructive    | `text-destructive`                       | `danger`                |

Radii: `rounded-[var(--radius-control)]` for controls, `--radius-panel` for
cards/panels. Do not introduce ad-hoc radii.

## Type

Geist Sans for display **and** body; Geist Mono for the wordmark/labels only.
Note: **Geist is a common "scaffold" face** — the anti-pattern detector flags it
as over-used. That flag is _acceptable while Geist is the deliberate default
declared here_, but for a distinctive product — especially marketing surfaces —
reconsider the display face in Phase 0 (see fills below). Never let the visible
face fall back to Inter / Roboto / Arial.

## Motion

**Framer Motion is the only animation library** (via `web-animations`) — no
GSAP, no second lib. Gate every effect through `motion-design-principles`
(whether/how-much) and lean on the craft depth in `emil-design-eng` /
`apple-design`. Every animation ships a `prefers-reduced-motion` fallback.

## Craft floor (anti-slop — enforced)

Non-negotiable, and mostly checkable by the detector
(`node .claude/skills/impeccable/scripts/detect.mjs <target>`):

- **Contrast.** Body/UI text ≥ 4.5:1, large text ≥ 3:1. The vermilion `accent`
  (oklch 67.4%) does **not** pass as small text on paper (~2.9:1) — use
  `text-foreground` for text links/controls and reserve the accent for
  backgrounds and large type. _(This is the exact defect the e2e caught on the
  "Clear filters" control.)_
- **Color.** Semantic tokens only; no raw hex/oklch literals in components; one
  accent; no purple→indigo AI gradient; no gray text on colored fills.
- **Type.** Only the declared Geist faces are visible; no ambient
  Inter/Roboto/Arial.
- **Copy.** All UI strings through next-intl (`vi` + `en`) — no hard-coded
  strings, no lorem ipsum shipped.
- **Rendering.** Pages run under a per-request CSP nonce + `force-dynamic`
  (see `middleware.ts` and `[locale]/layout.tsx`). Never inject an inline
  style/script without the nonce.
- **A11y.** Visible focus ring (`ring-ring`), ≥ 44px touch targets, real
  landmarks/labels, `prefers-reduced-motion` honored.

## Dark mode

Not shipped in the scaffold (light only — `globals.css` defines a single
`:root`). Add per project via `web-i18n-theme` (ThemeProvider writing
`class`/`data-theme` on `<html>`, `.dark` token overrides, `prefers-color-scheme`).

## Product-specific — _[fill in during Phase 0]_

The system above is the neutral scaffold. A distinctive product decides these:

- **Audience / jobs-to-be-done:** _[fill in during Phase 0]_
- **Brand voice & tone:** _[fill in during Phase 0]_
- **Anti-references** (what this must _not_ look like): _[fill in during Phase 0]_
- **Accent rationale / alternative palette:** _[fill in during Phase 0]_ — vermilion is a placeholder; pick a hue with intent.
- **Distinctive display face** (replace Geist for marketing?): _[fill in during Phase 0]_
