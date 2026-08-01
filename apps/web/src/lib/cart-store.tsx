"use client";

import { checkoutItemSchema, type CheckoutItem } from "@shared/commerce";
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
 * A cart line. Deliberately just `{ productId, licence }` — the same shape
 * checkout sends server-side — with no price, total, or currency field: the
 * cart never carries money authority, only what the shopper wants to buy.
 * Any amount shown next to a cart line elsewhere in the app is a display-only
 * lookup against the catalogue, and the server checkout/order response is
 * the only authoritative total.
 */
export type CartLineItem = CheckoutItem;

const CART_STORAGE_KEY = "kitvera.cart";
const storedCartSchema = z.array(checkoutItemSchema);

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
    const validItem = checkoutItemSchema.parse(item);
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
