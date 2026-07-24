"use client";

import { useTranslations } from "next-intl";

import type {
  LicenceIdentifier,
  LocalizedCategorySummary,
  ProductCard as ProductCardData,
} from "@shared/catalogue";

import { EmptyState } from "./empty-state";
import { ProductCard } from "./product-card";

export interface ProductGridProps {
  products: readonly ProductCardData[];
  categories: readonly LocalizedCategorySummary[];
  licence: LicenceIdentifier;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  /** Retries the failed fetch (error state's recovery action). */
  onRetry: () => void;
  /** Clears every filter (empty-results state's recovery action). */
  onResetFilters: () => void;
}

const SKELETON_COUNT = 8;
const GRID_CLASS_NAME =
  "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/**
 * Lays out a page of product cards in a responsive grid, and owns the
 * honest loading/empty/error surfaces around it — a skeleton that reserves
 * the same aspect ratio as a loaded card (no layout shift), a "no results"
 * state that offers to clear filters, and an error state that offers to
 * retry. Never fabricates inventory, bestseller, or rating content.
 */
export function ProductGrid({
  products,
  categories,
  licence,
  isLoading,
  isFetching,
  isError,
  onRetry,
  onResetFilters,
}: ProductGridProps) {
  const t = useTranslations("Collection.grid");

  if (isError) {
    return <EmptyState onAction={onRetry} variant="error" />;
  }

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        aria-label={t("regionLabel")}
        className={GRID_CLASS_NAME}
        role="region"
      >
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          // Mirrors the loaded card's structure (4/3 media + content block),
          // not just the media, so the row height is reserved and the
          // loading→loaded transition doesn't shift layout.
          <div
            aria-hidden="true"
            className="flex animate-pulse flex-col overflow-hidden rounded-[var(--radius-panel)] border border-border bg-background"
            key={index}
          >
            <div className="aspect-[4/3] w-full bg-muted" />
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="h-6 w-20 rounded-full bg-muted" />
              <div className="h-5 w-3/4 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-5/6 rounded bg-muted" />
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <div className="h-4 w-16 rounded bg-muted" />
                <div className="h-5 w-20 rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return <EmptyState onAction={onResetFilters} variant="empty" />;
  }

  return (
    <ul
      aria-busy={isFetching}
      aria-label={t("regionLabel")}
      className={GRID_CLASS_NAME}
    >
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard
            categories={categories}
            licence={licence}
            product={product}
          />
        </li>
      ))}
    </ul>
  );
}
