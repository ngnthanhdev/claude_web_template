"use client";

import { slugSchema } from "@shared/catalogue";
import { checkoutItemSchema } from "@shared/commerce";
import { currencySchema } from "@shared/localization";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";

/**
 * A cart line is always the canonical `{ productId, licence }` pair —
 * the same shape checkout sends server-side — plus **optional, advisory**
 * display metadata (`title`, `slug`, `unitPriceMinor`, `currency`) captured
 * at add-to-cart time from whatever catalogue read rendered the add-to-cart
 * affordance (a product card or the product-detail header). None of it
 * carries money authority: `unitPriceMinor`/`currency` exist only so the
 * cart page can render a price without re-fetching, and checkout still
 * builds its request from `productId`/`licence` alone — the server is the
 * only authoritative source of price (design §1/§9 client-cart trust model).
 */
const cartDisplayMetaSchema = z
  .object({
    title: z.string().trim().min(1),
    slug: slugSchema,
    unitPriceMinor: z.number().int().nonnegative().safe(),
    currency: currencySchema,
  })
  .partial();

const cartLineItemSchema = z
  .object({
    ...checkoutItemSchema.shape,
    ...cartDisplayMetaSchema.shape,
  })
  .strict();

export type CartLineItem = z.infer<typeof cartLineItemSchema>;

const CART_STORAGE_KEY = "kitvera.cart";
const storedCartSchema = z.array(cartLineItemSchema);

interface CartContextValue {
  /** The current browser-side cart lines. */
  items: CartLineItem[];
  /** Number of distinct lines in the cart. */
  count: number;
  /** Adds a `{ productId, licence }` line. A no-op if that exact line is already present. */
  addItem: (item: CartLineItem) => void;
  /** Removes the line matching this exact `productId` + `licence` pair, if present. */
  removeItem: (productId: string, licence: CartLineItem["licence"]) => void;
  /** Empties the cart. */
  clear: () => void;
  /** Whether this exact `productId` + `licence` pair is already in the cart. */
  hasItem: (productId: string, licence: CartLineItem["licence"]) => boolean;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

function isSameLine(
  line: CartLineItem,
  match: { productId: string; licence: CartLineItem["licence"] },
): boolean {
  return line.productId === match.productId && line.licence === match.licence;
}

/**
 * Reads the persisted cart, if any. A malformed or tampered payload (wrong
 * shape, extra fields, unknown licence) is discarded rather than trusted —
 * this is client-only convenience state, never data the app relies on for
 * anything security- or money-relevant.
 */
function readStoredCart(): CartLineItem[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(CART_STORAGE_KEY);
  if (!raw) return [];

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return [];
  }

  const parsed = storedCartSchema.safeParse(parsedJson);
  return parsed.success ? parsed.data : [];
}

function writeStoredCart(items: CartLineItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
}

/**
 * Holds the shopper's browser-side cart: a plain `{ productId, licence }`
 * list with no server cart, no guest-cart id, and no merge-on-login step
 * (design §1/§9 client-cart trust model). Persisted to `localStorage` so it
 * survives client-side navigation, mirroring `CurrencyProvider`.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLineItem[]>([]);

  useEffect(() => {
    setItems(readStoredCart());
  }, []);

  const addItem = useCallback((item: CartLineItem) => {
    const validItem = cartLineItemSchema.parse(item);
    setItems((current) => {
      if (current.some((line) => isSameLine(line, validItem))) return current;
      const next = [...current, validItem];
      writeStoredCart(next);
      return next;
    });
  }, []);

  const removeItem = useCallback(
    (productId: string, licence: CartLineItem["licence"]) => {
      setItems((current) => {
        const next = current.filter(
          (line) => !isSameLine(line, { productId, licence }),
        );
        writeStoredCart(next);
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => {
    setItems([]);
    writeStoredCart([]);
  }, []);

  const hasItem = useCallback(
    (productId: string, licence: CartLineItem["licence"]) =>
      items.some((line) => isSameLine(line, { productId, licence })),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({ items, count: items.length, addItem, removeItem, clear, hasItem }),
    [items, addItem, removeItem, clear, hasItem],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
