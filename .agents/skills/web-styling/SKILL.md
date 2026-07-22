---
name: web-styling
description: Use when setting up or working with the styling layer of apps/web — Tailwind CSS config, design tokens as CSS variables, the cn() helper, installing and using shadcn/ui components, semantic color tokens, and dark mode via the class strategy and a theme provider. Styling is a Phase-0 choice; Tailwind CSS + shadcn/ui is the template default. Pair with web-responsive for layout and hallmark for design decisions.
---

# web-styling

The styling layer of `apps/web`. Styling is a **Phase-0 choice**, and the
template default is **Tailwind CSS + shadcn/ui** (Radix primitives + Tailwind,
copied into the repo rather than installed as a dependency). This skill covers
the Tailwind setup, the token system, the `cn()` helper, the shadcn install
flow, and dark mode. Layout and breakpoints belong to `web-responsive`;
theme/locale switching UI to `web-i18n-theme`; design judgment to
`hallmark`.

## Goal

A themeable, token-driven styling system where components reference **semantic
color tokens** (`bg-background`, `text-muted-foreground`, `border-input`) —
never raw hex — so light/dark and any rebrand is a change to variable
definitions, not a sweep across components.

## Tailwind entry and CSS-first config

Current Tailwind configures through CSS, not a large JS config. The app's
CSS entry (`app/globals.css` on Next.js, `src/index.css` on Vite — see
`web-app-foundation`) imports Tailwind and declares the dark variant:

```css
/* globals.css / index.css */
@import "tailwindcss";

/* class strategy: .dark on <html> flips the theme */
@custom-variant dark (&:where(.dark, .dark *));

/* map semantic tokens into Tailwind's theme so bg-background etc. exist */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
}
```

A JS `tailwind.config.ts` is still supported (via `@config`) if a plugin needs
it, but prefer the CSS-first approach for tokens.

## Design tokens as CSS variables

Define the actual color values once per theme in `:root` (light) and `.dark`.
Use `oklch()` for perceptually even lightness control. These raw values are
the *only* place hex/oklch literals appear:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.55 0.22 264);
  --primary-foreground: oklch(0.98 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.55 0 0);
  --border: oklch(0.92 0 0);
  --input: oklch(0.92 0 0);
  --ring: oklch(0.55 0.22 264);
  --radius: 0.625rem;
}
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.65 0.2 264);
  --primary-foreground: oklch(0.145 0 0);
  --muted: oklch(0.27 0 0);
  --muted-foreground: oklch(0.7 0 0);
  --border: oklch(0.27 0 0);
  --input: oklch(0.27 0 0);
  --ring: oklch(0.65 0.2 264);
}
```

Every component then uses the *semantic* utility (`bg-background`,
`text-foreground`, `border-border`) that resolves to whichever theme is
active. Cross-check contrast against `hallmark` Priority-1
(Accessibility: 4.5:1) when choosing values.

## The `cn()` helper

`cn()` merges class lists and resolves Tailwind conflicts (a later
`px-4` wins over an earlier `px-2`) — shadcn components rely on it for their
`className` prop. It lives in `lib/utils.ts`:

```ts
// apps/web/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

```tsx
<button className={cn("rounded-md px-4 py-2", isActive && "bg-primary", className)} />
```

## Installing shadcn/ui components

shadcn/ui is not a runtime dependency — the CLI copies component source into
`components/ui/` so you own and can edit it. Initialize once, then add
components as needed:

```bash
# one-time: creates components.json, wires cn() + token layer
pnpm dlx shadcn@latest init

# add components on demand — source lands in components/ui/
pnpm dlx shadcn@latest add button dialog sheet input dropdown-menu
```

`components.json` records the choices (style, base color, `@/*` alias,
CSS-variables mode). Because the source is vendored, treat edits as ordinary
code; re-running `add` for an existing component will offer to overwrite, so
review the diff.

```tsx
// usage — the Button already reads semantic tokens + cn()
import { Button } from "@/components/ui/button";
<Button variant="secondary" size="sm">Save</Button>;
```

## Dark mode via the class strategy + theme provider

Dark mode is driven by a `.dark` class on `<html>`, toggled by a theme
provider that respects the OS preference and persists the user's choice. On
both framework paths this provider is mounted in the providers stack from
`web-app-foundation`.

- **Next.js path:** use `next-themes` — `ThemeProvider` with
  `attribute="class"`, `defaultTheme="system"`, `enableSystem`. Set
  `suppressHydrationWarning` on `<html>` (already in the root layout) to avoid
  a first-paint mismatch.
- **Vite path:** a small local provider that reads
  `matchMedia("(prefers-color-scheme: dark)")`, persists to `localStorage`,
  and toggles `document.documentElement.classList`.

```tsx
// Vite path — components/theme-provider.tsx (sketch)
"use client";
import { createContext, useEffect, useState, type ReactNode } from "react";
type Theme = "light" | "dark" | "system";
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) ?? "system",
  );
  useEffect(() => {
    const root = document.documentElement;
    const dark =
      theme === "dark" ||
      (theme === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    localStorage.setItem("theme", theme);
  }, [theme]);
  // expose { theme, setTheme } via context…
  return <>{children}</>;
}
```

The visible theme-switch control and any locale switcher belong to
`web-i18n-theme`; this skill only wires the mechanism.

## Do

- Reference semantic tokens (`bg-background`, `text-muted-foreground`,
  `border-input`) in components; define raw color values only in `:root` /
  `.dark`.
- Merge classes through `cn()` so conditional and passed-in `className` values
  resolve conflicts predictably.
- Vendor shadcn components via `pnpm dlx shadcn@latest add …` and treat the
  copied source as editable, reviewable code.
- Drive dark mode with the `.dark` class and a theme provider mounted in the
  `web-app-foundation` providers stack.
- Check chosen colors against `hallmark` contrast requirements.

## Don't

- Don't hard-code hex/rgb/oklch literals inside component `className`s — that
  defeats theming; put values in the token layer.
- Don't fork Tailwind's config into every app arbitrarily — keep tokens in the
  CSS entry and share conventions.
- Don't add shadcn/ui as a bundled dependency or hide its source; the whole
  point is that you own the copied component.
- Don't hand-toggle dark styles with duplicated light/dark class pairs
  everywhere — let the `.dark` variant + tokens do it.
