import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import type {
  LocalizedCategorySummary,
  ProductCard as ProductCardData,
} from "@shared/catalogue";
import type { Currency } from "@shared/localization";

import { CurrencyProvider, useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import enMessages from "../../../messages/en/collection.json";
import viMessages from "../../../messages/vi/collection.json";
import { ProductCard } from "./product-card";

const product: ProductCardData = {
  id: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  slug: "lotus-commerce",
  publicationState: "published",
  category: "ecommerce",
  tags: ["fashion", "nextjs", "dark-mode", "headless"],
  translations: [
    {
      locale: "vi",
      title: "Bộ giao diện cửa hàng hiện đại",
      summary: "Một cửa hàng nhanh và dễ tuỳ chỉnh.",
    },
    {
      locale: "en",
      title: "Modern storefront template",
      summary: "A fast, adaptable commerce storefront.",
    },
  ],
  currentVersion: "1.4.0",
  thumbnailUrl: "https://media.kitvera.example/lotus/card.webp",
  licenceOptions: [
    {
      identifier: "Regular",
      prices: [
        { amount: 1_290_000, currency: "VND" },
        { amount: 4_900, currency: "USD" },
      ],
    },
    {
      identifier: "Extended",
      prices: [
        { amount: 3_990_000, currency: "VND" },
        { amount: 15_900, currency: "USD" },
      ],
    },
  ],
};

const categories: readonly LocalizedCategorySummary[] = [
  {
    slug: "ecommerce",
    translations: [
      { locale: "vi", name: "Thương mại điện tử", summary: "Mẫu cửa hàng." },
      { locale: "en", name: "eCommerce", summary: "Storefront templates." },
    ],
  },
];

/** Drives `useCurrency` to a specific currency for a render tree, without a UI switcher in scope. */
function CurrencyFixture({
  currency,
  children,
}: {
  currency: Currency;
  children: ReactNode;
}) {
  const { setCurrency } = useCurrency();
  useEffect(() => setCurrency(currency), [currency, setCurrency]);
  return children;
}

function renderCard({
  locale,
  messages,
  currency = "VND",
  licence = "Regular",
}: {
  locale: "vi" | "en";
  messages: typeof enMessages;
  currency?: Currency;
  licence?: "Regular" | "Extended";
}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CurrencyProvider>
        <CurrencyFixture currency={currency}>
          <ProductCard
            categories={categories}
            licence={licence}
            product={product}
          />
        </CurrencyFixture>
      </CurrencyProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ProductCard", () => {
  it.each([
    {
      locale: "vi" as const,
      messages: viMessages,
      title: "Bộ giao diện cửa hàng hiện đại",
      summary: "Một cửa hàng nhanh và dễ tuỳ chỉnh.",
      category: "Thương mại điện tử",
    },
    {
      locale: "en" as const,
      messages: enMessages,
      title: "Modern storefront template",
      summary: "A fast, adaptable commerce storefront.",
      category: "eCommerce",
    },
  ])(
    "renders the localized title, summary, and category for $locale",
    ({ locale, messages, title, summary, category }) => {
      renderCard({ locale, messages });

      expect(
        screen.getByRole("heading", { level: 3, name: title }),
      ).toBeInTheDocument();
      expect(screen.getByText(summary)).toBeInTheDocument();
      expect(screen.getByText(category)).toBeInTheDocument();
    },
  );

  it("links to the canonical product detail route for the active locale", () => {
    renderCard({ locale: "en", messages: enMessages });

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/en/templates/lotus-commerce",
    );
  });

  it("caps the visible tag badges and summarizes the remainder honestly", () => {
    renderCard({ locale: "en", messages: enMessages });

    expect(screen.getByText("fashion")).toBeInTheDocument();
    expect(screen.getByText("nextjs")).toBeInTheDocument();
    expect(screen.getByText("dark-mode")).toBeInTheDocument();
    expect(screen.queryByText("headless")).not.toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it.each([
    {
      currency: "VND" as const,
      licence: "Regular" as const,
      amount: 1_290_000,
      licenceLabel: "Regular",
    },
    {
      currency: "USD" as const,
      licence: "Regular" as const,
      amount: 4_900,
      licenceLabel: "Regular",
    },
    {
      currency: "VND" as const,
      licence: "Extended" as const,
      amount: 3_990_000,
      licenceLabel: "Extended",
    },
    {
      currency: "USD" as const,
      licence: "Extended" as const,
      amount: 15_900,
      licenceLabel: "Extended",
    },
  ])(
    "renders the $licence price in $currency via the Round-1 minor-unit-aware formatter",
    ({ currency, licence, amount, licenceLabel }) => {
      renderCard({ locale: "en", messages: enMessages, currency, licence });

      expect(
        screen.getByText(formatMoney({ amount, currency }, "en")),
      ).toBeInTheDocument();
      expect(screen.getByText(licenceLabel)).toBeInTheDocument();
    },
  );

  it("translates the licence tier label for the Vietnamese locale", () => {
    renderCard({ locale: "vi", messages: viMessages, licence: "Extended" });

    expect(screen.getByText("Mở rộng")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations in either locale", async () => {
    const { container: en } = renderCard({
      locale: "en",
      messages: enMessages,
    });
    expect((await axe(en)).violations).toEqual([]);
    cleanup();

    const { container: vi } = renderCard({
      locale: "vi",
      messages: viMessages,
    });
    expect((await axe(vi)).violations).toEqual([]);
  });
});
