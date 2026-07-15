---
name: web-responsive
description: Use when a screen, component, or layout in apps/web has to work across phone, tablet, and desktop widths — choosing breakpoints, fluid type/spacing with clamp(), container queries vs media queries, responsive grids, responsive images, the table→card pattern, safe-area insets, the viewport meta tag, and cross-viewport testing. This is the dedicated multi-screen-size skill; pair it with web-styling for tokens and ui-ux-pro-max for design judgment.
---

# web-responsive

Every surface in `apps/web` has to hold up from a 320px phone to a wide
desktop. This skill is the how: a mobile-first breakpoint strategy, fluid
sizing, container queries, responsive media, and the layout patterns that
survive real viewports. It complements `web-styling` (Tailwind + tokens) and
answers to `ui-ux-pro-max`'s **Priority-5 Layout & Responsive** rules.

## Goal

Layouts that reflow, never overflow. No horizontal scrollbar at any width, no
fixed-pixel container that clips on a small screen, tap targets a thumb can
hit, and zoom left alone. Design mobile-first and add width as an
enhancement, not the other way around.

## Mobile-first breakpoints — think in min-widths

Tailwind's defaults are **min-width** breakpoints: an unprefixed utility is
the phone base, and `sm md lg xl 2xl` layer on *as the screen grows*. Write
the small layout first, then widen.

| Prefix | Min width | Typical use |
|--------|-----------|-------------|
| (none) | 0         | phone base — single column |
| `sm`   | 640px     | large phone / small tablet |
| `md`   | 768px     | tablet — nav becomes inline |
| `lg`   | 1024px    | laptop — sidebar appears |
| `xl`   | 1280px    | desktop |
| `2xl`  | 1536px    | wide desktop |

```html
<!-- base = stacked; grows to 2 then 3 columns -->
<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">…</div>

<!-- nav inline from md up, hidden below (drawer takes over) -->
<nav class="hidden md:flex md:items-center md:gap-6">…</nav>
<button class="md:hidden" aria-label="Open menu">☰</button>
```

Reading `grid-cols-1 … sm:grid-cols-2 … lg:grid-cols-3` left-to-right traces
the layout small-to-large — the mental model to keep.

## Fluid type and spacing with `clamp()`

Between breakpoints, `clamp(min, preferred, max)` scales a value smoothly with
the viewport instead of jumping at each breakpoint. Use it for headings, hero
spacing, and section padding — the things that otherwise need three or four
breakpoint overrides.

```css
:root {
  /* min 1.5rem, scales with viewport, capped at 3rem */
  --step-fluid-h1: clamp(1.5rem, 1rem + 3vw, 3rem);
  --space-section: clamp(2rem, 1rem + 5vw, 6rem);
}
h1 { font-size: var(--step-fluid-h1); }
```

In Tailwind, expose these as arbitrary values or theme tokens (see
`web-styling`): `class="text-[length:var(--step-fluid-h1)]"` or a
`text-fluid-h1` utility mapped in the theme. Keep body copy at a fixed
readable size (16px base) — fluid-scale headings and spacing, not paragraphs.

## Container queries vs media queries

A **media query** responds to the *viewport*. A **container query**
(`@container`) responds to the *element's own container* — so a card renders
its compact layout in a narrow sidebar and its wide layout in a main column,
on the same viewport. Reach for container queries for **reusable components**
that appear in differently-sized slots; keep media queries for **page-level**
structure (the shell, the top nav).

```html
<!-- mark the parent as a query container -->
<div class="@container">
  <article class="flex flex-col gap-4 @md:flex-row @md:items-center">
    <img class="w-full @md:w-40" … />
    <div>…</div>
  </article>
</div>
```

```css
/* plain CSS equivalent */
.card-wrap { container-type: inline-size; }
@container (min-width: 28rem) {
  .card { flex-direction: row; }
}
```

Tailwind ships container-query variants (`@container`, `@sm:`/`@md:` inside
it) natively — no plugin needed in current versions. Rule of thumb: **if the
component is reused in more than one column width, query the container, not
the viewport.**

## Responsive grid and flex layouts

- `grid` with `grid-cols-*` breakpoint variants for structured multi-column
  content (card decks, dashboards).
- `auto-fit` + `minmax()` for a grid that decides its own column count with no
  breakpoints at all: `grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]`.
- `flex flex-wrap` for toolbars and tag rows that should wrap rather than
  scroll.
- Constrain the reading column: `max-w-prose` (~65ch) for body text; a
  `max-w-6xl` shell container (from `web-app-foundation`) for the page.

## Responsive images

Never ship one large image to every device. Serve the right pixels:

