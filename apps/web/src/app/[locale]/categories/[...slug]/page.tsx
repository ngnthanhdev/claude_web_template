import { notFound } from "next/navigation";

import { CollectionView } from "@/components/catalogue/collection-view";
import { listCategoriesServer } from "@/lib/catalogue-server";
import { localeSchema } from "@shared/localization";

import { resolveCategoryScope } from "./route-scope";

interface CategoryCollectionPageProps {
  params: Promise<{ locale: string; slug: string[] }>;
}

/**
 * `/[locale]/categories/[...slug]` — the approved Catalogue macrostructure,
 * pre-scoped to the category (and, optionally, subcategory) the route path
 * resolves to. Resolves and validates the category server-side — via
 * `catalogue-server.ts`, directly against the API origin — so an unknown
 * segment is a real HTTP 404 (crawlable, no client-only loading flash)
 * instead of a client-rendered empty state. The segment-parsing predicate
 * lives in `route-scope.ts` so it stays unit-testable outside this async
 * Server Component. The interactive filter/sort/price/cursor surface stays
 * in the shared "use client" `CollectionView`, exactly like
 * `/[locale]/search`.
 */
export default async function CategoryCollectionPage({
  params,
}: CategoryCollectionPageProps) {
  const { locale: rawLocale, slug: routeSlug } = await params;
  const locale = localeSchema.parse(rawLocale);

  const scope = resolveCategoryScope(routeSlug ?? []);
  if (scope === null) notFound();
  const { category, subcategory } = scope;

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
