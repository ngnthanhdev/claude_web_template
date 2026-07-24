import {
  categoryCollectionQuerySchema,
  categoryCollectionResponseSchema,
  productCollectionQuerySchema,
  productCollectionResponseSchema,
  productDetailResponseSchema,
  slugSchema,
  type CategoryCollectionQuery,
  type CategoryCollectionResponse,
  type ProductCollectionQuery,
  type ProductCollectionResponse,
  type ProductDetailResponse,
  type ProductSort,
  type Slug,
} from "@shared/catalogue";

import { apiClient, apiProxyBasePath } from "./api-client";

type SearchParamValue =
  | string
  | number
  | boolean
  | undefined
  | readonly (string | number | boolean)[];

function buildSearchParams(
  query: Record<string, SearchParamValue>,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      continue;
    }

    params.append(key, String(value));
  }

  return params;
}

export type ListCategoriesParams = CategoryCollectionQuery;

/** Lists every catalogue category, localized to the requested locale. */
export async function listCategories(
  params: ListCategoriesParams,
): Promise<CategoryCollectionResponse> {
  const query = categoryCollectionQuerySchema.parse(params);
  const search = buildSearchParams(query);

  return apiClient.get(
    `${apiProxyBasePath}/categories?${search.toString()}`,
    categoryCollectionResponseSchema,
  );
}

/**
 * Request shape for {@link listProducts}. Mirrors the shared
 * `productCollectionQuerySchema` output, but leaves `sort`/`limit` optional
 * so callers can rely on the schema's own defaulting instead of repeating it.
 */
export type ListProductsParams = Omit<
  ProductCollectionQuery,
  "sort" | "limit"
> & {
  sort?: ProductSort;
  limit?: number;
};

/**
 * Lists catalogue products for the approved query grammar: free-text search,
 * controlled facets (category/subcategory/technology/...), compatibility
 * filters, price range, `updatedWithin`, sort, and the opaque cursor used to
 * continue an existing page.
 */
export async function listProducts(
  params: ListProductsParams,
): Promise<ProductCollectionResponse> {
  const query = productCollectionQuerySchema.parse(params);
  const search = buildSearchParams(query);

  return apiClient.get(
    `${apiProxyBasePath}/products?${search.toString()}`,
    productCollectionResponseSchema,
  );
}

/** Fetches a single product's full detail view by its canonical slug. */
export async function getProductBySlug(
  slug: Slug,
): Promise<ProductDetailResponse> {
  const validSlug = slugSchema.parse(slug);

  return apiClient.get(
    `${apiProxyBasePath}/products/${validSlug}`,
    productDetailResponseSchema,
  );
}
