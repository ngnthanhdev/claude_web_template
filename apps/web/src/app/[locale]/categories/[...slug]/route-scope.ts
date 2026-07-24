import {
  categorySlugSchema,
  slugSchema,
  type CategorySlug,
  type Slug,
} from "@shared/catalogue";

export interface CategoryScope {
  category: CategorySlug;
  subcategory: Slug | undefined;
}

/**
 * Resolves the `/[locale]/categories/[...slug]` catch-all segments into a
 * validated `{ category, subcategory }` pair, or `null` when the route
 * should 404 — an unknown category slug, more than two segments, or an
 * invalid subcategory slug. Kept dependency-free (no Next.js/React imports)
 * so the 404-gating predicate is unit-testable without rendering the async
 * Server Component.
 */
export function resolveCategoryScope(
  segments: readonly string[],
): CategoryScope | null {
  const [categorySegment, subcategorySegment, ...restSegments] = segments;

  const parsedCategory = categorySlugSchema.safeParse(categorySegment);
  if (!parsedCategory.success) return null;
  if (restSegments.length > 0) return null;

  const parsedSubcategory =
    subcategorySegment === undefined
      ? undefined
      : slugSchema.safeParse(subcategorySegment);
  if (parsedSubcategory !== undefined && !parsedSubcategory.success) {
    return null;
  }

  return {
    category: parsedCategory.data,
    subcategory: parsedSubcategory?.success
      ? parsedSubcategory.data
      : undefined,
  };
}
