import { notFound } from "next/navigation";

import { CollectionView } from "@/components/catalogue/collection-view";
import { listCategoriesServer } from "@/lib/catalogue-server";
import {
  categorySlugSchema,
  slugSchema,
  type CategorySlug,
  type Slug,
} from "@shared/catalogue";
import { localeSchema } from "@shared/localization";

interface CategoryCollectionPageProps {
  params: Promise<{ locale: string; slug: string[] }>;
}

/**
 * `/[locale]/categories/[...slug]` — the approved Catalogue macrostructure,
 * pre-scoped to the category (and, optionally, subcategory) the route path
 * resolves to. Resolves and validates the category server-side — via
 * `catalogue-server.ts`, directly against the API origin — so an unknown
 * segment is a real HTTP 404 (crawlable, no client-only loading flash)
 * instead of a client-rendered empty state. The interactive
 * filter/sort/price/cursor surface stays in the shared "use client"
 * `CollectionView`, exactly like `/[locale]/search`.
 */
export default async function CategoryCollectionPage({
  params,
}: CategoryCollectionPageProps) {
  const { locale: rawLocale, slug: routeSlug } = await params;
  const locale = localeSchema.parse(rawLocale);

  const [categorySegment, subcategorySegment, ...restSegments] =
    routeSlug ?? [];

  const parsedCategory = categorySlugSchema.safeParse(categorySegment);
  if (!parsedCategory.success) notFound();
  if (restSegments.length > 0) notFound();

  const parsedSubcategory =
    subcategorySegment === undefined
      ? undefined
      : slugSchema.safeParse(subcategorySegment);
  if (parsedSubcategory !== undefined && !parsedSubcategory.success) {
    notFound();
  }

  const category: CategorySlug = parsedCategory.data;
  const subcategory: Slug | undefined = parsedSubcategory?.success
    ? parsedSubcategory.data
    : undefined;

  const { data: categories } = await listCategoriesServer({ locale });
  const categoryName =
    categories
      .find((entry) => entry.slug === category)
      ?.translations.find((entry) => entry.locale === locale)?.name ?? category;

  return (
    <CollectionView
      category={category}
      categoryName={categoryName}
      locale={locale}
      mode="category"
      subcategory={subcategory}
    />
  );
}
