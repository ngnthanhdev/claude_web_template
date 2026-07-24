"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { CategoryIndex } from "@/components/home/category-index";
import { DiscoveryRail, RailStatus } from "@/components/home/discovery-rail";
import { listCategories, listProducts } from "@/lib/catalogue-client";
import { useCurrency } from "@/lib/currency";
import type {
  LicenceIdentifier,
  LocalizedCategorySummary,
  ProductCard as ProductCardData,
} from "@shared/catalogue";
import { localeSchema } from "@shared/localization";

/**
 * Home has no filter UI of its own (that lives in the catalogue collection
 * kit), so every rail shows the base licence tier's price — the same
 * "starting price" a shopper expects before opening a product's own
 * licence comparison.
 */
const HOME_LICENCE: LicenceIdentifier = "Regular";
const EDITORS_PICKS_RAIL_SIZE = 8;
const NEWEST_RAIL_SIZE = 8;
/** Large enough to give the niche grouping below real tag diversity to work with. */
const NEWEST_POOL_SIZE = 48;
const NICHE_RAIL_COUNT = 3;
const NICHE_RAIL_SIZE = 8;
/** A tag shared by only one product is a coincidence, not a "niche". */
const MIN_NICHE_PRODUCTS = 2;

interface NicheGroup {
  tag: string;
  products: readonly ProductCardData[];
}

/**
 * Derives "by niche" rails from tags the API already returned on the
 * newest-pool products, instead of guessing `industry` facet values: the
 * public product shape merges every facet dimension (technology, industry,
 * feature, ...) into one flat, unprefixed `tags` list, so the web client
 * cannot tell which tag belongs to which dimension, and there is no
 * endpoint that enumerates valid `industry` values. Querying a guessed
 * value the API doesn't recognize for that dimension is rejected, so
 * grouping the products already on hand is the only honest option without
 * a new backend surface.
 */
function groupByNiche(products: readonly ProductCardData[]): NicheGroup[] {
  const byTag = new Map<string, ProductCardData[]>();

  for (const product of products) {
    for (const tag of product.tags) {
      const matches = byTag.get(tag);
      if (matches) {
        matches.push(product);
      } else {
        byTag.set(tag, [product]);
      }
    }
  }

  return [...byTag.entries()]
    .filter(([, matches]) => matches.length >= MIN_NICHE_PRODUCTS)
    .sort(([leftTag, leftMatches], [rightTag, rightMatches]) =>
      leftMatches.length === rightMatches.length
        ? leftTag.localeCompare(rightTag)
        : rightMatches.length - leftMatches.length,
    )
    .slice(0, NICHE_RAIL_COUNT)
    .map(([tag, matches]) => ({
      tag,
      products: matches.slice(0, NICHE_RAIL_SIZE),
    }));
}

interface NicheIndexProps {
  pool: readonly ProductCardData[];
  poolPending: boolean;
  poolError: boolean;
  onRetry: () => void;
  categories: readonly LocalizedCategorySummary[];
  licence: LicenceIdentifier;
}

/** The Ecosystem Index's "by niche" surface: one rail per real, shared product tag. */
function NicheIndex({
  pool,
  poolPending,
  poolError,
  onRetry,
  categories,
  licence,
}: NicheIndexProps) {
  const t = useTranslations("Home.byNiche");
  const groups = useMemo(() => groupByNiche(pool), [pool]);

  return (
    <section aria-labelledby="home-by-niche" className="flex flex-col gap-8">
      <h2
        className="text-xl font-semibold text-foreground sm:text-2xl"
        id="home-by-niche"
      >
        {t("heading")}
      </h2>
      {poolError ? (
        <RailStatus onRetry={onRetry} variant="error" />
      ) : poolPending ? (
        <RailStatus variant="loading" />
      ) : groups.length === 0 ? (
        <RailStatus variant="empty" />
      ) : (
        <div className="flex flex-col gap-10">
          {groups.map((group) => (
            <DiscoveryRail
              categories={categories}
              headingLevel="h3"
              isError={false}
              isLoading={false}
              key={group.tag}
              licence={licence}
              products={group.products}
              title={t("railHeading", { niche: group.tag })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function HomePage() {
  const locale = localeSchema.parse(useLocale());
  const { currency } = useCurrency();
  const t = useTranslations("Home");

  const categoriesQuery = useQuery({
    queryKey: ["categories", locale],
    queryFn: () => listCategories({ locale }),
  });

  // A distinct, real signal from "newest" (last-updated time rather than
  // publish time) — the closest honest proxy for "worth highlighting" the
  // API surface offers without a dedicated curation flag.
  const editorsPicksQuery = useQuery({
    queryKey: ["home", "editors-picks", locale, currency, HOME_LICENCE],
    queryFn: () =>
      listProducts({
        locale,
        currency,
        licence: HOME_LICENCE,
        sort: "recently-updated",
        limit: EDITORS_PICKS_RAIL_SIZE,
      }),
  });

  const newestPoolQuery = useQuery({
    queryKey: ["home", "newest-pool", locale, currency, HOME_LICENCE],
    queryFn: () =>
      listProducts({
        locale,
        currency,
        licence: HOME_LICENCE,
        sort: "newest",
        limit: NEWEST_POOL_SIZE,
      }),
  });

  const categories = categoriesQuery.data?.data ?? [];
  const newestPool = newestPoolQuery.data?.data ?? [];

  return (
    <div className="flex w-full flex-col gap-[var(--space-2xl)]">
      <header className="flex flex-col gap-2 border-b border-border pb-[var(--space-lg)]">
        <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
          {t("pageTitle")}
        </h1>
        <p className="max-w-[60ch] text-base text-muted-foreground">
          {t("pageDescription")}
        </p>
      </header>

      <DiscoveryRail
        categories={categories}
        isError={editorsPicksQuery.isError}
        isLoading={editorsPicksQuery.isPending}
        licence={HOME_LICENCE}
        onRetry={() => void editorsPicksQuery.refetch()}
        products={editorsPicksQuery.data?.data ?? []}
        title={t("editorsPicks.heading")}
      />

      <DiscoveryRail
        categories={categories}
        isError={newestPoolQuery.isError}
        isLoading={newestPoolQuery.isPending}
        licence={HOME_LICENCE}
        onRetry={() => void newestPoolQuery.refetch()}
        products={newestPool.slice(0, NEWEST_RAIL_SIZE)}
        title={t("newest.heading")}
      />

      <CategoryIndex
        categories={categories}
        categoriesError={categoriesQuery.isError}
        categoriesLoading={categoriesQuery.isPending}
        currency={currency}
        licence={HOME_LICENCE}
        onRetryCategories={() => void categoriesQuery.refetch()}
      />

      <NicheIndex
        categories={categories}
        licence={HOME_LICENCE}
        onRetry={() => void newestPoolQuery.refetch()}
        pool={newestPool}
        poolError={newestPoolQuery.isError}
        poolPending={newestPoolQuery.isPending}
      />
    </div>
  );
}
