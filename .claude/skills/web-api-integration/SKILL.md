---
name: web-api-integration
description: Use when fetching or mutating server data in apps/web — a typed fetch client that validates every response against a packages/shared zod contract before a component sees it, TanStack Query hooks, query keys, cache invalidation, optimistic-update handoff, and the Next.js RSC-vs-client (or Vite pure-client) fetching split. Load shared-contracts for the schemas the client parses, and web-data-forms for the mutation/form side.
---

# web-api-integration

The data layer for `apps/web`: one typed `apiClient` that parses every
response against the same `@shared/contracts/*` zod schema `apps/api`
validated the request with, wrapped in **TanStack Query** for caching,
deduping, and invalidation. No component ever touches `fetch` directly, and
no component ever sees an unvalidated payload.

## Goal

A backend contract drift becomes a **parse error at the fetch boundary**,
not a render-time `undefined` three components deep. Every read goes through
`useQuery` with a stable, structured query key; every write goes through
`useMutation` and invalidates the keys it affected. The schema is the single
source of truth (`shared-contracts`), validated on both ends of the wire.

## The typed client

```ts
// apps/web/src/lib/api/client.ts
import type { ZodType } from "zod";
import { errorEnvelopeSchema } from "@shared/contracts/error";
import { API_BASE_URL } from "./config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    // Sends the httpOnly auth cookie the API set at login — see web-auth-state
    // for why the token lives in a cookie rather than localStorage.
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
    ...init,
  });

  const body = res.status === 204 ? null : await res.json();

  if (!res.ok) {
    const parsed = errorEnvelopeSchema.safeParse(body);
    const err = parsed.success
      ? parsed.data.error
      : { code: "UNKNOWN", message: res.statusText, details: undefined };
    throw new ApiError(res.status, err.code, err.message, err.details);
  }

  // Parse the success payload against the shared contract BEFORE returning.
  // If the API renamed a field, this throws here — not silently in a view.
  return schema.parse(body);
}

export const apiClient = {
  get: <T>(path: string, schema: ZodType<T>) => request(path, schema),
  post: <T>(path: string, schema: ZodType<T>, body: unknown) =>
    request(path, schema, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, schema: ZodType<T>, body: unknown) =>
    request(path, schema, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string, schema: ZodType<T>) =>
    request(path, schema, { method: "DELETE" }),
};
```

`API_BASE_URL` comes from `./config`, which is the one place the two
frameworks differ: Next.js reads `process.env.NEXT_PUBLIC_API_URL`, Vite
reads `import.meta.env.VITE_API_URL`. Both default to `"/v1"` (the API's URI
version prefix) behind a same-origin proxy. Keep that framework fork in
`config.ts`; nothing else in the data layer should branch on the framework.

## Query keys

Centralize keys so invalidation is exact, never a stringly-typed guess:

```ts
// apps/web/src/features/posts/keys.ts
export const postKeys = {
  all: ["posts"] as const,
  lists: () => [...postKeys.all, "list"] as const,
  list: (filters: { cursor?: string }) => [...postKeys.lists(), filters] as const,
  detail: (id: string) => [...postKeys.all, "detail", id] as const,
};
```

## Query and mutation hooks

```ts
// apps/web/src/features/posts/hooks.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { postSchema, createPostRequestSchema } from "@shared/contracts/post";
import type { CreatePostRequest } from "@shared/contracts/post";
import { apiClient } from "@/lib/api/client";
import { postKeys } from "./keys";

export function usePost(id: string) {
  return useQuery({
    queryKey: postKeys.detail(id),
    queryFn: () => apiClient.get(`/posts/${id}`, postSchema),
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostRequest) =>
      // Parse the request the same way the API will (createZodDto) so an
      // invalid body fails client-side too, not only at the 422 boundary.
      apiClient.post("/posts", postSchema, createPostRequestSchema.parse(input)),
    onSuccess: () => {
      // Refetch the lists that now include the new post. Invalidate the
      // list branch only — an unrelated detail query stays cached.
      void qc.invalidateQueries({ queryKey: postKeys.lists() });
    },
  });
}
```

