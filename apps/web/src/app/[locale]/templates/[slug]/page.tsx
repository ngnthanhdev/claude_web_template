"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { notFound } from "next/navigation";
import { use } from "react";

import { DemoViewer } from "@/components/product-detail/demo-viewer";
import { DetailHeader } from "@/components/product-detail/detail-header";
import { LicenceComparison } from "@/components/product-detail/licence-comparison";
import { SpecList } from "@/components/product-detail/spec-list";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";
import { getProductBySlug } from "@/lib/catalogue-client";
import { cn } from "@/lib/utils";

interface ProductDetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

const SKELETON_BLOCK_CLASS_NAME =
  "animate-pulse rounded-[var(--radius-panel)] bg-muted";

/**
 * `/[locale]/templates/[slug]` — the public product detail screen. Data
 * comes exclusively from the Round-1 `getProductBySlug` client (the
 * same-origin proxy, validated against the shared detail schema); an
 * unknown/draft/delisted slug surfaces as an HTTP 404 from that endpoint and
 * is rendered through Next's `notFound()`/`not-found.tsx` boundary rather
 * than a fabricated empty state.
 */
export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { slug } = use(params);
  const t = useTranslations("Product");

  const productQuery = useQuery({
    queryKey: ["product", slug] as const,
    queryFn: () => getProductBySlug(slug),
  });

  if (productQuery.isError) {
    if (
      productQuery.error instanceof ApiClientError &&
      productQuery.error.status === 404
    ) {
      notFound();
    }

    return (
      <div
        className="flex w-full flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)] text-center"
        role="alert"
      >
        <p className="text-base font-semibold text-foreground">
          {t("error.heading")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("error.description")}
        </p>
        <Button
          onClick={() => void productQuery.refetch()}
          type="button"
          variant="outline"
        >
          {t("error.action")}
        </Button>
      </div>
    );
  }

  if (productQuery.isPending) {
    return (
      <div
        aria-busy="true"
        aria-label={t("loading")}
        className="flex w-full flex-col gap-6"
        role="status"
      >
        <div className={cn(SKELETON_BLOCK_CLASS_NAME, "h-9 w-2/3")} />
        <div className={cn(SKELETON_BLOCK_CLASS_NAME, "aspect-video w-full")} />
        <div className={cn(SKELETON_BLOCK_CLASS_NAME, "h-24 w-full")} />
      </div>
    );
  }

  const product = productQuery.data;

  return (
    <article className="flex w-full flex-col gap-[var(--space-2xl)]">
      <DetailHeader product={product} />
      <DemoViewer
        demoPages={product.demoPages}
        isolatedPreviewUrl={product.isolatedPreviewUrl}
      />
      <SpecList
        changelog={product.changelog}
        compatibility={product.compatibility}
        documentationUrl={product.documentationUrl}
        specifications={product.specifications}
      />
      <LicenceComparison licenceOptions={product.licenceOptions} />
      <section
        aria-labelledby="reviews-heading"
        className="flex flex-col gap-2"
      >
        <h2
          className="text-xl font-semibold text-foreground"
          id="reviews-heading"
        >
          {t("reviews.heading")}
        </h2>
        <p className="text-sm text-muted-foreground" role="status">
          {t("reviews.empty")}
        </p>
      </section>
    </article>
  );
}
