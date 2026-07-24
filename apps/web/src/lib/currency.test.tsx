import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import { CurrencyProvider, useCurrency } from "./currency";
import { formatMoney } from "./format";

function CurrencyProbe() {
  const { currency, setCurrency } = useCurrency();

  return (
    <div>
      <span data-testid="currency-value">{currency}</span>
      <button onClick={() => setCurrency("USD")}>Use USD</button>
      <button onClick={() => setCurrency("VND")}>Use VND</button>
    </div>
  );
}

function renderWithLocale(locale: "vi" | "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={{}}>
      <CurrencyProvider>
        <CurrencyProbe />
      </CurrencyProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("currency selection is independent of locale", () => {
  it.each([["vi"], ["en"]] as const)(
    "defaults to VND under the %s locale",
    (locale) => {
      renderWithLocale(locale);
      expect(screen.getByTestId("currency-value")).toHaveTextContent("VND");
    },
  );

  it("lets the shopper switch to USD while the locale is English", async () => {
    const user = userEvent.setup();
    renderWithLocale("en");

    await user.click(screen.getByRole("button", { name: "Use USD" }));

    expect(screen.getByTestId("currency-value")).toHaveTextContent("USD");
  });

  it("lets the shopper switch back to VND while the locale is Vietnamese", async () => {
    const user = userEvent.setup();
    renderWithLocale("vi");

    await user.click(screen.getByRole("button", { name: "Use USD" }));
    expect(screen.getByTestId("currency-value")).toHaveTextContent("USD");

    await user.click(screen.getByRole("button", { name: "Use VND" }));
    expect(screen.getByTestId("currency-value")).toHaveTextContent("VND");
  });

  it("persists the selected currency across a provider remount (client navigation)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithLocale("vi");

    await user.click(screen.getByRole("button", { name: "Use USD" }));
    expect(screen.getByTestId("currency-value")).toHaveTextContent("USD");

    unmount();
    renderWithLocale("en");

    await waitFor(() =>
      expect(screen.getByTestId("currency-value")).toHaveTextContent("USD"),
    );
  });
});

describe("formatMoney is minor-unit-aware, keyed on {currency, locale}", () => {
  it.each([
    { locale: "vi" as const, tag: "vi-VN" },
    { locale: "en" as const, tag: "en-US" },
  ])("formats a zero-decimal VND amount using $tag", ({ locale, tag }) => {
    const money = { amount: 1_290_000, currency: "VND" as const };
    const expected = new Intl.NumberFormat(tag, {
      style: "currency",
      currency: "VND",
    }).format(money.amount);

    const formatted = formatMoney(money, locale);
    expect(formatted).toBe(expected);
    // VND has 0 minor-unit digits: the digit sequence round-trips exactly.
    expect(formatted.replace(/\D/g, "")).toBe(String(money.amount));
  });

  it.each([
    { locale: "vi" as const, tag: "vi-VN" },
    { locale: "en" as const, tag: "en-US" },
  ])(
    "formats a two-decimal USD amount from minor units using $tag",
    ({ locale, tag }) => {
      const money = { amount: 4_900, currency: "USD" as const };
      const expected = new Intl.NumberFormat(tag, {
        style: "currency",
        currency: "USD",
      }).format(money.amount / 100);

      const formatted = formatMoney(money, locale);
      expect(formatted).toBe(expected);
      // USD has 2 minor-unit digits: the digit sequence round-trips exactly.
      expect(formatted.replace(/\D/g, "")).toBe(String(money.amount));
    },
  );

  it("formats the same minor-unit amount differently across currencies", () => {
    const vnd = formatMoney({ amount: 100, currency: "VND" }, "en");
    const usd = formatMoney({ amount: 100, currency: "USD" }, "en");

    expect(vnd).not.toBe(usd);
  });
});
