"use client";

import type { LicenceIdentifier } from "@shared/catalogue";
import type { Money } from "@shared/money";
import { localeSchema } from "@shared/localization";
import { useLocale, useTranslations } from "next-intl";

import { formatMoney } from "@/lib/format";

/**
 * A display-only checkout line: everything here (title, unit price) is a
 * lookup the caller already has (e.g. from the catalogue or cart page) for
 * rendering only. `unitPrice` is always the item's **VND** price — Wave-1
 * checkout prices every order in VND regardless of the storefront's
 * USD/VND display toggle (`apps/api/src/commerce/checkout.service.ts`),
 * so a mismatched currency here would show the shopper a total that isn't
 * what checkout will actually charge.
 */
export interface CheckoutSummaryItem {
  productId: string;
  licence: LicenceIdentifier;
  title: string;
  unitPrice: Money;
}

export interface OrderSummaryProps {
  items: CheckoutSummaryItem[];
}

function sumTotal(items: CheckoutSummaryItem[]): Money {
  return {
    amount: items.reduce((sum, item) => sum + item.unitPrice.amount, 0),
    currency: "VND",
  };
}

function licenceLabelKey(licence: LicenceIdentifier): LicenceIdentifier {
  return licence;
}

/**
 * The checkout dialog/sheet's display-only order summary. Nothing rendered
 * here is authoritative — the server's checkout/order response is (design
 * §9 "Checkout/library flows / Tampering") — this component exists purely
 * so the shopper can see what they're about to buy before they submit.
 */
export function OrderSummary({ items }: OrderSummaryProps) {
  const locale = localeSchema.parse(useLocale());
  const t = useTranslations("Checkout.summary");
  const tLicence = useTranslations("Checkout.licence");

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("emptyItems")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
        {t("heading")}
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            className="flex items-baseline justify-between gap-3 text-sm"
            key={`${item.productId}:${item.licence}`}
          >
            <span className="text-foreground">
              {item.title}{" "}
              <span className="text-muted-foreground">
                ({tLicence(licenceLabelKey(item.licence))})
              </span>
            </span>
            <span className="font-medium text-foreground">
              {formatMoney(item.unitPrice, locale)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-border pt-3 text-base font-semibold text-foreground">
        <span>{t("totalLabel")}</span>
        <span>{formatMoney(sumTotal(items), locale)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t("currencyNote")}</p>
    </div>
  );
}
