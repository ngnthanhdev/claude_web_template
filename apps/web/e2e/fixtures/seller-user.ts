import { expect, type Page, type Response } from "@playwright/test";

import type { Locale } from "@shared/localization";

/**
 * `e2e/fixtures/seller-user.ts` — the seeded-seller contract
 * `seller-authoring.spec.ts` drives against, plus the authoring route paths,
 * a valid `createDraftProductRequestSchema`/`createVersionRequestSchema`
 * fixture builder, and a response-sniffing helper that proves no
 * server-owned field (seller ownership, artifact `signature`, etc.) ever
 * reaches the browser. Kept separate from `fixtures/test-catalogue.ts` (out
 * of this task's file scope) the same way `fixtures/purchasable-product.ts`
 * is.
 *
 * `SELLER_EMAIL` must stay in literal sync with `apps/api/prisma/seed-e2e.mjs`'s
 * `SELLER_OWNER_ID` user — that seed grants this exact user the `seller`
 * `Role`/`UserRole` this spec's happy path signs in as. That seed's owner
 * already has a `SellerProfile` (it owns the three published browse/commerce
 * fixture products); this only adds the role assignment that lets it pass
 * `SellerGuard` and actually reach `/v1/seller/*`.
 */

export const SELLER_EMAIL = "e2e-seller@example.com";

export function sellerPath(locale: Locale): string {
  return `/${locale}/seller`;
}

export function newSellerProductPath(locale: Locale): string {
  return `/${locale}/seller/products/new`;
}

export function sellerProductDetailPath(
  locale: Locale,
  productId: string,
): string {
  return `/${locale}/seller/products/${productId}`;
}

let uniqueSlugCounter = 0;

/** A fresh, never-reused slug matching `slugSchema` — timestamp-based so repeated runs against the same disposable database never collide on `Product.slug`'s unique constraint. */
export function uniqueDraftProductSlug(): string {
  uniqueSlugCounter += 1;
  return `e2e-seller-draft-${Date.now()}-${uniqueSlugCounter}`;
}

export interface DraftProductFormInput {
  readonly slug: string;
  readonly thumbnailUrl: string;
  readonly documentationUrl: string;
  readonly isolatedPreviewUrl: string;
}

/**
 * Values for every `products/new` field this spec fills in. `category` is
 * deliberately left untouched by the spec (the form already defaults to the
 * first `categorySlugSchema` option, `"wordpress"`) — one fewer interaction
 * to drive. Every URL is `https://assets.example.com/...`, matching
 * `seed-e2e.mjs`'s existing product fixtures and `publicHttpUrlSchema`
 * (`example.com` is not a private/loopback hostname).
 */
export function draftProductFormInput(slug: string): DraftProductFormInput {
  return {
    slug,
    thumbnailUrl: `https://assets.example.com/${slug}/thumbnail.webp`,
    documentationUrl: `https://docs.example.com/${slug}`,
    isolatedPreviewUrl: `https://preview.example.com/${slug}`,
  };
}

export interface VersionFormInput {
  readonly version: string;
  readonly releasedAt: string;
  readonly notesVi: string;
  readonly notesEn: string;
}

/** `releasedAt` is a `datetime-local`-input-shaped string (`YYYY-MM-DDTHH:mm`), matching `version-form.tsx`'s field type. */
export function versionFormInput(): VersionFormInput {
  return {
    version: "1.0.0",
    releasedAt: "2026-08-02T09:00",
    notesVi: "Phát hành thử nghiệm e2e",
    notesEn: "e2e test release",
  };
}

// -----------------------------------------------------------------------------
// Server-owned-field leak detection
// -----------------------------------------------------------------------------

/**
 * Keys no `/api/v1/seller/*` response should ever carry back to the browser:
 * `sellerId` (ownership authority — the server resolves it from the session,
 * design §5/§8), and the factory-ingest-only `signature`/secret fields that
 * exist solely on the server-to-server ingest contract
 * (`factoryArtifactIngestRequestSchema`), never on any seller-facing response
 * schema.
 */
const FORBIDDEN_RESPONSE_KEYS = [
  "sellerId",
  "signature",
  "ingestSecret",
  "hmacSecret",
];

function collectKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectKeys(nested, keys);
  }
}

const SELLER_API_PATTERN = /\/api\/v1\/seller\//;

/**
 * Attaches a response listener that inspects every `/api/v1/seller/*` JSON
 * response body for `FORBIDDEN_RESPONSE_KEYS`. Call the returned function at
 * the end of the test to detach the listener, await every in-flight body
 * read, and assert nothing was ever seen — a proactive network-level check
 * that no server-owned field or ingest secret becomes client-readable,
 * rather than only checking what the rendered DOM happens to display.
 */
export function trackSellerApiResponses(page: Page): () => Promise<void> {
  const violations: string[] = [];
  const pending: Promise<void>[] = [];

  const listener = (response: Response): void => {
    if (!SELLER_API_PATTERN.test(response.url())) return;
    if (response.status() >= 300) return;

    pending.push(
      response
        .json()
        .then((body: unknown) => {
          const keys = new Set<string>();
          collectKeys(body, keys);
          for (const forbidden of FORBIDDEN_RESPONSE_KEYS) {
            if (keys.has(forbidden)) {
              violations.push(`${response.url()} leaked "${forbidden}"`);
            }
          }
        })
        .catch(() => {
          // Non-JSON response (e.g. an empty body) — nothing to inspect.
        }),
    );
  };

  page.on("response", listener);

  return async () => {
    page.off("response", listener);
    await Promise.all(pending);
    expect(violations, violations.join("\n")).toEqual([]);
  };
}
