"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { z } from "zod";

import { Button, buttonVariants } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { ApiClientError } from "@/lib/api-client";
import { getOrderById } from "@/lib/commerce-client";
import { formatMoney } from "@/lib/format";
import { localeSchema } from "@shared/localization";

import { formatOrderDate } from "./orders-list";

const orderIdSchema = z.string().uuid();

export interface OrderDetailProps {
  /** The route's raw `[id]` segment — validated here, not assumed to be a UUID. */
  orderId: string;
}

/**
 * `/[locale]/account/orders/[id]`'s data-driven core. Gates on the shared
 * session like `OrdersList`, then fetches the single order via the Round-2
 * commerce client's `getOrderById` (already scoped to `session.user.id`
 * server-side). A malformed id or a `404` from a non-owned/unknown order id
 * both surface the same honest not-found state — never a distinct message
 * that would let a caller probe which ids exist for someone else's account
 * (design §9 "Order read / Elevation (BOLA/IDOR)").
 */
export function OrderDetail({ orderId }: OrderDetailProps) {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Account.orderDetail");
  const tOrders = useTranslations("Account.orders");
  const session = useSession();
  const parsedId = orderIdSchema.safeParse(orderId);

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/${locale}/auth/sign-in`);
    }
  }, [session.status, locale, router]);

  const orderQuery = useQuery({
    queryKey: ["account", "orders", "detail", orderId] as const,
    queryFn: () => getOrderById(orderId),
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
    (orderQuery.isError &&
      orderQuery.error instanceof ApiClientError &&
      orderQuery.error.status === 404);

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
          href={`/${locale}/account/orders`}
        >
          {t("notFound.cta")}
        </Link>
      </div>
    );
  }

  if (orderQuery.isLoading) {
    return <p role="status">{t("loading")}</p>;
  }

  if (orderQuery.isError || !orderQuery.data) {
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
          onClick={() => orderQuery.refetch()}
          type="button"
          variant="outline"
        >
          {t("error.action")}
        </Button>
      </div>
    );
  }

  const order = orderQuery.data;

  return (
    <section
      aria-labelledby="account-order-detail-heading"
      className="flex flex-col gap-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          className="text-2xl font-semibold text-foreground"
          id="account-order-detail-heading"
        >
          {t("heading", { id: order.id.slice(0, 8) })}
        </h1>
        <Link
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          href={`/${locale}/account/orders`}
        >
          {t("backToOrders")}
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">{tOrders("currencyNote")}</p>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">{t("statusLabel")}</dt>
          <dd className="text-base font-medium text-foreground">
            {tOrders(`status.${order.status}`)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            {t("placedOnLabel")}
          </dt>
          <dd className="text-base font-medium text-foreground">
            {formatOrderDate(order.createdAt, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t("totalLabel")}</dt>
          <dd className="text-base font-semibold text-foreground">
            {formatMoney(order.total, locale)}
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          {t("itemsHeading")}
        </h2>
        <ul className="flex flex-col gap-3">
          {order.items.map((item) => (
            <li
              className="flex flex-col gap-1 rounded-[var(--radius-panel)] border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
              key={`${item.productId}-${item.licenceIdentifier}-${item.version}`}
            >
              <div>
                <p className="font-medium text-foreground">
                  {item.titleSnapshot}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("itemLicenceLabel")}: {item.licenceIdentifier} ·{" "}
                  {t("itemVersionLabel")}: {item.version}
                </p>
              </div>
              <span className="text-sm font-medium text-foreground">
                {formatMoney(item.unitPrice, locale)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
