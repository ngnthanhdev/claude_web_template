"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { listOrders } from "@/lib/commerce-client";
import { formatMoney } from "@/lib/format";
import { localeSchema, type Locale } from "@shared/localization";

const ORDERS_PAGE_SIZE = 10;

/**
 * Formats an ISO order timestamp for display. Shared with `order-detail.tsx`
 * and `library-list.tsx`, which show the same "placed on"/"purchased on"
 * dates against the same order/entitlement `createdAt` shape.
 */
export function formatOrderDate(createdAt: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(createdAt));
}

/**
 * `/[locale]/account/orders`'s data-driven core: gates on the shared
 * session (redirecting an unauthenticated visitor to sign-in, exactly like
 * `AccountPanel`), then lists the caller's own orders via the Round-2
 * commerce client's cursor-paginated `listOrders`. Every amount shown is
 * display-only — the server response is the sole money authority — and
 * Wave-1 orders are always billed in VND regardless of the storefront's
 * browsing-currency toggle, so a short note makes that explicit.
 */
export function OrdersList() {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Account.orders");
  const session = useSession();
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/${locale}/auth/sign-in`);
    }
  }, [session.status, locale, router]);

  const ordersQuery = useQuery({
    queryKey: ["account", "orders", cursor] as const,
    queryFn: () => listOrders({ cursor, limit: ORDERS_PAGE_SIZE }),
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

  if (ordersQuery.isLoading) {
    return <p role="status">{t("loading")}</p>;
  }

  if (ordersQuery.isError) {
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
          onClick={() => ordersQuery.refetch()}
          type="button"
          variant="outline"
        >
          {t("error.action")}
        </Button>
      </div>
    );
  }

  const orders = ordersQuery.data?.data ?? [];
  const meta = ordersQuery.data?.meta;

  return (
    <section
      aria-labelledby="account-orders-heading"
      className="flex flex-col gap-6"
    >
      <h1
        className="text-2xl font-semibold text-foreground"
        id="account-orders-heading"
      >
        {t("heading")}
      </h1>
      <p className="text-sm text-muted-foreground">{t("currencyNote")}</p>
      {orders.length === 0 ? (
        <p role="status">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                className="flex min-h-11 flex-col gap-1 rounded-[var(--radius-panel)] border border-border bg-background p-4 transition-colors duration-[var(--dur-short)] ease-[var(--ease-out)] hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4"
                href={`/${locale}/account/orders/${order.id}`}
              >
                <span className="font-medium text-foreground">
                  {t("orderNumber", { id: order.id.slice(0, 8) })}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatOrderDate(order.createdAt, locale)}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {t(`status.${order.status}`)}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {formatMoney(order.total, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {meta?.hasMore && meta.nextCursor ? (
        <Button
          disabled={ordersQuery.isFetching}
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
