import { randomBytes } from "node:crypto";

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { createQueryClient } from "@/lib/query-client";
import { formatMoney } from "@/lib/format";

import enAccount from "../../../messages/en/account.json";

import { DownloadAction } from "./download-action";
import { LibraryList } from "./library-list";
import { OrderDetail } from "./order-detail";
import { OrdersList } from "./orders-list";

// This suite is the single test file `T-1d6f3a` is scoped to, so it exercises
// the whole account-orders/library-and-download feature — `OrdersList`,
// `OrderDetail`, `LibraryList`, and `DownloadAction` — rather than any one
// piece in isolation. `fetch` is stubbed (not the commerce/auth clients), so
// the CSRF-header, 404, and POST-then-open assertions exercise the real
// request path, matching how `commerce-client.test.ts` and
// `session-actions.test.tsx` verify their own layers.

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: vi.fn() };
});

const mockedUseRouter = vi.mocked(useRouter);

type RouterMock = ReturnType<typeof useRouter>;

function createRouterMock(): RouterMock {
  return {
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  };
}

function base64UrlToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * `Intl.NumberFormat`'s currency output can separate the amount and symbol
 * with a non-breaking space; `getByText`'s normalizer only collapses
 * whitespace in the rendered DOM text, not in a raw string matcher, so
 * queries built from `formatMoney(...)` need the same collapsing applied
 * first (matches the pattern already established by
 * `licence-comparison.test.tsx`).
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const FIXTURE_USER_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const FIXTURE_SESSION_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const FIXTURE_EMAIL = "person@example.com";
const FIXTURE_EXPIRES_AT = "2026-08-23T10:15:00.000Z";

const ORDER_ID_1 = "11111111-1111-4111-8111-111111111101";
const ORDER_ID_2 = "22222222-2222-4222-8222-222222222202";
const UNKNOWN_ORDER_ID = "55555555-5555-4555-8555-555555555505";
const MALFORMED_ORDER_ID = "not-a-uuid";
const ENTITLEMENT_ID = "33333333-3333-4333-8333-333333333303";
const PRODUCT_ID = "44444444-4444-4444-8444-444444444404";

function sessionFixture(csrfToken: string) {
  return {
    user: { id: FIXTURE_USER_ID, email: FIXTURE_EMAIL },
    session: { id: FIXTURE_SESSION_ID, expiresAt: FIXTURE_EXPIRES_AT },
    csrfToken,
  };
}

function orderItemSnapshotFixture() {
  return {
    productId: PRODUCT_ID,
    version: "1.4.0",
    licenceIdentifier: "Regular" as const,
    titleSnapshot: "Lotus Commerce",
    unitPrice: { amount: 1_290_000, currency: "VND" as const },
  };
}

function orderFixture(
  id: string,
  status: "pending" | "settled" | "cancelled",
  createdAt: string,
) {
  return {
    id,
    status,
    total: { amount: 1_290_000, currency: "VND" as const },
    createdAt,
    items: [orderItemSnapshotFixture()],
  };
}

function entitlementFixture(id: string, productId: string, createdAt: string) {
  return { id, productId, version: "1.4.0", createdAt };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function unauthenticatedResponse(): Response {
  return jsonResponse(
    { error: { code: "UNAUTHENTICATED", message: "Not signed in." } },
    401,
  );
}

function notFoundResponse(): Response {
  return jsonResponse(
    { error: { code: "NOT_FOUND", message: "Order not found." } },
    404,
  );
}

interface FetchCall {
  url: string;
  method: string;
  headers: Headers;
}

interface FetchFixtures {
  csrfToken: string;
  orders?: ReturnType<typeof orderFixture>[];
  orderDetails?: Record<string, ReturnType<typeof orderFixture>>;
  entitlements?: ReturnType<typeof entitlementFixture>[];
  downloadUrl?: string;
}

/**
 * A stateful fetch stub covering exactly the requests this feature makes:
 * the shared session read, the orders list/detail reads, the library read,
 * and the download-issue mutation.
 */
function createFetchMock({
  csrfToken,
  orders = [],
  orderDetails = {},
  entitlements = [],
  downloadUrl = "https://cdn.kitvera.example/downloads/unused",
}: FetchFixtures) {
  const calls: FetchCall[] = [];

  const impl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, headers: new Headers(init?.headers) });

      if (url === "/api/v1/sessions/current" && method === "GET") {
        return jsonResponse(sessionFixture(csrfToken));
      }
      if (url.startsWith("/api/v1/orders?") && method === "GET") {
        return jsonResponse({
          data: orders,
          meta: { nextCursor: null, hasMore: false },
        });
      }
      const orderDetailMatch = /^\/api\/v1\/orders\/([^/?]+)$/.exec(url);
      if (orderDetailMatch && method === "GET") {
        const id = orderDetailMatch[1] as string;
        const order = orderDetails[id];
        return order ? jsonResponse(order) : notFoundResponse();
      }
      if (url.startsWith("/api/v1/account/library?") && method === "GET") {
        return jsonResponse({
          data: entitlements,
          meta: { nextCursor: null, hasMore: false },
        });
      }
      const downloadMatch =
        /^\/api\/v1\/entitlements\/([^/?]+)\/download$/.exec(url);
      if (downloadMatch && method === "POST") {
        return jsonResponse({
          url: downloadUrl,
          expiresAt: "2026-08-02T00:05:00.000Z",
        });
      }

      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    },
  );

  return { impl, calls };
}

