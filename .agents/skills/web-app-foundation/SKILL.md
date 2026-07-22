---
name: web-app-foundation
description: Use when scaffolding or wiring the shell of apps/web — the root layout/entry, the providers stack (QueryClientProvider, theme provider), path aliases, env var access, and the responsive app shell (header + collapsible nav + max-width main). Forks by the Phase-0-chosen framework: Next.js App Router OR Vite + React SPA. This is where "where does each concern live" gets answered before any feature screen is built.
---

# web-app-foundation

`apps/web` is the web client of this monorepo. Its client framework is a
**Phase-0 choice, not a lock**: a project picks either **Next.js (App
Router, RSC/SSR)** or **Vite + React (SPA)**. This skill scaffolds the
foundation for whichever was chosen — the entry point, the providers stack,
path aliases, env access, and a responsive app shell — so feature work has a
consistent skeleton to build on. Everything here consumes `@shared/*`
contracts (see `shared-contracts`).

## Goal

One place each cross-cutting concern lives, wired the same way regardless of
which framework Phase 0 picked: TanStack Query at the root, a theme provider
(`web-styling`), env vars read through the framework's typed mechanism, and a
responsive shell (`web-responsive`) that every route renders inside.

## Fork by framework

Read the approved spec in `docs/specs/` to know which path you are on. The
two paths differ only at the edges — entry point, router, env prefix — and
share everything in the middle (providers, aliases, shell).

### Path A — Next.js App Router

```
apps/web/
├── app/
│   ├── layout.tsx          # root layout: <html>, providers, app shell
│   ├── page.tsx            # "/" route
│   ├── (dashboard)/        # route groups for auth-gated areas
│   └── globals.css         # Tailwind entry (see web-styling)
├── components/
│   ├── providers.tsx       # client providers stack (below)
│   └── shell/              # header, nav, drawer (below)
├── lib/                    # api client, utils (cn), hooks
├── next.config.ts
├── tsconfig.json
└── package.json
```

`app/layout.tsx` is the single root. It stays a Server Component; the
provider stack is a Client Component it wraps `children` in:

```tsx
// apps/web/app/layout.tsx
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
```

### Path B — Vite + React (SPA)

```
apps/web/
├── index.html             # single HTML entry, <div id="root">
├── src/
│   ├── main.tsx           # createRoot + RouterProvider + providers
│   ├── router.tsx         # route tree (TanStack Router or React Router)
│   ├── routes/            # route components
│   ├── components/
│   │   ├── providers.tsx  # same providers stack as Path A
│   │   └── shell/         # header, nav, drawer
│   ├── lib/               # api client, utils (cn), hooks
│   └── index.css          # Tailwind entry (see web-styling)
├── vite.config.ts
├── tsconfig.json
└── package.json
```

`main.tsx` is the entry. Prefer **TanStack Router** (type-safe routes,
first-class TanStack Query integration) for new SPAs; **React Router** is the
mature alternative if the team already knows it:

```tsx
// apps/web/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { Providers } from "@/components/providers";
import { routeTree } from "@/routeTree.gen";
import "@/index.css";

const router = createRouter({ routeTree });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
```

The app shell (below) lives in the router's root route so every child route
renders inside it, mirroring how `layout.tsx` wraps `children` on Path A.

## The providers stack — identical on both paths

`components/providers.tsx` is a Client Component on both paths. Order matters:
theme outermost (it can render immediately), Query inside it:

```tsx
// apps/web/{app|src}/components/providers.tsx
"use client"; // no-op/harmless on Vite; required on Next.js
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider"; // see web-styling

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
      }),
  );
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

Instantiate `QueryClient` inside `useState` (never as a module-level
singleton) so each browser session gets its own cache and Next.js SSR doesn't
leak one request's cache into another's. The typed API client and query hooks
that sit on top of this live in `web-api-integration`.

## Env vars — framework decides the prefix

Only variables meant for the browser bundle get a prefix; everything else
stays server-side. Read them through a small typed accessor, never scatter
raw `process.env`/`import.meta.env` reads across components:

```ts
// Path A — Next.js: browser-exposed vars need NEXT_PUBLIC_
export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL!,
} as const;

// Path B — Vite: browser-exposed vars need VITE_
export const env = {
  apiUrl: import.meta.env.VITE_API_URL as string,
} as const;
```

Keep secrets (never prefixed) out of the client bundle entirely — on Next.js
read them only in Server Components, route handlers, or server actions. Shape
lives in `.env.example`; see the secrets rule in `AGENTS.md`.

## Path aliases — two, kept consistent

Both aliases resolve the same on either framework. `@/*` is app-local; the
`@shared/*` mapping comes from `tsconfig.base.json` (see `shared-contracts` —
do not redefine it).

```jsonc
// apps/web/tsconfig.json (extends the root base)
{ "extends": "../../tsconfig.base.json",
  "compilerOptions": { "paths": { "@/*": ["./src/*"] } } } // "./app/* + ./*" on Next
```

On Vite, the bundler needs the alias too (tsconfig `paths` only informs the
type-checker): add `vite-tsconfig-paths` or an explicit `resolve.alias` entry
in `vite.config.ts`. Next.js reads `tsconfig` paths natively.

## The responsive app shell

Every route renders inside one shell: a header, a nav that collapses to a
drawer on small screens, and a `max-width` main container. This is the
structural half; `web-responsive` owns the breakpoint and layout detail,
`web-styling` owns the visual tokens.

```tsx
// components/shell/app-shell.tsx
import type { ReactNode } from "react";
import { Header } from "./header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header /> {/* logo + nav (md:flex) + drawer trigger (md:hidden) */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
```

The drawer itself (a `Sheet`/dialog toggled below `md`), the nav-to-drawer
breakpoint choice, and safe-area handling are `web-responsive`'s job — this
shell just gives them a home.

## Do

- Read `docs/specs/` first to know which framework Phase 0 chose, then
  scaffold only that path — don't build both.
- Keep one root (`app/layout.tsx` or the router's root route) that wraps every
  route in the same providers stack and app shell.
- Instantiate `QueryClient` inside `useState`, never as a module singleton.
- Read env through a typed `env` accessor and prefix only browser-exposed
  vars (`NEXT_PUBLIC_*` / `VITE_*`).
- Delegate: layout/breakpoints to `web-responsive`, tokens/theme to
  `web-styling`, the API client and query hooks to `web-api-integration`.

## Don't

- Don't hard-code `apps/web/src` paths across the codebase — go through the
  `@/*` alias, and import shared shapes through `@shared/*`.
- Don't put a browser secret behind `NEXT_PUBLIC_*`/`VITE_*` — anything
  prefixed ships in the client bundle.
- Don't redefine the `@shared/*` alias in the app tsconfig; it belongs in
  `tsconfig.base.json` (see `shared-contracts`).
- Don't scatter `process.env`/`import.meta.env` reads through components —
  centralize them in one typed module.
