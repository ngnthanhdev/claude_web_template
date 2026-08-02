"use client";

import { localeSchema } from "@shared/localization";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { ApiClientError } from "@/lib/api-client";
import { listSellerProducts } from "@/lib/seller-client";

import { ReviewStateBadge } from "./review-state-badge";

const SELLER_PRODUCTS_PAGE_SIZE = 20;

function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

/**
 * `/[locale]/seller`'s data-driven core. Uses `useInfiniteQuery` directly
 * (rather than the account area's shared `useAccountCollection`) because a
 * non-seller reaching this surface must see an explicit "not authorised"
 * state, not the generic error state — that distinction needs the raw fetch
 * error, which the shared hook doesn't expose. This client-side gate is
 * cosmetic only; the `seller` guard on the server is the real authority
 * (design §5/§8) — a non-seller who reaches this page never sees fabricated
 * data, only this honest 403 state.
 */
export function SellerProductList() {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Seller.list");
  const session = useSession();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/${locale}/auth/sign-in`);
    }
  }, [session.status, locale, router]);

  const productsQuery = useInfiniteQuery({
    queryKey: ["seller", "products"] as const,
    queryFn: ({ pageParam }) =>
      listSellerProducts({
        cursor: pageParam,
        limit: SELLER_PRODUCTS_PAGE_SIZE,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore
        ? (lastPage.meta.nextCursor ?? undefined)
        : undefined,
    enabled: session.status === "authenticated",
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

  if (productsQuery.isLoading) {
    return <p role="status">{t("loading")}</p>;
  }

  if (productsQuery.isError) {
    if (isForbiddenError(productsQuery.error)) {
      return (
        <div
          className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)]"
          role="alert"
        >
          <p className="text-base font-semibold text-foreground">
            {t("forbidden.heading")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("forbidden.description")}
          </p>
        </div>
      );
    }

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
          onClick={() => productsQuery.refetch()}
          type="button"
          variant="outline"
        >
          {t("error.action")}
        </Button>
      </div>
    );
  }

  const products = productsQuery.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <section
      aria-labelledby="seller-products-heading"
      className="flex flex-col gap-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          className="text-2xl font-semibold text-foreground"
          id="seller-products-heading"
        >
          {t("heading")}
        </h1>
        <Link
          className={buttonVariants({})}
          href={`/${locale}/seller/products/new`}
        >
          {t("createAction")}
        </Link>
      </div>
      {products.length === 0 ? (
        <p role="status">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((product) => (
            <li
              className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-background p-4"
              key={product.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  className="min-h-11 rounded-[var(--radius-control)] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:underline"
                  href={`/${locale}/seller/products/${product.id}`}
                >
                  {product.slug}
                </Link>
                <ReviewStateBadge
                  kind="publicationState"
                  value={product.publicationState}
                />
              </div>
              {product.versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noVersions")}
                </p>
              ) : (
                <ul className="flex flex-wrap items-center gap-3">
                  {product.versions.map((version) => (
                    <li
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                      key={version.version}
                    >
                      <span>{version.version}</span>
                      <ReviewStateBadge
                        kind="reviewState"
                        value={version.reviewState}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {productsQuery.hasNextPage ? (
        <Button
          disabled={productsQuery.isFetchingNextPage}
          onClick={() => void productsQuery.fetchNextPage()}
          type="button"
          variant="outline"
        >
          {t("loadMore")}
        </Button>
      ) : null}
    </section>
  );
}
