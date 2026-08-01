"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  CheckoutDialog,
  type CheckoutSummaryItem,
} from "@/components/checkout/checkout-dialog";
import { Button } from "@/components/ui/button";
import { useCart, type CartLineItem } from "@/lib/cart-store";

import { CartLine } from "./cart-line";

/**
 * Builds this cart line's display-only checkout summary entry. Returns
 * `null` when the line is missing display metadata (only possible for a
 * cart persisted by a different app version — never for a line this app's
 * own add-to-cart flow created) so the checkout dialog never renders a
 * fabricated title or price.
 */
function toCheckoutSummaryItem(item: CartLineItem): CheckoutSummaryItem | null {
  if (
    item.title === undefined ||
    item.unitPriceMinor === undefined ||
    item.currency === undefined
  ) {
    return null;
  }

  return {
    productId: item.productId,
    licence: item.licence,
    title: item.title,
    unitPrice: { amount: item.unitPriceMinor, currency: item.currency },
  };
}

/**
 * `/[locale]/cart`'s data-driven core: renders the client-only cart store
 * directly (no server call — design §1/§9), and hosts the "Proceed to
 * checkout" control that opens the `CheckoutDialog` with this cart's
 * display items. All money shown here is display-only; the store carries no
 * total authority, and checkout itself only ever sends `{productId, licence}`.
 */
export function CartView() {
  const t = useTranslations("Cart.page");
  const { items, removeItem, clear } = useCart();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const checkoutItems = items
    .map(toCheckoutSummaryItem)
    .filter((item): item is CheckoutSummaryItem => item !== null);

  return (
    <section aria-labelledby="cart-heading" className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground" id="cart-heading">
        {t("heading")}
      </h1>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("empty")}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={`${item.productId}:${item.licence}`}>
                <CartLine
                  item={item}
                  onRemove={() => removeItem(item.productId, item.licence)}
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={clear} type="button" variant="outline">
              {t("clear")}
            </Button>
            <Button
              disabled={checkoutItems.length === 0}
              onClick={() => setCheckoutOpen(true)}
              type="button"
            >
              {t("checkout")}
            </Button>
          </div>
        </>
      )}

      <CheckoutDialog
        items={checkoutItems}
        onOpenChange={setCheckoutOpen}
        open={checkoutOpen}
      />
    </section>
  );
}
