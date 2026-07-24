"use client";

import { useLocale } from "next-intl";

import { CollectionView } from "@/components/catalogue/collection-view";
import { localeSchema } from "@shared/localization";

/**
 * `/[locale]/search`: the shared Catalogue collection surface in "search"
 * mode — the same filters/sort/price/cursor state and grid as
 * `/[locale]/categories/[...slug]`, unscoped, with the free-text search box
 * active. Stays client-only: an empty or no-match search is a legitimate
 * 200, never a 404.
 */
export default function SearchPage() {
  const locale = localeSchema.parse(useLocale());

  return <CollectionView locale={locale} mode="search" />;
}
