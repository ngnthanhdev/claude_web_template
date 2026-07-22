---
name: web-data-forms
description: Use when building a form or a data list/table in apps/web — react-hook-form wired to a @shared zod request schema via @hookform/resolvers/zod, field-level validation and error display, submit-to-mutation with optimistic updates, and rendering lists/tables (with virtualization for long lists and the responsive table-to-card pattern). Load web-api-integration for the mutation hooks, shared-contracts for the schemas, web-responsive for the table-to-card breakpoint.
---

# web-data-forms

Forms and data display for `apps/web`: **react-hook-form + zod** validating
against the exact `@shared/contracts/*` request schema the API will re-check,
submit wired to a TanStack Query mutation, and lists/tables that stay fast
and readable at any length or viewport.

## Goal

A form's validation rules and its server's validation rules are the **same
zod schema**, resolved once (`@hookform/resolvers/zod`) — a field can't pass
the form and fail the API, because both check the identical contract. Submit
is a mutation, not a bespoke `fetch`. Lists render only what's visible and
reshape for small screens instead of overflowing.

## A typed form from a shared schema

```tsx
// apps/web/src/features/posts/PostForm.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPostRequestSchema, type CreatePostRequest } from "@shared/contracts/post";
import { useCreatePost } from "./hooks";

export function PostForm() {
  const createPost = useCreatePost(); // TanStack Query mutation, see web-api-integration
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePostRequest>({
    resolver: zodResolver(createPostRequestSchema),
    defaultValues: { title: "", body: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    // values is already CreatePostRequest — parsed and typed by the resolver.
    await createPost.mutateAsync(values);
    reset();
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor="title">Title</label>
      <input id="title" aria-invalid={!!errors.title} {...register("title")} />
      {errors.title && <p role="alert">{errors.title.message}</p>}

      <label htmlFor="body">Body</label>
      <textarea id="body" aria-invalid={!!errors.body} {...register("body")} />
      {errors.body && <p role="alert">{errors.body.message}</p>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Publish"}
      </button>
      {createPost.isError && <p role="alert">Could not save. Try again.</p>}
    </form>
  );
}
```

The `zodResolver` gives every field its error message straight from the
schema's `.min()`/`.email()`/custom `.refine()` rules — no message strings
duplicated in the component. `noValidate` hands validation entirely to zod so
the browser's native bubbles don't compete with the field-level `role="alert"`
errors.

## Field validation and error display

- Bind `aria-invalid` to the field's error and render the message in a
  `role="alert"` node adjacent to the input — screen readers announce it, and
  it's the accessible counterpart to the visual error style.
- Derive messages from the schema (`z.string().min(1, "Title is required")`),
  not from ad-hoc `if (!value)` checks in the component.
- For a **server-side** validation failure (the API's `422` envelope, e.g. a
  unique-email conflict react-hook-form can't know about), map it back onto
  the field with `setError("email", { message })` from the mutation's
  `onError`, so a server rejection reads like any other field error.

## Submit to a mutation, with optimism

The submit handler calls `mutateAsync`; the optimistic cache work lives in
the mutation hook (`web-api-integration`'s `onMutate`/`onError`/`onSettled`
triad), keeping the component ignorant of cache mechanics:

```ts
// apps/web/src/features/posts/hooks.ts (excerpt — full triad in web-api-integration)
export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePostRequest) =>
      apiClient.patch(`/posts/${input.id}`, postSchema, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: postKeys.detail(input.id) });
      const previous = qc.getQueryData(postKeys.detail(input.id));
      qc.setQueryData(postKeys.detail(input.id), (old) => ({ ...old, ...input }));
      return { previous };
    },
    onError: (_e, input, ctx) =>
      qc.setQueryData(postKeys.detail(input.id), ctx?.previous),
    onSettled: (_d, _e, input) =>
      void qc.invalidateQueries({ queryKey: postKeys.detail(input.id) }),
  });
}
```

The form stays declarative: it awaits `mutateAsync(values)` and resets; the
optimistic UI update, rollback, and server reconciliation are the mutation's
job. Disable the submit button on `isSubmitting` so a double-click can't fire
the mutation twice.

## Rendering lists and tables

A plain `.map` over the query result is correct for short, bounded lists:

```tsx
const { data } = usePostsList();
return (
  <ul>
    {data?.items.map((p) => (
      <li key={p.id}>{p.title}</li>
    ))}
  </ul>
);
```

**Long lists — virtualize.** Once a list can grow to hundreds of rows,
mounting every node janks scrolling. Render only the visible window with
`@tanstack/react-virtual`:

```tsx
// apps/web/src/features/posts/PostList.tsx
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export function PostList({ items }: { items: Post[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // row height estimate in px
    overscan: 8,
  });

  return (
    <div ref={parentRef} style={{ height: 480, overflow: "auto" }}>
      <div style={{ height: rows.getTotalSize(), position: "relative" }}>
        {rows.getVirtualItems().map((v) => (
          <div
            key={items[v.index].id}
            style={{ position: "absolute", top: 0, transform: `translateY(${v.start}px)`, width: "100%" }}
          >
            {items[v.index].title}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Responsive tables — table on wide, cards on narrow.** A multi-column
`<table>` overflows a phone; below the layout breakpoint, render each row as
a stacked card instead of forcing horizontal scroll. The breakpoint hook and
the card markup pattern live in `web-responsive` — defer to it rather than
hard-coding a `matchMedia` query here, so every table reshapes at the same
width the rest of the app does.

## Do

- Resolve every form with `zodResolver(<the @shared request schema>)` — the
  same schema `createZodDto` wraps on the API (`shared-contracts`).
- Show errors in a `role="alert"` node and set `aria-invalid` on the field;
  map the API's `422` back onto fields with `setError`.
- Submit through a TanStack Query mutation (`mutateAsync`) and disable the
  button on `isSubmitting`; let the hook own the optimistic cache work.
- Virtualize any list that can grow unbounded with `@tanstack/react-virtual`;
  defer the table-to-card reshape to `web-responsive`.

## Don't

- Don't hand-roll validation with `useState` + `if` checks — it drifts from
  the server's schema; the resolver keeps them identical.
- Don't call `apiClient` directly from the submit handler — go through a
  mutation so caching, invalidation, and optimism are consistent.
- Don't render thousands of DOM rows unvirtualized, and don't paginate a list
  that should scroll — pick the pattern that fits the data volume.
- Don't duplicate `matchMedia`/breakpoint logic per table — use
  `web-responsive`'s shared hook.
