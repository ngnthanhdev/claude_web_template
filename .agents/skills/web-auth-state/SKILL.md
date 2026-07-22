---
name: web-auth-state
description: Use when building login/register, token storage, protected routes, or a current-user store in apps/web against the NestJS JWT endpoints. Covers httpOnly-cookie vs in-memory-token trade-offs (and why never localStorage), Next.js middleware/route-group guards, Vite React Router loader guards, and a Zustand auth store consuming @shared auth contracts. Load web-api-integration for the client, shared-contracts for the schemas, web-security for the XSS/CSRF posture.
---

# web-auth-state

Client-side authentication for `apps/web`: calling the API's JWT
`login`/`register`/`refresh` endpoints, deciding where the token lives,
gating routes so an unauthenticated visitor can't reach them, and holding the
current user in one store the whole app reads from.

## Goal

The access token is **never reachable from JavaScript** (so an XSS bug can't
exfiltrate it), routes are protected by default with an explicit allowlist of
public paths, and the current user is one reactive value — not re-derived by
decoding a token in five different components.

## Consuming the shared auth contracts

The request/response shapes come from `@shared/contracts/auth` — the same
schemas `apps/api` validates with (`shared-contracts`). Never redeclare them:

```ts
// apps/web/src/features/auth/hooks.ts
import { useMutation } from "@tanstack/react-query";
import {
  loginRequestSchema,
  sessionUserSchema,
  type LoginRequest,
} from "@shared/contracts/auth";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "./store";

export function useLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: (input: LoginRequest) =>
      // The API sets the httpOnly auth cookie in its Set-Cookie response;
      // the body carries only the safe-to-expose user profile.
      apiClient.post("/auth/login", sessionUserSchema, loginRequestSchema.parse(input)),
    onSuccess: (user) => setUser(user),
  });
}
```

`register` is the same shape against `/auth/register` with
`registerRequestSchema`. Both return the public `sessionUserSchema` (id,
email, roles, display name) — never the password hash or the raw token.

## Token storage — pick one, and it isn't localStorage

**Preferred: httpOnly cookie set by the API.** On login the API responds
with `Set-Cookie: access_token=…; HttpOnly; Secure; SameSite=Lax`. The
browser stores it, attaches it to every same-site request automatically, and
**no JavaScript can read it** — an XSS payload can't steal what it can't
access. The web client's `apiClient` only needs `credentials: "include"`
(see `web-api-integration`); it never handles the token value at all. The
cost is CSRF exposure: a cookie the browser sends automatically needs a
defense — `SameSite=Lax/Strict` plus a CSRF token for state-changing
requests. That trade-off and its mitigation belong to `web-security`.

**Fallback: in-memory access token + silent refresh.** Keep a short-lived
access token in a module variable (or non-persisted store field), send it as
`Authorization: Bearer …`, and pair it with a long-lived **httpOnly refresh
cookie**. The access token dies on reload — so on app boot you call
`/auth/refresh` (which reads the refresh cookie) to mint a new one before the
first protected request. This keeps the access token out of any persistent,
script-readable store while still supporting a bearer-header API.

```ts
// apps/web/src/features/auth/refresh.ts — fallback path only
import { sessionUserSchema } from "@shared/contracts/auth";
import { apiClient } from "@/lib/api/client";

export async function silentRefresh() {
  // Uses the httpOnly refresh cookie; returns the user + rotates the token.
  return apiClient.post("/auth/refresh", sessionUserSchema, {});
}
```

**Never `localStorage` (or `sessionStorage`) for a token.** Both are plain
JavaScript-readable strings: one XSS bug and every session is exfiltrable,
and there is no `HttpOnly` equivalent to stop it. This rule is not
negotiable regardless of convenience — see `web-security`.

## The auth store — current user

One Zustand store holds the authenticated user; components subscribe to the
slice they need. (A React context provider is an equivalent choice for a
small app — same shape, `useReducer` in a provider — but Zustand avoids the
re-render-the-whole-tree cost when only `user` changes.)

```ts
// apps/web/src/features/auth/store.ts
import { create } from "zustand";
import type { SessionUser } from "@shared/contracts/auth";

interface AuthState {
  user: SessionUser | null;
  status: "loading" | "authenticated" | "anonymous";
  setUser: (user: SessionUser) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading", // starts loading; silentRefresh() resolves it on boot
  setUser: (user) => set({ user, status: "authenticated" }),
  clear: () => set({ user: null, status: "anonymous" }),
}));
```

Do **not** persist this store to `localStorage`. It is a cache of who the
cookie says you are; the cookie is the source of truth. On boot, run
`silentRefresh()` (or, in the cookie-preferred path, a `GET /auth/me`) once
and call `setUser`/`clear` with the result. Logout calls `POST /auth/logout`
(which clears the cookie server-side) then `clear()`.

## Protected routes — framework fork

**Next.js (App Router).** Gate at the edge with middleware, and group
authenticated pages under a route group so the guard is structural, not
per-page:

```ts
// apps/web/src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register"];

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("access_token");
  const isPublic = PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

Middleware only checks for the cookie's presence (it can't verify the JWT
signature without the secret) — treat it as a redirect optimization. The
real authorization is the API rejecting an invalid/expired token on every
data request. Put authenticated pages under an `app/(app)/` route group and
`app/(auth)/` for login/register so the layout, not each page, owns the
boundary.

**Vite + React (React Router).** No edge layer — guard in the route's
`loader`, which runs before the component renders:

```tsx
// apps/web/src/router.tsx
import { createBrowserRouter, redirect } from "react-router-dom";
import { silentRefresh } from "@/features/auth/refresh";
import { useAuthStore } from "@/features/auth/store";

async function requireAuth() {
  if (useAuthStore.getState().status === "authenticated") return null;
  try {
    useAuthStore.getState().setUser(await silentRefresh());
    return null;
  } catch {
    // No valid session — bounce to login before the protected UI mounts.
    throw redirect("/login");
  }
}

export const router = createBrowserRouter([
  { path: "/login", lazy: () => import("./features/auth/LoginRoute") },
  {
    path: "/",
    loader: requireAuth,
    lazy: () => import("./features/app/AppShell"),
    children: [/* protected routes */],
  },
]);
```

The `loader` throwing `redirect("/login")` stops the protected component from
ever mounting — a guard, not a post-render `useEffect` that flashes private
UI first.

## Do

- Store the token in an **httpOnly cookie** the API sets; the client only
  ever sends `credentials: "include"`, never touches the token value.
- Consume `@shared/contracts/auth` schemas for every login/register/session
  shape — never a hand-written parallel type.
- Guard with Next.js middleware + route groups, or a React Router `loader`
  that redirects before the component mounts.
- Run one boot-time `silentRefresh()`/`GET /auth/me` to hydrate the auth
  store; treat the cookie as the source of truth, the store as a cache.

## Don't

- Don't put a token in `localStorage`/`sessionStorage` or any
  JavaScript-readable store — XSS reads it instantly (`web-security`).
- Don't persist the auth store — rehydrating a stale user from disk desyncs
  from the cookie's real state.
- Don't rely on the middleware/loader check as your authorization — it's a
  UX redirect; the API is what actually enforces the token on each request.
- Don't decode the JWT in components to read the user — subscribe to the
  auth store; the token isn't even reachable in the cookie-preferred path.
