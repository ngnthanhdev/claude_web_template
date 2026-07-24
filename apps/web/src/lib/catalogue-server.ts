/**
 * Server-only catalogue reads.
 *
 * These functions fetch directly from the private API origin
 * (`process.env.API_ORIGIN`, never `NEXT_PUBLIC_*`) instead of the
 * same-origin `/api/v1/*` proxy the browser uses (see
 * `apps/web/src/app/api/[...proxy]/route.ts`). They exist for the two
 * public, SEO-critical reads that need a real HTTP `404` in the *first*
 * server response — the product-detail and category-collection pages — so
 * a crawler (and "View Source") sees the correct status instead of a 200
 * with a client-rendered loading/empty state.
 *
 * Import this module ONLY from a Server Component (or another server-only
 * module) — never from a `"use client"` file, `catalogue-client.ts`, or a
 * hook. It talks to a private origin that must never reach the client
 * bundle, and it never forwards the visitor's cookies (these are public,
 * unauthenticated reads; anything that needs the shopper's session stays on
 * the existing client path through `catalogue-client.ts` and the
 * same-origin proxy). The `server-only` package is not part of this
 * project's dependency set (nothing in `pnpm-lock.yaml` provides it), so
 * this boundary is enforced by convention and code review rather than a
 * build-time guard.
 */

import {
  categoryCollectionQuerySchema,
  categoryCollectionResponseSchema,
  productDetailResponseSchema,
  slugSchema,
  type CategoryCollectionQuery,
  type CategoryCollectionResponse,
  type ProductDetailResponse,
  type Slug,
} from "@shared/catalogue";

const API_VERSION_PREFIX = "/v1";

function resolveApiOrigin(): URL {
  const apiOrigin = process.env.API_ORIGIN;
  if (!apiOrigin) {
    throw new Error("API_ORIGIN is not configured.");
  }

  const originUrl = new URL(apiOrigin);
  if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") {
    throw new Error("API_ORIGIN must be an http(s) URL.");
  }

  return originUrl;
}

function buildCatalogueUrl(path: string, query?: Record<string, string>): URL {
  const url = new URL(`${API_VERSION_PREFIX}${path}`, resolveApiOrigin());

  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

/**
 * A plain, unauthenticated GET against the API origin: no cookies, no
 * credentials, and a `no-store` cache policy so a just-published, updated,
 * or delisted row is never masked by a stale cached "found" (or
 * "not found") result.
 */
async function fetchCatalogue(url: URL): Promise<Response> {
  return fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });
}

/**
 * Fetches one product's full detail view directly from the API origin.
 * Returns `null` for an API `404` (unknown, draft, or delisted slug — the
 * API never distinguishes which, for public callers) so the caller can
 * render a real `notFound()`. Any other non-OK status, or a payload that
 * fails the shared schema, throws instead of silently resolving to
 * "not found" — an outage must never be reported as a missing product.
 */
export async function getProductBySlugServer(
  slug: Slug,
): Promise<ProductDetailResponse | null> {
  const validSlug = slugSchema.parse(slug);
  const response = await fetchCatalogue(
    buildCatalogueUrl(`/products/${encodeURIComponent(validSlug)}`),
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Failed to load product "${validSlug}" (HTTP ${response.status}).`,
    );
  }

  return productDetailResponseSchema.parse(await response.json());
}

export type ListCategoriesServerParams = CategoryCollectionQuery;

/**
 * Lists every catalogue category, localized to the requested locale — the
 * server-side twin of `catalogue-client.ts`'s `listCategories`, used by the
 * category-collection page to resolve/validate the route's category segment
 * and render its localized name in the initial server response.
 */
export async function listCategoriesServer(
  params: ListCategoriesServerParams,
): Promise<CategoryCollectionResponse> {
  const query = categoryCollectionQuerySchema.parse(params);
  const response = await fetchCatalogue(
    buildCatalogueUrl("/categories", { locale: query.locale }),
  );

  if (!response.ok) {
    throw new Error(`Failed to load categories (HTTP ${response.status}).`);
  }

  return categoryCollectionResponseSchema.parse(await response.json());
}
