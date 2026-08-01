import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { Providers } from "@/components/providers";
import { useSession, type UseSessionResult } from "@/hooks/use-session";
import { useCart } from "@/lib/cart-store";
import { formatMoney } from "@/lib/format";
import enCart from "../../../messages/en/cart.json";
import enCheckout from "../../../messages/en/checkout.json";
import viCart from "../../../messages/vi/cart.json";
import viCheckout from "../../../messages/vi/checkout.json";

import { CartNavEntry } from "./cart-nav-entry";
import { CartView } from "./cart-view";

// The reduced-motion branch of the checkout dialog renders synchronously
// (no in-flight animation), which keeps open/close assertions deterministic
// in jsdom — mirrors `checkout-dialog.test.tsx`.
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => true };
});

// `CheckoutDialog` (rendered by `CartView`) calls `useRouter`/`useSearchParams`
// unconditionally, so the app-router context needs a stand-in even in tests
// that never open the dialog — mirrors `checkout-dialog.test.tsx`.
const mockRouterPush = vi.fn();
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
      push: mockRouterPush,
      refresh: vi.fn(),
      replace: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@/hooks/use-session", () => ({ useSession: vi.fn() }));
const mockedUseSession = vi.mocked(useSession);

const PRODUCT_A = "2a80d74e-6f18-48a6-9034-7b79a8af93e9";
const PRODUCT_B = "5c1e9b8a-df9a-4b9a-9b0e-9a2f6b7d9e21";

function authenticatedSession(): UseSessionResult {
  return {
    status: "authenticated",
    user: {
      id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      email: "buyer@example.com",
    },
    session: {
      id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      expiresAt: "2026-08-23T10:15:00.000Z",
    },
    csrfToken: "csrf-token-value",
    signOut: vi.fn(),
    signOutAll: vi.fn(),
    isSigningOutCurrent: false,
    isSigningOutAll: false,
    signOutError: null,
    refetch: vi.fn(),
  };
}

/**
 * A minimal harness that adds/removes cart lines through the real store
 * (the same path `AddToCartButton` uses), so these tests exercise `CartView`
 * and `CartNavEntry` against genuine cart-store state rather than mocks.
 */
function CartFixtureControls() {
  const { addItem, removeItem } = useCart();

  return (
    <div>
      <button
        onClick={() =>
          addItem({
            productId: PRODUCT_A,
            licence: "Regular",
            title: "Lotus Commerce",
            slug: "lotus-commerce",
            unitPriceMinor: 1_290_000,
            currency: "VND",
          })
        }
        type="button"
      >
        Add Lotus Commerce
      </button>
      <button
        onClick={() =>
          addItem({
            productId: PRODUCT_B,
            licence: "Extended",
            title: "Aurora Blocks",
            slug: "aurora-blocks",
            unitPriceMinor: 990_000,
            currency: "VND",
          })
        }
        type="button"
      >
        Add Aurora Blocks
      </button>
      <button onClick={() => removeItem(PRODUCT_A, "Regular")} type="button">
        Remove Lotus Commerce
      </button>
    </div>
  );
}

function messagesFor(locale: "en" | "vi") {
  return locale === "en"
    ? { ...enCart, ...enCheckout }
    : { ...viCart, ...viCheckout };
}

function renderCartView(locale: "en" | "vi" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <Providers>
        <CartFixtureControls />
        <CartNavEntry />
        <CartView />
      </Providers>
    </NextIntlClientProvider>,
  );
}

function cartNavLabel(locale: "en" | "vi", count: number): string {
  const template =
    locale === "en" ? enCart.Cart.navEntry.label : viCart.Cart.navEntry.label;
  return template.replace("{count}", String(count));
}

beforeEach(() => {
  mockedUseSession.mockReturnValue(authenticatedSession());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("CartView empty state", () => {
  it("shows an honest empty state and no checkout control", () => {
    renderCartView();

    expect(screen.getByRole("status")).toHaveTextContent(
      enCart.Cart.page.empty,
    );
    expect(
      screen.queryByRole("button", { name: enCart.Cart.page.checkout }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: cartNavLabel("en", 0) }),
    ).toHaveAttribute("href", "/en/cart");
  });
});

describe("CartView add/remove", () => {
  it("reflects an added line (title, licence, display price) and the shell's cart-count badge", async () => {
    const user = userEvent.setup();
    renderCartView();

    await user.click(
      screen.getByRole("button", { name: "Add Lotus Commerce" }),
    );

    expect(screen.getByText("Lotus Commerce")).toBeInTheDocument();
    expect(
      screen.getByText(enCheckout.Checkout.licence.Regular),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        formatMoney({ amount: 1_290_000, currency: "VND" }, "en"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: cartNavLabel("en", 1) }),
    ).toBeInTheDocument();
  });

  it("removes a line back to the empty state and updates the cart-count badge", async () => {
    const user = userEvent.setup();
    renderCartView();

    await user.click(
      screen.getByRole("button", { name: "Add Lotus Commerce" }),
    );
    expect(screen.getByText("Lotus Commerce")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: enCart.Cart.line.removeLabel.replace("{title}", "Lotus Commerce"),
      }),
    );

    expect(screen.queryByText("Lotus Commerce")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      enCart.Cart.page.empty,
    );
    expect(
      screen.getByRole("link", { name: cartNavLabel("en", 0) }),
    ).toBeInTheDocument();
  });

  it("clears every line via the clear-cart control", async () => {
    const user = userEvent.setup();
    renderCartView();

    await user.click(
      screen.getByRole("button", { name: "Add Lotus Commerce" }),
    );
    await user.click(screen.getByRole("button", { name: "Add Aurora Blocks" }));
    expect(
      screen.getByRole("link", { name: cartNavLabel("en", 2) }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: enCart.Cart.page.clear }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      enCart.Cart.page.empty,
    );
  });
});

describe("CartView checkout hand-off", () => {
  it("opens the checkout dialog with the cart's display items on 'Proceed to checkout'", async () => {
    const user = userEvent.setup();
    renderCartView();

    await user.click(
      screen.getByRole("button", { name: "Add Lotus Commerce" }),
    );
    await user.click(
      screen.getByRole("button", { name: enCart.Cart.page.checkout }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(enCheckout.Checkout.dialog.sandboxLabel),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Lotus Commerce")).toBeInTheDocument();
  });
});

describe("CartView accessibility", () => {
  it("has no detectable accessibility violations when empty", async () => {
    const { container } = renderCartView();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("has no detectable accessibility violations with items in the cart", async () => {
    const user = userEvent.setup();
    const { container } = renderCartView();

    await user.click(
      screen.getByRole("button", { name: "Add Lotus Commerce" }),
    );

    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("cart.json locale parity", () => {
  function collectKeys(value: unknown, prefix = ""): string[] {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return [prefix];
    }

    return Object.entries(value).flatMap(([key, nested]) =>
      collectKeys(nested, prefix ? `${prefix}.${key}` : key),
    );
  }

  it("keeps the vi and en Cart message catalogues on exactly the same key set", () => {
    expect(collectKeys(viCart).sort()).toEqual(collectKeys(enCart).sort());
  });
});