## Optimistic updates

For a snappy write, apply the change to the cache before the server answers,
and roll back on error. `web-data-forms` drives this from a submit handler;
the query layer supplies the `onMutate`/`onError`/`onSettled` triad:

```ts
useMutation({
  mutationFn: (input) => apiClient.patch(`/posts/${input.id}`, postSchema, input),
  onMutate: async (input) => {
    await qc.cancelQueries({ queryKey: postKeys.detail(input.id) });
    const previous = qc.getQueryData(postKeys.detail(input.id));
    qc.setQueryData(postKeys.detail(input.id), (old) => ({ ...old, ...input }));
    return { previous }; // context handed to onError
  },
  onError: (_err, input, ctx) =>
    qc.setQueryData(postKeys.detail(input.id), ctx?.previous),
  onSettled: (_d, _e, input) =>
    void qc.invalidateQueries({ queryKey: postKeys.detail(input.id) }),
});
```

Always `cancelQueries` first (so an in-flight refetch can't clobber the
optimistic value), snapshot for rollback, and reconcile with the server in
`onSettled`. Never skip the rollback — a failed write that leaves stale
optimistic data in the cache is worse than no optimism at all.

## Error handling

`request()` throws a typed `ApiError` carrying the envelope's `code`, so UI
can branch on the code instead of parsing a message string. Surface it in a
query-level or global error boundary; do not swallow it. A `401` is the one
special case — hand it to `web-auth-state`'s refresh/redirect logic rather
than showing it as a generic error.

## Where the fetch happens — framework fork

**Next.js (App Router).** A read-only server component fetches directly, on
the server, and streams HTML — no client JS, no `useQuery`:

```tsx
// apps/web/src/app/posts/[id]/page.tsx  (React Server Component)
import { cookies } from "next/headers";
import { postSchema } from "@shared/contracts/post";
import { serverApiGet } from "@/lib/api/server";

export default async function PostPage({ params }: { params: { id: string } }) {
  // serverApiGet forwards the request's cookies (cookies().toString()) because
  // credentials:"include" only works in the browser, not in a server fetch.
  const post = await serverApiGet(`/posts/${params.id}`, postSchema, cookies());
  return <article>{post.title}</article>;
}
```

Reach for a client component with `useQuery` only when the data is
**interactive** (refetch on focus, mutate, poll). To avoid a fetch waterfall,
prefetch on the server and hydrate: `dehydrate(queryClient)` on the server,
`<HydrationBoundary state={...}>` around the client tree.

**Vite + React (SPA).** There is no server component — every fetch is
client-side through the hooks above, under a single `QueryClientProvider` at
the app root. No `serverApiGet`, no cookie forwarding; the browser attaches
the auth cookie automatically via `credentials: "include"`.

## Do

- Pass a `@shared/contracts/*` schema to every `apiClient` call and let it
  `schema.parse` the response — never `return res.json()` untyped.
- Keep query keys in a per-feature `keys.ts` factory so invalidation targets
  an exact branch, not a hand-typed array that drifts.
- Invalidate the narrowest key that changed (`postKeys.lists()`), not
  `postKeys.all`, after a mutation.
- In Next.js, fetch read-only data in an RSC; use `useQuery` only for
  interactive data, and prefetch+hydrate to avoid waterfalls.

## Don't

- Don't call `fetch` from a component — always go through `apiClient` so
  validation and the auth cookie are never forgotten.
- Don't store fetched data in local `useState`/context as your source of
  truth — TanStack Query's cache already is; mirroring it invites drift.
- Don't hand-write response `interface`s — infer from the shared schema
  (`shared-contracts`); the parsed result is already typed.
- Don't skip the optimistic rollback (`onError`) — a failed mutation must
  restore the pre-mutation snapshot.
