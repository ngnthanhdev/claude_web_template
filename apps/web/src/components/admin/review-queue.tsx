"use client";

import { localeSchema } from "@shared/localization";
import type { BuildVerdict } from "@shared/seller";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { listReviewQueue } from "@/lib/admin-client";

import { isAdminForbiddenError } from "./admin-nav-entry";
import { ReviewActions } from "./review-actions";

const REVIEW_QUEUE_PAGE_SIZE = 20;

const VERDICT_TONE: Record<BuildVerdict, string> = {
  pending: "border-border bg-muted text-muted-foreground",
  passed: "border-primary bg-primary text-primary-foreground",
  failed: "border-destructive bg-background text-destructive",
};

function VerdictBadge({ verdict }: { verdict: BuildVerdict }) {
  const t = useTranslations("Admin.states");
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${VERDICT_TONE[verdict]}`}
    >
      {t(`buildVerdict.${verdict}`)}
    </span>
  );
}

/**
 * `/[locale]/admin/review`'s data-driven core: the `in_review` `ProductVersion`
 * queue with QA/scan verdict metadata (design §5), each row hosting the
 * approve/reject transition. This client-side gate is cosmetic only — the
 * `admin` role guard on the server is the real authority (design §4/§8), so a
 * non-admin who reaches this page never sees fabricated data, only the
 * honest `403` state below.
 */
export function ReviewQueue() {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Admin.review");
  const session = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/${locale}/auth/sign-in`);
    }
  }, [session.status, locale, router]);

  const queueQuery = useInfiniteQuery({
    queryKey: ["admin", "review-queue"] as const,
    queryFn: ({ pageParam }) =>
      listReviewQueue({ cursor: pageParam, limit: REVIEW_QUEUE_PAGE_SIZE }),
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

  if (queueQuery.isLoading) {
    return <p role="status">{t("loading")}</p>;
  }

  if (queueQuery.isError) {
    if (isAdminForbiddenError(queueQuery.error)) {
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
          onClick={() => queueQuery.refetch()}
          type="button"
          variant="outline"
        >
          {t("error.action")}
        </Button>
      </div>
    );
  }

  const items = queueQuery.data?.pages.flatMap((page) => page.data) ?? [];

  function invalidateQueue() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "review-queue"] });
  }

  return (
    <section
      aria-labelledby="admin-review-queue-heading"
      className="flex flex-col gap-6"
    >
      <h1
        className="text-2xl font-semibold text-foreground"
        id="admin-review-queue-heading"
      >
        {t("heading")}
      </h1>
      {items.length === 0 ? (
        <p role="status">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-background p-4"
              key={`${item.productId}:${item.version}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {item.productSlug} · {item.version}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("sellerLabel")}: {item.sellerId}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>
                  {t("qaLabel")}:{" "}
                  <VerdictBadge
                    verdict={item.latestBuildRun?.qaVerdict ?? "pending"}
                  />
                </span>
                <span>
                  {t("scanLabel")}:{" "}
                  <VerdictBadge
                    verdict={item.latestBuildRun?.scanVerdict ?? "pending"}
                  />
                </span>
              </div>
              <ReviewActions
                csrfToken={session.csrfToken}
                // Deliberately NOT invalidating on approve: the approve-success
                // state hosts the "go to publish" pre-fill link (the primary
                // path to publish — there is no publishable-products list
                // endpoint). Invalidating here would refetch the queue,
                // dropping the now-approved row and unmounting that link before
                // the admin can use it. The row persists (its actions show the
                // approved state) until the query goes stale (60s) or the page
                // remounts. Reject has no follow-up affordance, so it refreshes.
                onRejected={invalidateQueue}
                productId={item.productId}
                version={item.version}
              />
            </li>
          ))}
        </ul>
      )}
      {queueQuery.hasNextPage ? (
        <Button
          disabled={queueQuery.isFetchingNextPage}
          onClick={() => void queueQuery.fetchNextPage()}
          type="button"
          variant="outline"
        >
          {t("loadMore")}
        </Button>
      ) : null}
    </section>
  );
}