function renderWithProviders(ui: ReactNode) {
  const queryClient = createQueryClient();
  return render(
    <NextIntlClientProvider locale="en" messages={enAccount}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

let routerMock: RouterMock;

beforeEach(() => {
  routerMock = createRouterMock();
  mockedUseRouter.mockReturnValue(routerMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OrdersList", () => {
  it("renders the caller's own orders, each linking to its detail page with status/date/total", async () => {
    const csrfToken = base64UrlToken();
    const orders = [
      orderFixture(ORDER_ID_1, "settled", "2026-08-01T00:00:00.000Z"),
      orderFixture(ORDER_ID_2, "pending", "2026-07-15T00:00:00.000Z"),
    ];
    const { impl } = createFetchMock({ csrfToken, orders });
    vi.stubGlobal("fetch", impl);

    renderWithProviders(<OrdersList />);

    expect(
      await screen.findByRole("heading", {
        name: enAccount.Account.orders.heading,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enAccount.Account.orders.currencyNote),
    ).toBeInTheDocument();

    const firstLink = screen.getByRole("link", {
      name: new RegExp(`Order #${ORDER_ID_1.slice(0, 8)}`),
    });
    expect(firstLink).toHaveAttribute(
      "href",
      `/en/account/orders/${ORDER_ID_1}`,
    );
    expect(firstLink).toHaveTextContent(
      enAccount.Account.orders.status.settled,
    );
    expect(firstLink).toHaveTextContent(
      normalizeWhitespace(
        formatMoney({ amount: 1_290_000, currency: "VND" }, "en"),
      ),
    );

    const secondLink = screen.getByRole("link", {
      name: new RegExp(`Order #${ORDER_ID_2.slice(0, 8)}`),
    });
    expect(secondLink).toHaveTextContent(
      enAccount.Account.orders.status.pending,
    );
  });

  it("shows an honest empty state when the caller has placed no orders", async () => {
    const csrfToken = base64UrlToken();
    const { impl } = createFetchMock({ csrfToken, orders: [] });
    vi.stubGlobal("fetch", impl);

    renderWithProviders(<OrdersList />);

    expect(
      await screen.findByText(enAccount.Account.orders.empty),
    ).toBeInTheDocument();
  });

  it("redirects an unauthenticated visitor to sign-in instead of listing orders", async () => {
    const fetchMock = vi.fn(async () => unauthenticatedResponse());
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<OrdersList />);

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/en/auth/sign-in"),
    );
  });

  it("has no detectable accessibility violations", async () => {
    const csrfToken = base64UrlToken();
    const orders = [
      orderFixture(ORDER_ID_1, "settled", "2026-08-01T00:00:00.000Z"),
    ];
    const { impl } = createFetchMock({ csrfToken, orders });
    vi.stubGlobal("fetch", impl);

    const { container } = renderWithProviders(<OrdersList />);
    await screen.findByRole("heading", {
      name: enAccount.Account.orders.heading,
    });

    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("OrderDetail (found)", () => {
  it("renders one order's item snapshots, status, placed-on date, and total", async () => {
    const csrfToken = base64UrlToken();
    const order = orderFixture(
      ORDER_ID_1,
      "settled",
      "2026-08-01T00:00:00.000Z",
    );
    const { impl } = createFetchMock({
      csrfToken,
      orderDetails: { [ORDER_ID_1]: order },
    });
    vi.stubGlobal("fetch", impl);

    renderWithProviders(<OrderDetail orderId={ORDER_ID_1} />);

    expect(
      await screen.findByRole("heading", {
        name: `Order #${ORDER_ID_1.slice(0, 8)}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Lotus Commerce")).toBeInTheDocument();
    expect(
      screen.getByText(enAccount.Account.orders.status.settled),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        normalizeWhitespace(
          formatMoney({ amount: 1_290_000, currency: "VND" }, "en"),
        ),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", {
        name: enAccount.Account.orderDetail.backToOrders,
      }),
    ).toHaveAttribute("href", "/en/account/orders");
  });
});

describe("OrderDetail (not found)", () => {
  it("renders the honest not-found state for a well-formed but non-owned/unknown order id (404)", async () => {
    const csrfToken = base64UrlToken();
    const { impl } = createFetchMock({ csrfToken });
    vi.stubGlobal("fetch", impl);

    renderWithProviders(<OrderDetail orderId={UNKNOWN_ORDER_ID} />);

    expect(
      await screen.findByRole("heading", {
        name: enAccount.Account.orderDetail.notFound.heading,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: enAccount.Account.orderDetail.notFound.cta,
      }),
    ).toHaveAttribute("href", "/en/account/orders");
  });

  it("renders the same not-found state for a malformed id, without ever requesting an order", async () => {
    const csrfToken = base64UrlToken();
    const { impl, calls } = createFetchMock({ csrfToken });
    vi.stubGlobal("fetch", impl);

    renderWithProviders(<OrderDetail orderId={MALFORMED_ORDER_ID} />);

    expect(
      await screen.findByRole("heading", {
        name: enAccount.Account.orderDetail.notFound.heading,
      }),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.url.startsWith("/api/v1/orders/"))).toBe(
      false,
    );
  });

  it("has no detectable accessibility violations", async () => {
    const csrfToken = base64UrlToken();
    const { impl } = createFetchMock({ csrfToken });
    vi.stubGlobal("fetch", impl);

    const { container } = renderWithProviders(
      <OrderDetail orderId={UNKNOWN_ORDER_ID} />,
    );
    await screen.findByRole("heading", {
      name: enAccount.Account.orderDetail.notFound.heading,
    });

    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("LibraryList", () => {
  it("renders the caller's owned entitlements, each with a Download action", async () => {
    const csrfToken = base64UrlToken();
    const entitlements = [
      entitlementFixture(
        ENTITLEMENT_ID,
        PRODUCT_ID,
        "2026-08-01T00:00:00.000Z",
      ),
    ];
    const { impl } = createFetchMock({ csrfToken, entitlements });
    vi.stubGlobal("fetch", impl);

    renderWithProviders(<LibraryList />);

    expect(
      await screen.findByRole("heading", {
        name: enAccount.Account.library.heading,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        enAccount.Account.library.entitlementLabel.replace(
          "{productId}",
          PRODUCT_ID.slice(0, 8),
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: enAccount.Account.library.download.action,
      }),
    ).toBeInTheDocument();
  });

  it("shows an honest empty state when the caller owns nothing yet", async () => {
    const csrfToken = base64UrlToken();
    const { impl } = createFetchMock({ csrfToken, entitlements: [] });
    vi.stubGlobal("fetch", impl);

    renderWithProviders(<LibraryList />);

    expect(
      await screen.findByText(enAccount.Account.library.empty),
    ).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const csrfToken = base64UrlToken();
    const entitlements = [
      entitlementFixture(
        ENTITLEMENT_ID,
        PRODUCT_ID,
        "2026-08-01T00:00:00.000Z",
      ),
    ];
    const { impl } = createFetchMock({ csrfToken, entitlements });
    vi.stubGlobal("fetch", impl);

    const { container } = renderWithProviders(<LibraryList />);
    await screen.findByRole("heading", {
      name: enAccount.Account.library.heading,
    });

    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("DownloadAction", () => {
  it("POSTs to issue a download with the CSRF header, then opens the returned URL directly — never rendering the token in the DOM", async () => {
    const csrfToken = base64UrlToken();
    const downloadUrl =
      "https://cdn.kitvera.example/downloads/secret-token-abc123";
    const fetchMock = vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (
          url === `/api/v1/entitlements/${ENTITLEMENT_ID}/download` &&
          method === "POST"
        ) {
          return jsonResponse({
            url: downloadUrl,
            expiresAt: "2026-08-02T00:05:00.000Z",
          });
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    const user = userEvent.setup();

    const { container } = renderWithProviders(
      <DownloadAction csrfToken={csrfToken} entitlementId={ENTITLEMENT_ID} />,
    );

    await user.click(
      screen.getByRole("button", {
        name: enAccount.Account.library.download.action,
      }),
    );

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        downloadUrl,
        "_blank",
        "noopener,noreferrer",
      ),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-csrf-token")).toBe(csrfToken);

    // The issued URL/token never reaches the DOM: no anchor is rendered at
    // all (this action only ever calls `window.open`), and no text node
    // contains it either.
    expect(container.querySelectorAll("a").length).toBe(0);
    expect(container.innerHTML).not.toContain(downloadUrl);

    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("disables the action and shows a pending label while the download is being issued", async () => {
    const csrfToken = base64UrlToken();
    let resolveFetch: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(async () => pending);
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();

    renderWithProviders(
      <DownloadAction csrfToken={csrfToken} entitlementId={ENTITLEMENT_ID} />,
    );

    await user.click(
      screen.getByRole("button", {
        name: enAccount.Account.library.download.action,
      }),
    );

    const pendingButton = await screen.findByRole("button", {
      name: enAccount.Account.library.download.pending,
    });
    expect(pendingButton).toBeDisabled();

    resolveFetch(
      jsonResponse({
        url: "https://cdn.kitvera.example/downloads/unused",
        expiresAt: "2026-08-02T00:05:00.000Z",
      }),
    );

    await screen.findByRole("button", {
      name: enAccount.Account.library.download.action,
    });
  });
});
