"use client";

import type { Order, OrderStatus } from "@shared/commerce";
import type { Locale } from "@shared/localization";
import { localeSchema } from "@shared/localization";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { getOrderById } from "@/lib/commerce-client";

const ORDER_DATE_INTL_LOCALES: Record<Locale, string> = {
  vi: "vi-VN",
  en: "en-US",
};

function formatOrderDate(createdAt: string, locale: Locale): string {
  return new Intl.DateTimeFormat(ORDER_DATE_INTL_LOCALES[locale], {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(createdAt));
}

const STATUS_COPY_KEYS: Record<
  OrderStatus,
  {
    heading: "settledHeading" | "pendingHeading" | "cancelledHeading";
    description:
      "settledDescription" | "pendingDescription" | "cancelledDescription";
  }
> = {
  settled: { heading: "settledHeading", description: "settledDescription" },
  pending: { heading: "pendingHeading", description: "pendingDescription" },
  cancelled: {
    heading: "cancelledHeading",
    description: "cancelledDescription",
  },
};

/**
 * The result the checkout dialog/sheet routes to once the sandbox settle
 * call resolves. Reads the resulting order back through the same
 * `commerce-client` the dialog used (design §9 — the order the shopper sees
 * here is the server's own record, not anything the client claimed), and
 * renders only the shared `orderSchema` allowlist: no payment reference,
 * provider field, idempotency key, or owner id ever reaches this screen
 * because the client's response schema already excludes them.
 */
export default function CheckoutResultPage() {
  const locale = localeSchema.parse(useLocale());
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const t = useTranslations("Checkout.result");
  const tLicence = useTranslations("Checkout.licence");

  const orderQuery = useQuery<Order>({
    enabled: orderId !== null,
    queryFn: () => getOrderById(orderId as string),
    queryKey: ["orders", orderId],
    // A failed lookup (unknown/non-owned order id) is not transient —
    // retrying would just repeat the same "not found" answer.
    retry: false,
  });

  if (orderId === null || orderQuery.isError) {
    return <p role="alert">{t("notFound")}</p>;
  }

  const order = orderQuery.data;
  if (!order) {
    return <p role="status">{t("loading")}</p>;
  }

  const statusCopy = STATUS_COPY_KEYS[order.status];

  return (
    <section
      aria-labelledby="checkout-result-heading"
      className="mx-auto flex w-full max-w-lg flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <h1
          className="text-xl font-semibold text-foreground"
          id="checkout-result-heading"
        >
          {t(statusCopy.heading)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(statusCopy.description)}
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">
            {t("orderDateLabel")}
          </dt>
          <dd className="text-base font-medium text-foreground">
            {formatOrderDate(order.createdAt, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t("totalLabel")}</dt>
          <dd className="text-base font-medium text-foreground">
            {formatMoney(order.total, locale)}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          {t("itemsHeading")}
        </h2>
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li
              className="flex items-baseline justify-between gap-3 text-sm"
              key={`${item.productId}:${item.licenceIdentifier}`}
            >
              <span className="text-foreground">
                {item.titleSnapshot}{" "}
                <span className="text-muted-foreground">
                  ({tLicence(item.licenceIdentifier)})
                </span>
              </span>
              <span className="font-medium text-foreground">
                {formatMoney(item.unitPrice, locale)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Link
        className={buttonVariants({ className: "w-fit" })}
        href={`/${locale}/account/library`}
      >
        {t("libraryLink")}
      </Link>
    </section>
  );
}
