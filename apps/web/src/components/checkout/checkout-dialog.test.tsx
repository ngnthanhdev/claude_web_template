import type { CheckoutResponse, Order } from "@shared/commerce";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import CheckoutResultPage from "@/app/[locale]/checkout/result/page";
import { Providers } from "@/components/providers";
import { useSession, type UseSessionResult } from "@/hooks/use-session";
import {
  createCheckout,
  getOrderById,
  settlePaymentAttempt,
} from "@/lib/commerce-client";
import { formatMoney } from "@/lib/format";
import enCheckout from "../../../messages/en/checkout.json";
import viCheckout from "../../../messages/vi/checkout.json";

import { CheckoutDialog, type CheckoutSummaryItem } from "./checkout-dialog";

// `vitest-axe`'s `matchers` subpath types this project's installed version
// ships as type-only, so `expect(...).toHaveNoViolations()` can't be wired
// up without fighting that mismatch. Asserting on `AxeResults.violations`
// directly is equivalent and avoids the broken subpath entirely.
async function expectNoAxeViolations(container: Element): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

vi.mock("@/hooks/use-session", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/commerce-client", () => ({
  createCheckout: vi.fn(),
  getOrderById: vi.fn(),
  settlePaymentAttempt: vi.fn(),
}));

let mockSearchParamsValue = new URLSearchParams();
const mockRouterPush = vi.fn();
const mockRouter: ReturnType<typeof useRouter> = {
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: mockRouterPush,
  refresh: vi.fn(),
  replace: vi.fn(),
};

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => mockRouter,
    useSearchParams: () => mockSearchParamsValue,
  };
});

// The reduced-motion branch renders synchronously (no in-flight animation),
// which keeps open/close assertions deterministic in jsdom.
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => true };
});

const mockedUseSession = vi.mocked(useSession);
const mockedCreateCheckout = vi.mocked(createCheckout);
const mockedSettlePaymentAttempt = vi.mocked(settlePaymentAttempt);
const mockedGetOrderById = vi.mocked(getOrderById);

const FIXTURE_CSRF_TOKEN = "csrf-token-value";
const FIXTURE_ORDER_ID = "5c1e9b8a-df9a-4b9a-9b0e-9a2f6b7d9e22";
const FIXTURE_PAYMENT_ATTEMPT_ID = "8f14e45f-ceea-467e-a123-71b98d5f2e33";

const FIXTURE_ITEMS: CheckoutSummaryItem[] = [
  {
    productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
    licence: "Regular",
    title: "Lotus Commerce",
    unitPrice: { amount: 1_290_000, currency: "VND" },
  },
  {
    productId: "5c1e9b8a-df9a-4b9a-9b0e-9a2f6b7d9e21",
    licence: "Extended",
    title: "Aurora Blocks",
    unitPrice: { amount: 990_000, currency: "VND" },
  },
];

function authenticatedSession(
  csrfToken = FIXTURE_CSRF_TOKEN,
): UseSessionResult {
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
    csrfToken,
    signOut: vi.fn(),
    signOutAll: vi.fn(),
    isSigningOutCurrent: false,
    isSigningOutAll: false,
    signOutError: null,
    refetch: vi.fn(),
  };
}

function renderCheckoutDialog(
  items: CheckoutSummaryItem[] = FIXTURE_ITEMS,
  onOpenChange: (open: boolean) => void = vi.fn(),
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enCheckout}>
      <Providers>
        <CheckoutDialog items={items} onOpenChange={onOpenChange} open />
      </Providers>
    </NextIntlClientProvider>,
  );
}

function ToggleableCheckoutDialog({
  items = FIXTURE_ITEMS,
}: {
  items?: CheckoutSummaryItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open checkout
      </button>
      <CheckoutDialog items={items} onOpenChange={setOpen} open={open} />
    </>
  );
}

function renderToggleableCheckoutDialog(
  items: CheckoutSummaryItem[] = FIXTURE_ITEMS,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enCheckout}>
      <Providers>
        <ToggleableCheckoutDialog items={items} />
      </Providers>
    </NextIntlClientProvider>,
  );
}

async function fillValidCheckoutForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: enCheckout.Checkout.form.emailLabel }),
    "buyer@example.com",
  );
  await user.type(
    screen.getByRole("textbox", { name: enCheckout.Checkout.form.nameLabel }),
    "Nguyen Van A",
  );
}

function collectKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, nested]) =>
    collectKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

