"use client";

import type { LicenceIdentifier } from "@shared/catalogue";
import type { Money } from "@shared/money";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-store";

export interface AddToCartButtonProps {
  productId: string;
  licence: LicenceIdentifier;
  /** Display-only — captured alongside the canonical `{productId, licence}` pair, never sent to checkout. */
  title: string;
  slug: string;
  price: Money;
  className?: string;
}

/**
 * Adds `{ productId, licence }` to the client-only cart (design §1/§9),
 * carrying `title`/`slug`/`unitPriceMinor`/`currency` alongside it purely as
 * advisory display metadata — the caller (a product card or the
 * product-detail header) already has this from the catalogue read that
 * rendered it. Never calls a server endpoint; toggles to a remove action
 * once this exact product+licence pair is already in the cart.
 */
export function AddToCartButton({
  productId,
  licence,
  title,
  slug,
  price,
  className,
}: AddToCartButtonProps) {
  const t = useTranslations("Cart.addToCart");
  const { addItem, removeItem, hasItem } = useCart();
  const inCart = hasItem(productId, licence);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // The catalogue product card nests this button inside its own
    // clickable surface; stop the click from also triggering an ancestor
    // navigation handler.
    event.preventDefault();
    event.stopPropagation();

    if (inCart) {
      removeItem(productId, licence);
      return;
    }

    addItem({
      productId,
      licence,
      title,
      slug,
      unitPriceMinor: price.amount,
      currency: price.currency,
    });
  }

  return (
    <Button
      aria-label={t(inCart ? "removeLabelForTitle" : "addLabelForTitle", {
        title,
      })}
      aria-pressed={inCart}
      className={className}
      onClick={handleClick}
      type="button"
      variant={inCart ? "outline" : "default"}
    >
      {t(inCart ? "remove" : "add")}
    </Button>
  );
}
