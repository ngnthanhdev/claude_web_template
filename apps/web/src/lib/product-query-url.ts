import {
  productCollectionQuerySchema,
  type ProductCollectionQuery,
} from "@shared/catalogue";
import type { Currency, Locale } from "@shared/localization";
import type { ZodError } from "zod";

/**
 * The default licence tier a fresh collection view (no `licence` query
 * parameter yet) resolves to. Mirrors `DEFAULT_CURRENCY` in
 * `lib/currency.tsx`: one explicit constant instead of an implicit default
 * repeated at every call site.
 */
export const DEFAULT_PRODUCT_LICENCE: ProductCollectionQuery["licence"] =
  "Regular";

/**
 * The non-cursor slice of `ProductCollectionQuery`: every filter/sort/price
 * dimension the collection kit renders controls for. `locale` and
 * `currency` are deliberately excluded — they come from the `[locale]`
 * route segment and the existing `useCurrency` context, never from this
 * query string, so the two axes stay independent (per the approved design).
 */
export type ProductCollectionFilterState = Omit<
  ProductCollectionQuery,
  "locale" | "currency" | "cursor"
>;

/**
 * The full URL-backed state, including the opaque continuation cursor.
 * `product-query-url` treats the cursor as just another field to encode and
 * decode faithfully; deciding *when* a cursor should accompany the rest of
 * the state (and when it must be dropped) is `use-product-collection`'s job.
 */
export type ProductCollectionUrlState = ProductCollectionFilterState &
  Pick<ProductCollectionQuery, "cursor">;

/**
 * The repeatable, controlled-slug facet keys `FilterRail` renders as
 * checkbox groups (OR-within each facet). `compatibility` is also
 * repeatable but keeps its own `<target>@<band>` shape, so it is typed and
 * handled separately from this slug-vocabulary set.
 */
export const PRODUCT_COLLECTION_FACET_KEYS = [
  "category",
  "subcategory",
  "technology",
  "templateType",
  "pageType",
  "industry",
  "feature",
] as const;
export type ProductCollectionFacetKey =
  (typeof PRODUCT_COLLECTION_FACET_KEYS)[number];

/**
 * Every field name `productCollectionQuerySchema` accepts other than the
 * request-context fields (`locale`, `currency`) supplied separately. This is
 * the fixed set of query *dimensions* the approved contract defines (see
 * `docs/specs/2026-07-22-template-marketplace-design.md` §3.1) — not a list
 * of facet *values*. Facet values always come from an API response or a
 * caller-supplied prop, never from a literal list in this file. The
 * `satisfies` clause fails to compile the moment this list drifts from
 * `ProductCollectionUrlState`'s actual keys.
 */
const PRODUCT_COLLECTION_STATE_KEYS = [
  "q",
  "category",
  "subcategory",
  "technology",
  "templateType",
  "pageType",
  "industry",
  "feature",
  "compatibility",
  "updatedWithin",
  "minPrice",
  "maxPrice",
  "sort",
  "licence",
  "limit",
  "cursor",
] as const satisfies readonly (keyof ProductCollectionUrlState)[];

type ProductCollectionStateKey = (typeof PRODUCT_COLLECTION_STATE_KEYS)[number];

function isProductCollectionStateKey(
  key: string,
): key is ProductCollectionStateKey {
  return (PRODUCT_COLLECTION_STATE_KEYS as readonly string[]).includes(key);
}

/**
 * Serializes the entire non-cursor collection state (plus the opaque
 * continuation cursor, when present) into a `URLSearchParams`. Repeatable
 * facets are written as repeated entries under the same key — OR-within the
 * facet; distinct facet keys stay independent entries — AND-across facets —
 * exactly the grammar `productCollectionQuerySchema` parses on the way back.
 * Resolved fields (`sort`, `limit`, `licence`) are written explicitly rather
 * than left implicit, so a shared link reproduces the exact collection even
 * if a future default value changes.
 */
export function encodeProductCollectionUrlState(
  state: Partial<ProductCollectionUrlState>,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const key of PRODUCT_COLLECTION_STATE_KEYS) {
    const value = state[key];
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, String(entry));
      continue;
    }

    params.set(key, String(value));
  }

  return params;
}

function collectOffendingKeys(error: ZodError): Set<string> {
  const offendingKeys = new Set<string>();

  for (const issue of error.issues) {
    const [rootKey] = issue.path;
    if (typeof rootKey === "string") offendingKeys.add(rootKey);

    if (issue.code === "unrecognized_keys") {
      for (const unrecognizedKey of issue.keys)
        offendingKeys.add(unrecognizedKey);
    }
  }

  return offendingKeys;
}

const MAX_DECODE_ATTEMPTS = PRODUCT_COLLECTION_STATE_KEYS.length + 1;

/**
 * Rebuilds collection state from a URL's search string. An unknown
 * parameter is dropped silently (never fatal to the rest of the link); a
 * known parameter that fails the shared `productCollectionQuerySchema`
 * contract (an unrecognised facet value, a malformed compatibility band, an
 * inverted price range, an expired-looking cursor, …) is dropped on its own
 * so a partially-stale or hand-edited link still resolves to a valid
 * collection instead of the whole page failing. `locale`/`currency` are
 * supplied by the caller (the route segment and the existing currency
 * context) rather than read from the query string.
 */
export function decodeProductCollectionUrlState(
  search: URLSearchParams | string,
  context: { locale: Locale; currency: Currency },
): ProductCollectionUrlState {
  const known = new URLSearchParams(
    typeof search === "string" ? search : search.toString(),
  );
  for (const key of Array.from(known.keys())) {
    if (!isProductCollectionStateKey(key)) known.delete(key);
  }

  for (let attempt = 0; attempt < MAX_DECODE_ATTEMPTS; attempt += 1) {
    if (!known.has("licence")) known.set("licence", DEFAULT_PRODUCT_LICENCE);

    const candidate = new URLSearchParams(known);
    candidate.set("locale", context.locale);
    candidate.set("currency", context.currency);

    const parsed = productCollectionQuerySchema.safeParse(candidate);
    if (parsed.success) {
      const { locale, currency, ...rest } = parsed.data;
      void locale;
      void currency;
      return rest;
    }

    const offendingKeys = collectOffendingKeys(parsed.error);
    if (offendingKeys.size === 0) break;
    for (const offendingKey of offendingKeys) known.delete(offendingKey);
  }

  // Unreachable in practice: every loop iteration removes at least one
  // offending key, and a `licence`-only query always parses successfully.
  // Kept as a last-resort, fully-defaulted state for total type safety.
  return decodeProductCollectionUrlState(
    `licence=${DEFAULT_PRODUCT_LICENCE}`,
    context,
  );
}

/**
 * Toggles `value` inside a repeatable facet's current selection, returning
 * `undefined` (never an empty array) once the toggle empties it out — so an
 * unselected facet never round-trips as a stray empty query key.
 */
export function toggleFacetValue(
  current: readonly string[] | undefined,
  value: string,
): string[] | undefined {
  const existing = current ?? [];
  const next = existing.includes(value)
    ? existing.filter((entry) => entry !== value)
    : [...existing, value];

  return next.length === 0 ? undefined : next;
}
