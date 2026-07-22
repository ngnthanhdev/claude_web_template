# Design-system enforcement

Load when `design.md`, `DESIGN.md`, tokens, a theme configuration, or an established component library exists. This turns design-system detection into a checked contract rather than a polite suggestion.

## Source priority

Resolve design data in this order and report conflicts:

1. User instruction for the current task.
2. Existing platform component/API contract and accessibility behavior.
3. `design.md` / `DESIGN.md` design decisions.
4. Machine-readable tokens (DTCG `tokens.json`, Style Dictionary, theme config).
5. Framework tokens (`@theme`, Tailwind config, CSS custom properties, native theme objects).
6. Existing shared components.
7. Local page/component values.

Higher priority can override lower priority only within the requested scope. Never silently rewrite the global system to make one page easier.

## Build a contract before editing

Extract and normalize:

- semantic color roles and light/dark/high-contrast variants;
- type roles, scale, weights, line heights, and text scaling behavior;
- spacing, radii, border, elevation/material, opacity, and motion tokens;
- breakpoints/window classes and density modes;
- component variants, sizes, states, and ownership;
- platform-specific mappings and intentional exceptions.

Emit a compact preservation block with file:line evidence. For each proposed value mark `reuse`, `alias`, `extend`, or `exception`:

- **reuse:** existing semantic token/component fits.
- **alias:** framework name maps to an existing semantic role; no new raw value.
- **extend:** a missing semantic role is added once at the system source.
- **exception:** local override is unavoidable, documented with owner and removal condition.

Raw one-off values are never the default fifth category.

## Multi-page coherence

Lock brand axes across the product:

- color roles and contrast policy;
- typography roles;
- spacing rhythm;
- component anatomy and state behavior;
- divider/elevation/material language;
- motion stance and CTA/action voice.

Allow page-voice axes to vary when the job changes:

- information density;
- heading placement;
- body composition;
- view archetype (table, list-detail, canvas, settings, document);
- supporting visualization.

Structural variety is suspended when it would make two routes feel like different products. Reuse is success inside a system; accidental duplication is not.

## Token rules

- Components consume semantic roles (`surface`, `text`, `border`, `action`, `danger`), not palette positions (`blue-500`) unless building the token layer itself.
- Every referenced token resolves in every supported appearance/mode.
- Aliases form an acyclic graph and terminate in a concrete value.
- Deprecated tokens include replacement and migration status.
- State tokens cover default, hover/pressed, focus, disabled, loading, error, success, selected, and destructive where applicable.
- Platform transforms preserve meaning, not necessarily identical numeric values.
- DTCG exports carry `$type`, `$value`, description, and mode/extension metadata consistently.

## Component ownership

- Extend the shared component when the requested variant is reusable and compatible with its public contract.
- Compose existing components when anatomy differs but primitives already exist.
- Create a local component only when its domain behavior is local; still consume system tokens and primitives.
- Do not copy a shared component into a route to avoid changing the source.
- A visual redesign cannot break props, events, focus management, validation, analytics hooks, routing, or test selectors without explicit scope.

## Enforcement report

At handoff, report:

```text
Design-system enforcement:
· Reused: 14 tokens, Button, Field, Dialog
· Aliased: --color-accent → --action-primary
· Extended: --surface-warning-subtle (system source: tokens/semantic.json)
· Exceptions: none
· Raw values outside token sources: 0
· Unresolved references: 0
· Modes checked: light, dark, high-contrast
```

If automated tooling exists, run it and cite the command. If it does not, state “source review only”; never label the system enforced based solely on intention.
