import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { CartProvider, useCart } from "./cart-store";

const PRODUCT_A = "2a80d74e-6f18-48a6-9034-7b79a8af93e9";
const PRODUCT_B = "9c6c3e2c-5a3b-4f9a-9e33-3b2f2e6d5a11";

function CartProbe() {
  const { items, count, addItem, removeItem, clear } = useCart();

  return (
    <div>
      <span data-testid="cart-count">{count}</span>
      <ul>
        {items.map((item) => (
          <li key={`${item.productId}:${item.licence}`}>
            {item.productId}:{item.licence}
          </li>
        ))}
      </ul>
      <button
        onClick={() => addItem({ productId: PRODUCT_A, licence: "Regular" })}
      >
        Add product A (Regular)
      </button>
      <button
        onClick={() => addItem({ productId: PRODUCT_A, licence: "Extended" })}
      >
        Add product A (Extended)
      </button>
      <button
        onClick={() => addItem({ productId: PRODUCT_B, licence: "Regular" })}
      >
        Add product B (Regular)
      </button>
      <button onClick={() => removeItem(PRODUCT_A, "Regular")}>
        Remove product A (Regular)
      </button>
      <button onClick={clear}>Clear</button>
    </div>
  );
}

function renderCart() {
  return render(
    <CartProvider>
      <CartProbe />
    </CartProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("useCart outside a CartProvider", () => {
  it("throws instead of silently returning undefined state", () => {
    function Bare() {
      useCart();
      return null;
    }

    expect(() => render(<Bare />)).toThrow(
      "useCart must be used within a CartProvider",
    );
  });
});

describe("cart add/remove/clear", () => {
  it("starts empty", () => {
    renderCart();
    expect(screen.getByTestId("cart-count")).toHaveTextContent("0");
  });

  it("adds a line item", async () => {
    const user = userEvent.setup();
    renderCart();

    await user.click(
      screen.getByRole("button", { name: "Add product A (Regular)" }),
    );

    expect(screen.getByTestId("cart-count")).toHaveTextContent("1");
    expect(screen.getByText(`${PRODUCT_A}:Regular`)).toBeInTheDocument();
  });

  it("is idempotent when adding the exact same productId+licence twice", async () => {
    const user = userEvent.setup();
    renderCart();

    await user.click(
      screen.getByRole("button", { name: "Add product A (Regular)" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add product A (Regular)" }),
    );

    expect(screen.getByTestId("cart-count")).toHaveTextContent("1");
  });

  it("treats the same product with a different licence as an independent line", async () => {
    const user = userEvent.setup();
    renderCart();

    await user.click(
      screen.getByRole("button", { name: "Add product A (Regular)" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add product A (Extended)" }),
    );

    expect(screen.getByTestId("cart-count")).toHaveTextContent("2");
    expect(screen.getByText(`${PRODUCT_A}:Regular`)).toBeInTheDocument();
    expect(screen.getByText(`${PRODUCT_A}:Extended`)).toBeInTheDocument();
  });

  it("removes only the exact productId+licence line, leaving others independent", async () => {
    const user = userEvent.setup();
    renderCart();

    await user.click(
      screen.getByRole("button", { name: "Add product A (Regular)" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add product B (Regular)" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove product A (Regular)" }),
    );

    expect(screen.getByTestId("cart-count")).toHaveTextContent("1");
    expect(screen.queryByText(`${PRODUCT_A}:Regular`)).not.toBeInTheDocument();
    expect(screen.getByText(`${PRODUCT_B}:Regular`)).toBeInTheDocument();
  });

  it("clears every line", async () => {
    const user = userEvent.setup();
    renderCart();

    await user.click(
      screen.getByRole("button", { name: "Add product A (Regular)" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add product B (Regular)" }),
    );
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByTestId("cart-count")).toHaveTextContent("0");
  });
});

describe("cart persistence", () => {
  it("persists across a provider remount (client navigation)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderCart();

    await user.click(
      screen.getByRole("button", { name: "Add product A (Regular)" }),
    );
    expect(screen.getByTestId("cart-count")).toHaveTextContent("1");

    unmount();
    renderCart();

    expect(await screen.findByTestId("cart-count")).toHaveTextContent("1");
    expect(screen.getByText(`${PRODUCT_A}:Regular`)).toBeInTheDocument();
  });

  it("discards a tampered/malformed persisted cart instead of trusting it", () => {
    window.localStorage.setItem(
      "kitvera.cart",
      JSON.stringify([
        { productId: PRODUCT_A, licence: "Regular", unitPrice: 0 },
      ]),
    );

    renderCart();

    expect(screen.getByTestId("cart-count")).toHaveTextContent("0");
  });
});
