import { apiErrorSchema } from "@shared/api";
import {
  createDraftProductRequestSchema,
  createVersionRequestSchema,
  editDraftProductRequestSchema,
  sellerProductDetailResponseSchema,
  sellerProductListResponseSchema,
  submitForReviewRequestSchema,
  submitForReviewResponseSchema,
  type CreateDraftProductRequest,
  type CreateVersionRequest,
  type EditDraftProductRequest,
  type SellerProductDetailResponse,
  type SellerProductListResponse,
  type SubmitForReviewRequest,
  type SubmitForReviewResponse,
} from "@shared/seller";
import { z, type ZodType } from "zod";

import { ApiClientError, apiClient, apiProxyBasePath } from "./api-client";

const uuidSchema = z.string().uuid();

/**
 * Headers every seller-authoring mutation must send: the session-bound CSRF
 * value from `useSession()`, matching the pattern already established by
 * `commerce-client` — the caller reads the token from the session cache;
 * this client never reads it itself.
 */
function csrfHeaders(csrfToken: string): HeadersInit {
  return { "X-CSRF-Token": csrfToken };
}

interface CursorPageParams {
  cursor?: string;
  limit?: number;
}

function buildCursorSearchParams(params: CursorPageParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.cursor !== undefined) search.set("cursor", params.cursor);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  return search;
}

/**
 * `apiClient` (api-client.ts) only exposes GET/POST/DELETE helpers today, but
 * `PATCH /v1/seller/products/:id` (design §5/§6) is a required v1 authoring
 * call. This mirrors `apiClient`'s internal request/error handling exactly
 * (same-origin proxy path, `credentials: "include"`, shared `apiErrorSchema`
 * error parsing, then schema-validating the body) so the PATCH call behaves
 * identically to every `apiClient` method without widening this task's file
 * scope to `api-client.ts`.
 */
async function patchRequest<T>(
  path: string,
  schema: ZodType<T>,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    method: "PATCH",
    credentials: "include",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...init?.headers,
    },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  let responseBody: unknown = undefined;

  if (responseText) {
    try {
      responseBody = JSON.parse(responseText) as unknown;
    } catch {
      responseBody = responseText;
    }
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(responseBody);
    if (parsedError.success) {
      throw new ApiClientError(
        response.status,
        parsedError.data.error.code,
        parsedError.data.error.message,
        parsedError.data.error.details,
      );
    }

    throw new ApiClientError(
      response.status,
      "HTTP_ERROR",
      response.statusText || `Request failed with status ${response.status}`,
    );
  }

  return schema.parse(responseBody);
}

/**
 * Creates a draft `Product` owned by the server-resolved seller. The request
 * is built only from `createDraftProductRequestSchema` — there is no field
 * for `sellerId`, `publicationState`, `isFeatured`, or price authority, so
 * none can be sent even by mistake; the server resolves ownership and owns
 * every authority field.
 */
export async function createDraftProduct(
  input: CreateDraftProductRequest,
  csrfToken: string,
): Promise<SellerProductDetailResponse> {
  const body = createDraftProductRequestSchema.parse(input);

  return apiClient.post(
    `${apiProxyBasePath}/seller/products`,
    sellerProductDetailResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Edits an owned, draft-only product — the allowlisted path for attaching
 * translations/media/compatibility/specifications/demo pages (design §5/§6).
 * Built only from `editDraftProductRequestSchema`, which has no
 * `publicationState`/`isFeatured`/`sellerId`/price field, so a seller can
 * never smuggle publication or ownership authority through this call.
 */
export async function editDraftProduct(
  productId: string,
  input: EditDraftProductRequest,
  csrfToken: string,
): Promise<SellerProductDetailResponse> {
  const id = uuidSchema.parse(productId);
  const body = editDraftProductRequestSchema.parse(input);

  return patchRequest(
    `${apiProxyBasePath}/seller/products/${id}`,
    sellerProductDetailResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Creates a new `ProductVersion` on an owned product. `reviewState` always
 * starts at `draft` server-side and is never bindable from
 * `createVersionRequestSchema`.
 */
export async function createProductVersion(
  productId: string,
  input: CreateVersionRequest,
  csrfToken: string,
): Promise<SellerProductDetailResponse> {
  const id = uuidSchema.parse(productId);
  const body = createVersionRequestSchema.parse(input);

  return apiClient.post(
    `${apiProxyBasePath}/seller/products/${id}/versions`,
    sellerProductDetailResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

/**
 * Dedicated guarded transition: moves the addressed version `draft ->
 * in_review` only. `submitForReviewRequestSchema` carries nothing but
 * `version` — there is structurally no way to request `approved`/`published`
 * through this call, so a seller can never self-publish from this client.
 */
export async function submitForReview(
  productId: string,
  input: SubmitForReviewRequest,
  csrfToken: string,
): Promise<SubmitForReviewResponse> {
  const id = uuidSchema.parse(productId);
  const body = submitForReviewRequestSchema.parse(input);

  return apiClient.post(
    `${apiProxyBasePath}/seller/products/${id}/submit-for-review`,
    submitForReviewResponseSchema,
    body,
    { headers: csrfHeaders(csrfToken) },
  );
}

export type ListSellerProductsParams = CursorPageParams;

/** Lists the caller's own seller products, cursor-paginated. */
export async function listSellerProducts(
  params: ListSellerProductsParams = {},
): Promise<SellerProductListResponse> {
  const search = buildCursorSearchParams(params);

  return apiClient.get(
    `${apiProxyBasePath}/seller/products?${search.toString()}`,
    sellerProductListResponseSchema,
  );
}

/** Fetches one of the caller's own seller products by id. */
export async function getSellerProductById(
  productId: string,
): Promise<SellerProductDetailResponse> {
  const id = uuidSchema.parse(productId);

  return apiClient.get(
    `${apiProxyBasePath}/seller/products/${id}`,
    sellerProductDetailResponseSchema,
  );
}