```html
<!-- resolution switching: same image, several sizes -->
<img
  src="/hero-800.webp"
  srcset="/hero-400.webp 400w, /hero-800.webp 800w, /hero-1600.webp 1600w"
  sizes="(min-width: 1024px) 800px, 100vw"
  alt="Product dashboard"
  class="aspect-video w-full rounded-lg object-cover"
  loading="lazy"
  decoding="async"
/>

<!-- art direction: a different crop per width -->
<picture>
  <source media="(min-width: 768px)" srcset="/banner-wide.webp" />
  <img src="/banner-tall.webp" alt="…" class="w-full" />
</picture>
```

Always set `aspect-ratio` (via `aspect-*` or the CSS property) so the box is
reserved before the image loads — that prevents layout shift (CLS). On the
Next.js path, `next/image` handles `srcset`, lazy loading, and reserved space
for you when given `width`/`height` or `fill` + `sizes`; on the Vite path use
the native `<img srcset sizes>` markup above.

## The table→card pattern

Wide data tables are the most common cause of horizontal scroll on phones.
Two acceptable fixes; pick per content:

1. **Scoped scroll** — wrap the table in `overflow-x-auto` so *it* scrolls,
   never the page. Fine for dense, genuinely tabular data.
2. **Table→card reflow** — below `md`, render each row as a stacked card with
   label/value pairs; restore the real table from `md` up.

```html
<!-- reflow: cards on phone, table from md -->
<ul class="grid gap-3 md:hidden">
  <li class="rounded-lg border p-4">
    <div class="flex justify-between"><span class="text-muted-foreground">Name</span><span>Ada</span></div>
    <div class="flex justify-between"><span class="text-muted-foreground">Role</span><span>Admin</span></div>
  </li>
</ul>
<table class="hidden w-full md:table">…</table>
```

## Safe-area insets

On phones with a notch or home indicator, keep fixed headers/footers out from
under the system UI with `env(safe-area-inset-*)`. Requires
`viewport-fit=cover` in the viewport meta.

```css
.app-footer {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
```

Tailwind can express this with arbitrary values:
`class="pb-[max(1rem,env(safe-area-inset-bottom))]"`.

## The viewport meta tag

Exactly one, and never disable zoom. On the Vite path it lives in
`index.html`; on the Next.js path set it via the `viewport` export.

```html
<!-- Vite: index.html -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

```ts
// Next.js: app/layout.tsx
import type { Viewport } from "next";
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
```

Do **not** add `maximum-scale=1` or `user-scalable=no` — disabling pinch-zoom
breaks accessibility for low-vision users.

## Testing across viewports

Verify at real widths, don't eyeball one browser. Playwright projects pin
representative viewports so a layout regression fails CI:

```ts
// playwright.config.ts (excerpt) — see web-testing-release
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },       // ~412px
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
```

Assert no horizontal overflow directly:
`expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)`.
The full harness (visual snapshots per project, CI wiring) is
`web-testing-release`.

## Anti-patterns checklist

Run this before calling a screen responsive-done:

- **No horizontal scroll** on the page at any width — only opt-in scoped
  scrollers (`overflow-x-auto`) are allowed.
- **No fixed-px container widths** (`w-[960px]`) — use `max-w-*` + `w-full`
  so it shrinks on narrow screens.
- **Never disable zoom** — no `user-scalable=no`, no `maximum-scale=1`.
- **Min tap target 44×44px** with ≥8px spacing between adjacent targets.
- **Avoid hover-only affordances** — anything revealed on `:hover` must also
  be reachable by tap/focus, since touch devices have no hover.
- **Reserve space for media** (`aspect-ratio`) to keep CLS < 0.1.

These mirror `ui-ux-pro-max`'s Priority-5 (Layout) and Priority-2 (Touch)
rows — cross-check there for the design rationale.

## Do

- Design mobile-first: write the base layout, then add `sm/md/lg` overrides
  as the screen grows.
- Prefer container queries for reusable components in variable-width slots;
  keep media queries for page structure.
- Use `clamp()` for fluid headings and section spacing; keep body text at a
  fixed 16px base.
- Ship responsive images (`srcset`/`sizes`, `<picture>`, `next/image`) with a
  reserved `aspect-ratio`.
- Test the layout at mobile/tablet/desktop viewports in Playwright and assert
  zero horizontal overflow.

## Don't

- Don't set fixed-pixel widths on containers or disable zoom.
- Don't let a wide table scroll the whole page — scope the scroll or reflow to
  cards below `md`.
- Don't gate any action behind hover alone.
- Don't scale body copy with the viewport — only headings and spacing.
- Don't skip safe-area insets on fixed bars when `viewport-fit=cover` is set.