beforeEach(() => {
  mockSearchParamsValue = new URLSearchParams();
  mockedUseSession.mockReturnValue(authenticatedSession());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CheckoutDialog", () => {
  it("clearly labels the surface as a sandbox with no real payment", () => {
    renderCheckoutDialog();

    expect(
      screen.getByText(enCheckout.Checkout.dialog.sandboxLabel),
    ).toBeInTheDocument();
  });

  it("shows the Global/Vietnam + email + name + continue hierarchy", () => {
    renderCheckoutDialog();

    expect(
      screen.getByRole("radio", {
        name: enCheckout.Checkout.form.regionGlobal,
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", {
        name: enCheckout.Checkout.form.regionVietnam,
      }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("textbox", {
        name: enCheckout.Checkout.form.emailLabel,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: enCheckout.Checkout.form.nameLabel }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: enCheckout.Checkout.form.continue }),
    ).toBeInTheDocument();
  });

  it("shows every line's display-only price and the display-only VND total, plus the currency note", () => {
    renderCheckoutDialog();

    expect(
      screen.getByText(formatMoney(FIXTURE_ITEMS[0]!.unitPrice, "en")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatMoney(FIXTURE_ITEMS[1]!.unitPrice, "en")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`(${enCheckout.Checkout.licence.Regular})`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`(${enCheckout.Checkout.licence.Extended})`),
    ).toBeInTheDocument();

    const total = FIXTURE_ITEMS.reduce(
      (sum, item) => sum + item.unitPrice.amount,
      0,
    );
    expect(
      screen.getByText(formatMoney({ amount: total, currency: "VND" }, "en")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCheckout.Checkout.summary.currencyNote),
    ).toBeInTheDocument();
  });

  it("rejects an invalid email and never starts checkout", async () => {
    const user = userEvent.setup();
    renderCheckoutDialog();

    await user.type(
      screen.getByRole("textbox", {
        name: enCheckout.Checkout.form.emailLabel,
      }),
      "not-an-email",
    );
    await user.type(
      screen.getByRole("textbox", { name: enCheckout.Checkout.form.nameLabel }),
      "Nguyen Van A",
    );
    await user.click(
      screen.getByRole("button", { name: enCheckout.Checkout.form.continue }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enCheckout.Checkout.form.emailInvalid,
    );
    expect(mockedCreateCheckout).not.toHaveBeenCalled();
  });

  it("rejects a missing name and never starts checkout", async () => {
    const user = userEvent.setup();
    renderCheckoutDialog();

    await user.type(
      screen.getByRole("textbox", {
        name: enCheckout.Checkout.form.emailLabel,
      }),
      "buyer@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: enCheckout.Checkout.form.continue }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enCheckout.Checkout.form.nameRequired,
    );
    expect(mockedCreateCheckout).not.toHaveBeenCalled();
  });

  it("runs checkout -> sandbox settle -> result on submit, sending only items/idempotencyKey with the CSRF header, and never a price/discount/owner field", async () => {
    const checkoutResponse: CheckoutResponse = {
      orderId: FIXTURE_ORDER_ID,
      paymentAttemptId: FIXTURE_PAYMENT_ATTEMPT_ID,
      status: "pending",
    };
    const settledOrder: Order = {
      id: FIXTURE_ORDER_ID,
      status: "settled",
      total: { amount: 2_280_000, currency: "VND" },
      createdAt: "2026-08-01T10:15:00.000Z",
      items: [],
    };
    mockedCreateCheckout.mockResolvedValue(checkoutResponse);
    mockedSettlePaymentAttempt.mockResolvedValue(settledOrder);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderCheckoutDialog(FIXTURE_ITEMS, onOpenChange);

    await fillValidCheckoutForm(user);
    await user.click(
      screen.getByRole("button", { name: enCheckout.Checkout.form.continue }),
    );

    await waitFor(() => expect(mockedCreateCheckout).toHaveBeenCalledTimes(1));
    const [checkoutRequest, checkoutCsrfToken] =
      mockedCreateCheckout.mock.calls[0]!;
    expect(checkoutRequest).toEqual({
      items: [
        { productId: FIXTURE_ITEMS[0]!.productId, licence: "Regular" },
        { productId: FIXTURE_ITEMS[1]!.productId, licence: "Extended" },
      ],
      idempotencyKey: expect.any(String),
    });
    expect(Object.keys(checkoutRequest)).toEqual(["items", "idempotencyKey"]);
    expect(checkoutCsrfToken).toBe(FIXTURE_CSRF_TOKEN);

    await waitFor(() =>
      expect(mockedSettlePaymentAttempt).toHaveBeenCalledWith(
        FIXTURE_PAYMENT_ATTEMPT_ID,
        FIXTURE_CSRF_TOKEN,
      ),
    );

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(
        `/en/checkout/result?orderId=${FIXTURE_ORDER_ID}`,
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a checkout-error alert and never calls settle when checkout itself fails", async () => {
    mockedCreateCheckout.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderCheckoutDialog();

    await fillValidCheckoutForm(user);
    await user.click(
      screen.getByRole("button", { name: enCheckout.Checkout.form.continue }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enCheckout.Checkout.form.checkoutError,
    );
    expect(mockedSettlePaymentAttempt).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("shows a settle-error alert (not the result route) when the sandbox settle fails", async () => {
    mockedCreateCheckout.mockResolvedValue({
      orderId: FIXTURE_ORDER_ID,
      paymentAttemptId: FIXTURE_PAYMENT_ATTEMPT_ID,
      status: "pending",
    });
    mockedSettlePaymentAttempt.mockRejectedValue(new Error("settle failed"));
    const user = userEvent.setup();
    renderCheckoutDialog();

    await fillValidCheckoutForm(user);
    await user.click(
      screen.getByRole("button", { name: enCheckout.Checkout.form.continue }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enCheckout.Checkout.form.settleError,
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", async () => {
    // The backdrop and the header's close control share the same accessible
    // name ("Close checkout") — mirroring `MobileDrawer`'s scrim/close-button
    // pair — so the backdrop is the first of the two in DOM order (it's
    // rendered before the dialog panel).
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderCheckoutDialog(FIXTURE_ITEMS, onOpenChange);

    const [backdrop] = screen.getAllByRole("button", {
      name: enCheckout.Checkout.dialog.close,
    });
    await user.click(backdrop!);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes when Escape is pressed", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderCheckoutDialog(FIXTURE_ITEMS, onOpenChange);

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("moves focus into the dialog panel on open, and restores it to the trigger on close", async () => {
    const user = userEvent.setup();
    renderToggleableCheckoutDialog();

    const trigger = screen.getByRole("button", { name: "Open checkout" });
    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveFocus());

    await user.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("has no detectable accessibility violations while open", async () => {
    const { container } = renderCheckoutDialog();
    await expectNoAxeViolations(container);
  });
});

describe("CheckoutResultPage", () => {
  function renderResultPage(locale: "vi" | "en" = "en") {
    const messages = locale === "vi" ? viCheckout : enCheckout;
    return render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <Providers>
          <CheckoutResultPage />
        </Providers>
      </NextIntlClientProvider>,
    );
  }

  it("shows the honest not-found state when no orderId is present", () => {
    mockSearchParamsValue = new URLSearchParams();
    renderResultPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      enCheckout.Checkout.result.notFound,
    );
  });

  it("renders the settled outcome with items/total and a library link, and never a payment reference", async () => {
    mockSearchParamsValue = new URLSearchParams({ orderId: FIXTURE_ORDER_ID });
    const order: Order = {
      id: FIXTURE_ORDER_ID,
      status: "settled",
      total: { amount: 2_280_000, currency: "VND" },
      createdAt: "2026-08-01T10:15:00.000Z",
      items: [
        {
          productId: FIXTURE_ITEMS[0]!.productId,
          version: "1.0.0",
          licenceIdentifier: "Regular",
          titleSnapshot: "Lotus Commerce",
          unitPrice: { amount: 1_290_000, currency: "VND" },
        },
      ],
    };
    mockedGetOrderById.mockResolvedValue(order);

    const { container } = renderResultPage();

    expect(
      await screen.findByRole("heading", {
        name: enCheckout.Checkout.result.settledHeading,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Lotus Commerce")).toBeInTheDocument();
    expect(
      screen.getByText(formatMoney(order.total, "en")),
    ).toBeInTheDocument();
    const libraryLink = screen.getByRole("link", {
      name: enCheckout.Checkout.result.libraryLink,
    });
    expect(libraryLink).toHaveAttribute("href", "/en/account/library");

    expect(mockedGetOrderById).toHaveBeenCalledWith(FIXTURE_ORDER_ID);
    expect(container.textContent).not.toMatch(/payment.?attempt/i);
    expect(container.textContent).not.toMatch(/idempotenc/i);
  });

  it("has no detectable accessibility violations once the order loads", async () => {
    mockSearchParamsValue = new URLSearchParams({ orderId: FIXTURE_ORDER_ID });
    mockedGetOrderById.mockResolvedValue({
      id: FIXTURE_ORDER_ID,
      status: "settled",
      total: { amount: 1_290_000, currency: "VND" },
      createdAt: "2026-08-01T10:15:00.000Z",
      items: [
        {
          productId: FIXTURE_ITEMS[0]!.productId,
          version: "1.0.0",
          licenceIdentifier: "Regular",
          titleSnapshot: "Lotus Commerce",
          unitPrice: { amount: 1_290_000, currency: "VND" },
        },
      ],
    });

    const { container } = renderResultPage();
    await screen.findByRole("heading", {
      name: enCheckout.Checkout.result.settledHeading,
    });

    await expectNoAxeViolations(container);
  });
});

describe("checkout.json locale parity", () => {
  it("keeps the vi and en Checkout message catalogues on exactly the same key set", () => {
    expect(collectKeys(viCheckout).sort()).toEqual(
      collectKeys(enCheckout).sort(),
    );
  });
});
