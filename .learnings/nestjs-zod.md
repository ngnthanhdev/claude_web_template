# nestjs-zod

## 2026-08-02 — Pass the Zod schema explicitly to ZodValidationPipe per-param under Vitest

The global no-arg `ZodValidationPipe()` relies on `design:paramtypes` decorator
metadata to find the `createZodDto` class to validate against. Vitest's esbuild
transform does NOT emit that metadata, so under Vitest the implicit pipe silently
NO-OPS — the body reaches the handler unvalidated, and a test that expects a 422
on a bad body gets a 200/500 instead (or a mass-assignment test passes for the
wrong reason). Fix: pass the schema explicitly per parameter —
`@Body(new ZodValidationPipe(schema)) body: SomeDto` — so validation is reliable
in both the prod build (which has the metadata) and under Vitest. Same root cause
forces explicit `@Inject(Service)` constructor injection instead of bare
parameter-property injection in modules that are unit-tested with Vitest.

Source: Layer 8 seller module (`apps/api/src/seller/*.controller.ts`).

## 2026-08-02 — A privilege seed must satisfy the WHOLE guard, not just one half

`SellerGuard` requires BOTH a `seller` `Role`/`UserRole` AND an owned
`SellerProfile`. The e2e seed already gave the test user a `SellerProfile` but no
role, so it could never actually pass the guard — the gap was invisible until the
e2e task tried to sign in as a seller. Lesson: when seeding a principal for a
guarded surface, seed every condition the guard checks (role + profile + any
flag), not just the most obvious one; a half-seeded principal fails closed and
looks like a surface bug.

Source: Layer 8 e2e seed (`apps/api/prisma/seed-e2e.mjs`, commit `bf66a73`).
