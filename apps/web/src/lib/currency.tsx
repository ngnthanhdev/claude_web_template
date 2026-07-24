"use client";

import { currencySchema, type Currency } from "@shared/localization";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The marketplace's default display currency. Intentionally independent of
 * locale: a Vietnamese-language page and an English-language page both
 * start with the same currency until the shopper picks one explicitly.
 */
export const DEFAULT_CURRENCY: Currency = "VND";

const CURRENCY_STORAGE_KEY = "kitvera.currency";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(
  undefined,
);

function readStoredCurrency(): Currency | null {
  if (typeof window === "undefined") return null;

  const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
  const parsed = currencySchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

function writeStoredCurrency(currency: Currency): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
}

/**
 * Holds the shopper's VND/USD display-currency preference. This is
 * non-sensitive UI state (no secrets), stored in `localStorage` so it
 * survives client-side navigation, and is never derived from the active
 * next-intl locale.
 */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(DEFAULT_CURRENCY);

  useEffect(() => {
    const stored = readStoredCurrency();
    if (stored) setCurrencyState(stored);
  }, []);

  const setCurrency = useCallback((next: Currency) => {
    setCurrencyState(next);
    writeStoredCurrency(next);
  }, []);

  const value = useMemo(
    () => ({ currency, setCurrency }),
    [currency, setCurrency],
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
