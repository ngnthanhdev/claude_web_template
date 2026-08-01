"use client";

import { localeSchema } from "@shared/localization";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { CartLineItem } from "@/lib/cart-store";
import { formatMoney } from "@/lib/format";

export interface CartLineProps {
  item: CartLineItem;
  onRemove: () => void;
}

/**
 * One cart row: the advisory display metadata captured at add-to-cart time
 * (title, licence, price), and a remove action. Falls back to an honest
 * "unavailable" state for a line missing display metadata rather than
 * inventing a title or price — this can only happen for a cart persisted by
 * a future/older schema version, never through this app's own add-to-cart
 * flow, which always supplies the full metadata.
 */
export function CartLine({ item, onRemove }: CartLineProps) {
  const locale = localeSchema.parse(useLocale());
  const t = useTranslations("Cart.line");
  const tLicence = useTranslations("Checkout.licence");

  const price =
    item.unitPriceMinor !== undefined && item.currency !== undefined
      ? { amount: item.unitPriceMinor, currency: item.currency }
      : null;
  const title = item.title ?? t("unknownItem");

  return (
    <div className="flex min-h-11 flex-col items-start justify-between gap-3 rounded-[var(--radius-panel)] border border-border bg-background p-4 sm:flex-row sm:items-center">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">
          {tLicence(item.licence)}
        </p>
      </div>
      <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
        <span className="text-base font-semibold text-foreground">
          {price ? formatMoney(price, locale) : t("priceUnavailable")}
        </span>
        <Button
          aria-label={t("removeLabel", { title })}
          onClick={onRemove}
          type="button"
          variant="ghost"
        >
          {t("remove")}
        </Button>
      </div>
    </div>
  );
}
