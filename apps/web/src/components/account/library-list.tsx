"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { listLibrary } from "@/lib/commerce-client";
import { localeSchema } from "@shared/localization";

import { DownloadAction } from "./download-action";
import { formatOrderDate } from "./orders-list";

const LIBRARY_PAGE_SIZE = 10;

/**
 * `/[locale]/account/library`'s data-driven core: gates on the shared
 * session like `OrdersList`, then lists the caller's own entitlements via
 * the Round-2 commerce client's cursor-paginated `listLibrary`. Each row
 * hosts the `DownloadAction`, which never renders the short-lived signed
 * download URL it issues.
 */
export function LibraryList() {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Account.library");
  const tOrders = useTranslations("Account.orders");
  const session = useSession();
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/${locale}/auth/sign-in`);
    }
  }, [session.status, locale, router]);

  const libraryQuery = useQuery({
    queryKey: ["account", "library", cursor] as const,
    queryFn: () => listLibrary({ cursor, limit: LIBRARY_PAGE_SIZE }),
    enabled: session.status === "authenticated",
    placeholderData: keepPreviousData,
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

  if (libraryQuery.isLoading) {
    return <p role="status">{t("loading")}</p>;
  }

  if (libraryQuery.isError) {
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
          onClick={() => libraryQuery.refetch()}
          type="button"
          variant="outline"
        >
          {t("error.action")}
        </Button>
      </div>
    );
  }

  const entitlements = libraryQuery.data?.data ?? [];
  const meta = libraryQuery.data?.meta;
  const csrfToken = session.csrfToken;

  return (
    <section
      aria-labelledby="account-library-heading"
      className="flex flex-col gap-6"
    >
      <h1
        className="text-2xl font-semibold text-foreground"
        id="account-library-heading"
      >
        {t("heading")}
      </h1>
      <p className="text-sm text-muted-foreground">{tOrders("currencyNote")}</p>
      {entitlements.length === 0 ? (
        <p role="status">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entitlements.map((entitlement) => (
            <li
              className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
              key={entitlement.id}
            >
              <div>
                <p className="font-medium text-foreground">
                  {t("entitlementLabel", {
                    productId: entitlement.productId.slice(0, 8),
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("versionLabel")}: {entitlement.version} ·{" "}
                  {t("purchasedOnLabel")}:{" "}
                  {formatOrderDate(entitlement.createdAt, locale)}
                </p>
              </div>
              <DownloadAction
                csrfToken={csrfToken}
                entitlementId={entitlement.id}
              />
            </li>
          ))}
        </ul>
      )}
      {meta?.hasMore && meta.nextCursor ? (
        <Button
          disabled={libraryQuery.isFetching}
          onClick={() => setCursor(meta.nextCursor ?? undefined)}
          type="button"
          variant="outline"
        >
          {t("loadMore")}
        </Button>
      ) : null}
    </section>
  );
}
