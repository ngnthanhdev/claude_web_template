"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId } from "react";

import { ProductCard } from "@/components/catalogue/product-card";
import { Button } from "@/components/ui/button";
import type {
  LicenceIdentifier,
  LocalizedCategorySummary,
  ProductCard as ProductCardData,
} from "@shared/catalogue";

const RAIL_GRID_CLASS_NAME =
  "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";
const SKELETON_COUNT = 4;

export interface RailStatusProps {
  /** `"loading"` reserves the card layout, `"empty"` is an honest zero-result state, `"error"` offers a retry. */
  variant: "loading" | "empty" | "error";
  /** Only rendered for `"error"`, and only when the caller has a query worth retrying. */
  onRetry?: () => void;
}

/**
 * The shared loading/empty/error body for a discovery rail. The loading
 * skeleton mirrors the catalogue kit's `ProductGrid` shape (reserves the
 * card's aspect ratio so nothing shifts once real cards arrive), and
 * `"empty"` is only ever shown once a resolved fetch actually returned zero
 * products — never a placeholder for missing inventory.
 */
export function RailStatus({ variant, onRetry }: RailStatusProps) {
  const t = useTranslations("Home.rail");

  if (variant === "loading") {
    return (
      <div
        aria-busy="true"
        aria-label={t("loading")}
        className={RAIL_GRID_CLASS_NAME}
        role="region"
      >
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <div
            aria-hidden="true"
            className="flex animate-pulse flex-col overflow-hidden rounded-[var(--radius-panel)] border border-border bg-background"
            key={index}
          >
            <div className="aspect-[4/3] w-full bg-muted" />
            <div className="flex flex-col gap-2 p-4">
              <div className="h-5 w-3/4 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "error") {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-xl)] text-center"
        role="alert"
      >
        <p className="text-sm font-semibold text-foreground">
          {t("errorHeading")}
        </p>
        <p className="text-sm text-muted-foreground">{t("errorDescription")}</p>
        {onRetry ? (
          <Button onClick={onRetry} type="button" variant="outline">
            {t("retry")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-1 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-xl)] text-center"
      role="status"
    >
      <p className="text-sm font-semibold text-foreground">
        {t("emptyHeading")}
      </p>
      <p className="text-sm text-muted-foreground">{t("emptyDescription")}</p>
    </div>
  );
}

export interface DiscoveryRailProps {
  title: string;
  /** Keeps the document outline correct when a rail is nested under another section's own `<h2>`. */
  headingLevel?: "h2" | "h3";
  viewAllHref?: string;
  viewAllLabel?: string;
  products: readonly ProductCardData[];
  /** The catalogue's category vocabulary, forwarded to `ProductCard`. */
  categories: readonly LocalizedCategorySummary[];
  licence: LicenceIdentifier;
  isLoading: boolean;
  isError: boolean;
  /** Retries the rail's own fetch; omitted when the caller has nothing to retry. */
  onRetry?: () => void;
}

/**
 * A single Ecosystem Index discovery rail: a heading, an optional "view
 * all" link, and either the honest loading/empty/error body or a dense
 * grid of the shared catalogue `ProductCard`. Rails never animate on
 * scroll — the only motion here is the loading skeleton's pulse, which is
 * a state cue (not a scroll-triggered reveal) and is already disabled by
 * the app-wide `prefers-reduced-motion` rule.
 */
export function DiscoveryRail({
  title,
  headingLevel = "h2",
  viewAllHref,
  viewAllLabel,
  products,
  categories,
  licence,
  isLoading,
  isError,
  onRetry,
}: DiscoveryRailProps) {
  const headingId = useId();
  const Heading = headingLevel;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Heading
          className={
            headingLevel === "h2"
              ? "text-xl font-semibold text-foreground sm:text-2xl"
              : "text-lg font-semibold text-foreground"
          }
          id={headingId}
        >
          {title}
        </Heading>
        {viewAllHref && viewAllLabel ? (
          <Link
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            href={viewAllHref}
          >
            {viewAllLabel}
          </Link>
        ) : null}
      </div>
      {isError ? (
        <RailStatus onRetry={onRetry} variant="error" />
      ) : isLoading ? (
        <RailStatus variant="loading" />
      ) : products.length === 0 ? (
        <RailStatus variant="empty" />
      ) : (
        <ul className={RAIL_GRID_CLASS_NAME}>
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
      )}
    </section>
  );
}
