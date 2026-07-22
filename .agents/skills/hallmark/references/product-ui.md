# Product UI — dense, stateful application interfaces

Load this reference when the brief is an authenticated product, dashboard, admin tool, operations console, editor, inbox, analytics surface, CRM, ERP, developer console, or any screen whose primary value is completing repeated work rather than explaining a product.

Product UI is not a marketing page with smaller headings. It optimizes for scan speed, repeat actions, state clarity, information density, and recovery from mistakes.

## Route before styling

Classify the screen by its dominant job:

| Job | Canonical shell | Primary risk |
| --- | --- | --- |
| Monitor | overview + exceptions + drill-down | decorative charts hiding actionable state |
| Search / triage | query + filters + result list + detail | losing query/selection context |
| Operate | queue/table + bulk actions + audit trail | destructive ambiguity |
| Create / edit | canvas/form + inspector + save state | hidden validation and lost work |
| Configure | grouped settings + impact preview | unclear scope and inheritance |
| Investigate | timeline/log + pivots + evidence panel | dense noise without hierarchy |

State the route: *"Product scope: Operate. Shell: data table + persistent filters + contextual bulk bar. Marketing macrostructure, hero, nav, footer, and enrichment are skipped."*

## Application shell

- Preserve the project's router, auth boundary, layout ownership, command system, and state library.
- Navigation reflects task frequency and permission, not company storytelling. Use sidebar, rail, tabs, breadcrumbs, or command palette only when the information architecture earns it.
- Keep global, workspace, and local navigation visually distinct. Never make three rows of equally weighted tabs.
- The current workspace, environment, tenant, date range, and permission mode remain visible when they change the meaning of data.
- Content area owns scroll unless a genuine split-pane/editor needs independent panes. Avoid nested scroll containers by default.
- On narrow screens, collapse secondary panes into routes or sheets; do not squeeze a desktop table into unreadable cards automatically.

## Density contract

Pick and state a density mode:

- **Comfortable:** occasional use, touch-first, row height 48–56 px.
- **Compact:** repeated desktop work, row height 36–44 px.
- **Dense:** expert operations, row height 28–36 px; requires keyboard support and cannot be the only touch layout.

Density changes row height and spacing, never font legibility, focus visibility, or target semantics. A 28 px visual row can expose a larger hit area only when targets do not overlap.

## Data tables

Use semantic `<table>` markup on web when the content is tabular. A table ships with:

1. A visible title or programmatic accessible name.
2. Real column headers with sort state (`aria-sort`) when sortable.
3. Column priority: identity → state → decision fields → supporting metadata → actions.
4. Alignment by data type: prose left, numbers right, comparable statuses consistently aligned.
5. Stable widths for scan-critical columns; flexible width for the primary identity column.
6. Selection count and explicit scope: “12 selected on this page” is different from “All 4,821 results”.
7. Row actions available by keyboard and not hidden exclusively behind hover.
8. Loading, empty, filtered-empty, error, stale, partial, and permission-denied states.
9. Pagination or virtualization chosen from data behavior, not fashion.
10. A narrow-screen strategy declared per column: keep, abbreviate, move to detail, or hide.

Do not turn every row into a card on mobile. For comparison-heavy data, preserve horizontal relationships with a priority-column table, a deliberate detail route, or a list-detail layout.

## Search, filters, and URL state

- Search query, sort, filters, page/cursor, selected view, and date range belong in the URL when sharing or returning to the state is valuable.
- Apply cheap local filters immediately. Use an explicit Apply action only for expensive remote queries or multi-step filter construction.
- Active filters appear as a readable summary with individual removal and one clear reset.
- Distinguish “no records exist” from “no results match these filters”. Only the latter offers Reset filters.
- Preserve scroll position and selection when returning from a detail route.
- Debounced search exposes loading and result-count updates to assistive technology without announcing every keystroke.

## Bulk actions and destructive work

- Bulk mode appears only after selection and names the selection count.
- Actions apply to the declared scope; never imply all results when only the visible page is selected.
- Reversible actions use optimistic update + Undo.
- Irreversible or high-blast-radius actions show the target scope, consequence, dependencies, and recovery status before confirmation.
- Permission failures explain which capability is missing and who can grant it; do not present a dead disabled button without rationale.
- Every mutation exposes pending, success, partial-success, error, retry, and conflict behavior.

## Forms and editors

- Group fields by decision, not by database schema.
- Autosave must expose `Saving`, `Saved`, `Offline`, `Conflict`, and `Retry`; a silent spinner is not a save contract.
- Long forms preserve progress and warn before discarding dirty state.
- Inline validation follows the touched rule from `interaction-and-states.md`; server validation maps back to the responsible field and to a form-level summary.
- Default values are distinguishable from inherited values. Configuration screens state the scope being changed.
- Multi-step flows allow backward navigation without losing valid input and show the consequence of completing the flow.

## Domain-depth prompts

Before inventing a generic dashboard, identify:

- What decision is made from this screen?
- Which exception deserves interruption?
- What is the unit of work and its lifecycle?
- Which roles can view, create, approve, export, or delete?
- What is eventually consistent, stale, partial, or delayed?
- What must be auditable?
- What volume is normal and what volume is worst case?

Unknown domain facts stay unknown. Label realistic placeholders as fixtures; never fabricate customer data, compliance state, financial totals, or operational metrics.

## Product-specific pre-emit checklist

- Primary task completes without visiting a marketing-style section.
- Keyboard order follows visual/task order; common repeated actions have discoverable shortcuts.
- Every asynchronous region has loading, stale, error, empty, and retry behavior.
- Filters, selection, pagination, and detail navigation preserve context.
- Destructive action language includes object, scope, consequence, and recovery.
- Dense data remains comparable; responsive treatment does not destroy relationships.
- Permissions and audit history are visible where they change what an action means.
- Charts pass `data-viz.md` when present.
- Existing design-system tokens and component ownership pass `design-system-enforcement.md`.

## Output contract

For a product screen, the preview replaces marketing picks with:

```markdown
- **Product job** · Operate / triage a deployment queue
- **Shell** · persistent filters + compact table + detail drawer
- **Density** · compact (40 px rows)
- **State model** · loading · stale · partial · empty · error · conflict
- **Responsive** · list-detail route below 720 px; identity/status columns retained
- **Permissions** · viewer · operator · admin behaviors declared
```

The artifact stamp uses `scope: product-ui · job: <job> · density: <mode>` and does not claim a marketing macrostructure, hero, nav, footer, or enrichment.
