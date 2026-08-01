import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import type { LicenceOptions } from "@shared/catalogue";
import type { ProductDetailResponse } from "@shared/catalogue";
import type { Currency } from "@shared/localization";

import { CurrencyProvider, useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/format";

/**
 * `Intl.NumberFormat`'s `vi-VN` currency output separates the amount and
 * symbol with a non-breaking space; `getByText`'s default normalizer only
 * collapses whitespace in the rendered DOM text, not in a raw string
 * matcher, so queries built from `formatMoney(...)` need the same
 * collapsing applied before being used as a matcher.
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

import enMessages from "../../../messages/en/product.json";
import viMessages from "../../../messages/vi/product.json";
import ProductNotFound from "../../app/[locale]/templates/[slug]/not-found";
import { DemoViewer } from "./demo-viewer";
import { LicenceComparison } from "./licence-comparison";

const licenceOptions: LicenceOptions = [
  {
    identifier: "Regular",
    prices: [
      { amount: 1_290_000, currency: "VND" },
      { amount: 49_00, currency: "USD" },
    ],
  },
  {
    identifier: "Extended",
    prices: [
      { amount: 3_990_000, currency: "VND" },
      { amount: 159_00, currency: "USD" },
    ],
  },
];

const isolatedPreviewUrl = "https://preview-lotus.kitvera.example";
const demoPages: ProductDetailResponse["demoPages"] = [
  {
    position: 0,
    slug: "home",
    previewUrl: "https://preview-lotus.kitvera.example/home",
    translations: [
      { locale: "vi", title: "Trang chủ" },
      { locale: "en", title: "Home" },
    ],
  },
  {
    position: 1,
    slug: "pricing",
    previewUrl: "https://preview-lotus.kitvera.example/pricing",
    translations: [
      { locale: "vi", title: "Bảng giá" },
      { locale: "en", title: "Pricing" },
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

function renderLicenceComparison({
  locale,
  messages,
  currency = "VND",
}: {
  locale: "vi" | "en";
  messages: typeof enMessages;
  currency?: Currency;
}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CurrencyProvider>
        <CurrencyFixture currency={currency}>
          <LicenceComparison licenceOptions={licenceOptions} />
        </CurrencyFixture>
      </CurrencyProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("LicenceComparison", () => {
  it.each([
    {
      currency: "VND" as const,
      locale: "en" as const,
      messages: enMessages,
      regularAmount: 1_290_000,
      extendedAmount: 3_990_000,
      regularLabel: "Regular",
      extendedLabel: "Extended",
    },
    {
      currency: "USD" as const,
      locale: "en" as const,
      messages: enMessages,
      regularAmount: 49_00,
      extendedAmount: 159_00,
      regularLabel: "Regular",
      extendedLabel: "Extended",
    },
    {
      currency: "VND" as const,
      locale: "vi" as const,
      messages: viMessages,
      regularAmount: 1_290_000,
      extendedAmount: 3_990_000,
      regularLabel: "Tiêu chuẩn",
      extendedLabel: "Mở rộng",
    },
    {
      currency: "USD" as const,
      locale: "vi" as const,
      messages: viMessages,
      regularAmount: 49_00,
      extendedAmount: 159_00,
      regularLabel: "Tiêu chuẩn",
      extendedLabel: "Mở rộng",
    },
  ])(
    "renders both licences' $currency prices via the Round-1 formatter in $locale",
    ({
      currency,
      locale,
      messages,
      regularAmount,
      extendedAmount,
      regularLabel,
      extendedLabel,
    }) => {
      renderLicenceComparison({ locale, messages, currency });

      expect(screen.getByText(regularLabel)).toBeInTheDocument();
      expect(screen.getByText(extendedLabel)).toBeInTheDocument();
      expect(
        screen.getByText(
          normalizeWhitespace(
            formatMoney({ amount: regularAmount, currency }, locale),
          ),
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          normalizeWhitespace(
            formatMoney({ amount: extendedAmount, currency }, locale),
          ),
        ),
      ).toBeInTheDocument();
    },
  );

  it("defaults to the Regular licence selected", () => {
    renderLicenceComparison({ locale: "en", messages: enMessages });

    expect(screen.getByRole("radio", { name: /^Regular/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^Extended/ })).not.toBeChecked();
  });

  it("lets the shopper switch the selected licence", async () => {
    const user = userEvent.setup();
    renderLicenceComparison({ locale: "en", messages: enMessages });

    await user.click(screen.getByRole("radio", { name: /^Extended/ }));

    expect(screen.getByRole("radio", { name: /^Extended/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^Regular/ })).not.toBeChecked();
  });

  it("has no detectable accessibility violations in either locale", async () => {
    const { container: en } = renderLicenceComparison({
      locale: "en",
      messages: enMessages,
    });
    expect((await axe(en)).violations).toEqual([]);
    cleanup();

    const { container: vi } = renderLicenceComparison({
      locale: "vi",
      messages: viMessages,
    });
    expect((await axe(vi)).violations).toEqual([]);
  });
});

describe("ProductNotFound", () => {
  function renderNotFound(locale: "vi" | "en", messages: typeof enMessages) {
    return render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ProductNotFound />
      </NextIntlClientProvider>,
    );
  }

  it.each([
    {
      locale: "en" as const,
      messages: enMessages,
      heading: "We couldn't find that template",
      action: "Browse the catalogue",
    },
    {
      locale: "vi" as const,
      messages: viMessages,
      heading: "Không tìm thấy mẫu này",
      action: "Xem danh mục sản phẩm",
    },
  ])(
    "renders the localized not-found copy for $locale without implying why the slug failed",
    ({ locale, messages, heading, action }) => {
      renderNotFound(locale, messages);

      expect(
        screen.getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
      const link = screen.getByRole("link", { name: action });
      expect(link).toHaveAttribute("href", `/${locale}/search`);
    },
  );

  it("has no detectable accessibility violations", async () => {
    const { container } = renderNotFound("en", enMessages);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("DemoViewer", () => {
  function renderDemoViewer(locale: "vi" | "en", messages: typeof enMessages) {
    return render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <DemoViewer
          demoPages={demoPages}
          isolatedPreviewUrl={isolatedPreviewUrl}
        />
      </NextIntlClientProvider>,
    );
  }

  it("renders the live demo in a cross-origin iframe sandboxed against the storefront session", () => {
    renderDemoViewer("en", enMessages);

    const frame = screen.getByTitle("Live demo preview");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("src")).toBe(isolatedPreviewUrl);
    // No `allow-same-origin`, `allow-popups`, or `allow-top-navigation*`: the
    // frame can never read the storefront's cookies/CSRF state or navigate
    // the parent tab, regardless of what the framed page does.
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-forms");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("switches the framed preview when a different demo page is selected", async () => {
    const user = userEvent.setup();
    renderDemoViewer("en", enMessages);

    const homeButton = screen.getByRole("button", { name: "Home" });
    expect(homeButton).toHaveAttribute("aria-pressed", "false");

    await user.click(homeButton);

    expect(homeButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Home preview").getAttribute("src")).toBe(
      demoPages[0]?.previewUrl,
    );

    await user.click(screen.getByRole("button", { name: "Pricing" }));

    expect(screen.getByTitle("Pricing preview").getAttribute("src")).toBe(
      demoPages[1]?.previewUrl,
    );
  });

  it("localizes the live-demo and demo-page labels for Vietnamese", () => {
    renderDemoViewer("vi", viMessages);

    expect(
      screen.getByRole("button", { name: "Bản demo trực tiếp" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Trang chủ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bảng giá" }),
    ).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    // `iframes: false` — axe-core's cross-frame scan uses `postMessage` to
    // recurse into the framed document, which jsdom's non-navigating
    // `<iframe>` can't answer; the frame itself (title, sandbox) is already
    // covered by the attribute assertions above.
    const { container } = renderDemoViewer("en", enMessages);
    expect((await axe(container, { iframes: false })).violations).toEqual([]);
  });
});
