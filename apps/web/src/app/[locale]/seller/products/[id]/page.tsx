"use client";

import { localeSchema } from "@shared/localization";
import type { SellerProductDetailResponse } from "@shared/seller";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { z } from "zod";

import { ProductAuthoringForm } from "@/components/seller/product-authoring-form";
import { ReviewStateBadge } from "@/components/seller/review-state-badge";
import { SubmitForReviewAction } from "@/components/seller/submit-for-review-action";
import { VersionForm } from "@/components/seller/version-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { ApiClientError } from "@/lib/api-client";
import { getSellerProductById } from "@/lib/seller-client";

const productIdSchema = z.string().uuid();

interface SellerProductDetailPageProps {
  params: Promise<{ id: string }>;
}

function productQueryKey(productId: string) {
  return ["seller", "products", "detail", productId] as const;
}

/**
 * `/[locale]/seller/products/[id]` — edit an owned draft's authoring
 * content, add versions, and submit a version for review. Every mutating
 * action here goes through `ProductAuthoringForm`/`VersionForm`/
 * `SubmitForReviewAction`; this page only fetches the product and re-renders
 * it after each success. It never calls, and has no way to call, a publish/
 * approve endpoint — that transition is admin-only (design §5/§8) and isn't
 * reachable from anywhere in this surface.
 */
export default function SellerProductDetailPage({
  params,
}: SellerProductDetailPageProps) {
  const { id } = use(params);
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Seller.productDetail");
  const session = useSession();
  const queryClient = useQueryClient();
  const parsedId = productIdSchema.safeParse(id);

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/${locale}/auth/sign-in`);
    }
  }, [session.status, locale, router]);

  const productQuery = useQuery({
    queryKey: productQueryKey(id),
    queryFn: () => getSellerProductById(id),
    enabled: session.status === "authenticated" && parsedId.success,
    retry: false,
  });

  if (session.status === "loading" || session.status === "unauthenticated") {
    return (
      <p role="status">
        {t(session.status === "loading" ? "loading" : "redirecting")}
      </p>
    );
  }

  if (session.status === "error") {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)]"
        role="alert"
      >
        <p className="text-base font-semibold text-foreground">
          {t("error.heading")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("error.description")}
        </p>
        <Button onClick={session.refetch} type="button" variant="outline">
          {t("error.action")}
        </Button>
      </div>
    );
  }

  const isNotFound =
    !parsedId.success ||
    (productQuery.isError &&
      productQuery.error instanceof ApiClientError &&
      productQuery.error.status === 404);

  if (isNotFound) {
    return (
      <div
        className="flex w-full flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)] text-center"
        role="status"
      >
        <h1 className="text-lg font-semibold text-foreground">
          {t("notFound.heading")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("notFound.description")}
        </p>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={`/${locale}/seller`}
        >
          {t("notFound.cta")}
        </Link>
      </div>
    );
  }

  if (productQuery.isLoading) {
    return <p role="status">{t("loading")}</p>;
  }

  if (productQuery.isError || !productQuery.data) {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)]"
        role="alert"
      >
        <p className="text-base font-semibold text-foreground">
          {t("error.heading")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("error.description")}
        </p>
        <Button
          onClick={() => productQuery.refetch()}
          type="button"
          variant="outline"
        >
          {t("error.action")}
        </Button>
      </div>
    );
  }

  const product = productQuery.data;
  const csrfToken = session.csrfToken;

  function updateProductCache(updated: SellerProductDetailResponse) {
    queryClient.setQueryData(productQueryKey(id), updated);
  }

  return (
    <section
      aria-labelledby="seller-product-detail-heading"
      className="flex flex-col gap-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          className="text-2xl font-semibold text-foreground"
          id="seller-product-detail-heading"
        >
          {product.slug}
        </h1>
        <ReviewStateBadge
          kind="publicationState"
          value={product.publicationState}
        />
      </div>

      <ProductAuthoringForm
        csrfToken={csrfToken}
        initialProduct={product}
        mode="edit"
        onSuccess={updateProductCache}
        productId={id}
      />

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          {t("versionsHeading")}
        </h2>
        {product.versions.length === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("noVersions")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {product.versions.map((version) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-border bg-background p-4"
                key={version.version}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-foreground">
                    {version.version}
                  </span>
                  <ReviewStateBadge
                    kind="reviewState"
                    value={version.reviewState}
                  />
                </div>
                {version.reviewState === "draft" ? (
                  <SubmitForReviewAction
                    csrfToken={csrfToken}
                    onSubmitted={() => void productQuery.refetch()}
                    productId={id}
                    version={version.version}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <VersionForm
          csrfToken={csrfToken}
          onSuccess={updateProductCache}
          productId={id}
        />
      </div>
    </section>
  );
}
