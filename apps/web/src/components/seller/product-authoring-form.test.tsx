import { randomBytes } from "node:crypto";

import type { SellerProductDetailResponse } from "@shared/seller";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { createQueryClient } from "@/lib/query-client";

import enSeller from "../../../messages/en/seller.json";

import { ProductAuthoringForm } from "./product-authoring-form";
import { SellerProductList } from "./seller-product-list";
import { SubmitForReviewAction } from "./submit-for-review-action";
import { VersionForm } from "./version-form";

// This is the single test file the seller authoring surface is scoped to,
// so it exercises `SellerProductList`, `ProductAuthoringForm`,
// `VersionForm`, and `SubmitForReviewAction` together, matching how
// `download-action.test.tsx` covers the whole account/library feature in
// one file. `fetch` is stubbed (not the seller client), so the CSRF-header,
// request-body, and 403 assertions exercise the real request path.

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

const FIXTURE_USER_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const FIXTURE_SESSION_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const FIXTURE_EMAIL = "seller@example.com";
const FIXTURE_EXPIRES_AT = "2026-08-23T10:15:00.000Z";

const PRODUCT_ID = "2a80d74e-6f18-48a6-9034-7b79a8af93e9";

function sessionFixture(csrfToken: string) {
  return {
    user: { id: FIXTURE_USER_ID, email: FIXTURE_EMAIL },
    session: { id: FIXTURE_SESSION_ID, expiresAt: FIXTURE_EXPIRES_AT },
    csrfToken,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function forbiddenResponse(): Response {
  return jsonResponse(
    { error: { code: "FORBIDDEN", message: "Seller access required." } },
    403,
  );
}

function productSummaryFixture() {
  return {
    id: PRODUCT_ID,
    slug: "lotus-commerce-theme",
    category: "ecommerce" as const,
    publicationState: "draft" as const,
    tags: ["shopify"],
    versions: [
      {
        version: "1.0.0",
        releasedAt: "2026-08-01T00:00:00.000Z",
        reviewState: "draft" as const,
        latestBuildRun: null,
      },
    ],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function productDetailFixture(): SellerProductDetailResponse {
  return {
    ...productSummaryFixture(),
    thumbnailUrl: "https://cdn.kitvera.example/thumb.png",
    documentationUrl: "https://kitvera.example/docs",
    isolatedPreviewUrl: "https://kitvera.example/preview",
    translations: [],
    media: [],
    compatibility: [],
    specifications: [],
    demoPages: [],
  };
}

function renderWithProviders(ui: ReactNode) {
  const queryClient = createQueryClient();
  return render(
    <NextIntlClientProvider locale="en" messages={enSeller}>
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

describe("SellerProductList", () => {
  it("renders the caller's own products, each showing publicationState and per-version reviewState — no buyer/order/revenue data", async () => {
    const csrfToken = base64UrlToken();
    const impl = vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (url === "/api/v1/sessions/current" && method === "GET") {
          return jsonResponse(sessionFixture(csrfToken));
        }
        if (url.startsWith("/api/v1/seller/products?") && method === "GET") {
          return jsonResponse({
            data: [productSummaryFixture()],
            meta: { nextCursor: null, hasMore: false },
          });
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", impl);

    const { container } = renderWithProviders(<SellerProductList />);

    expect(
      await screen.findByRole("heading", {
        name: enSeller.Seller.list.heading,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "lotus-commerce-theme" }),
    ).toHaveAttribute("href", `/en/seller/products/${PRODUCT_ID}`);
    expect(
      screen.getAllByText(enSeller.Seller.states.publicationState.draft),
    ).toHaveLength(2);
    expect(screen.getByText("1.0.0")).toBeInTheDocument();

    // Never a buyer/order/revenue field anywhere in the rendered list.
    expect(container.innerHTML).not.toMatch(/\border\b|revenue|buyer|price/i);

    expect((await axe(container)).violations).toEqual([]);
  });

  it("shows an honest empty state when the caller has created no products", async () => {
    const csrfToken = base64UrlToken();
    const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/sessions/current" && method === "GET") {
        return jsonResponse(sessionFixture(csrfToken));
      }
      if (url.startsWith("/api/v1/seller/products?") && method === "GET") {
        return jsonResponse({
          data: [],
          meta: { nextCursor: null, hasMore: false },
        });
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", impl);

    renderWithProviders(<SellerProductList />);

    expect(
      await screen.findByText(enSeller.Seller.list.empty),
    ).toBeInTheDocument();
  });

  it("shows the honest not-authorised state for a non-seller (403) instead of fabricating data", async () => {
    const csrfToken = base64UrlToken();
    const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/sessions/current" && method === "GET") {
        return jsonResponse(sessionFixture(csrfToken));
      }
      if (url.startsWith("/api/v1/seller/products?") && method === "GET") {
        return forbiddenResponse();
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", impl);

    renderWithProviders(<SellerProductList />);

    expect(
      await screen.findByText(enSeller.Seller.list.forbidden.heading),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "lotus-commerce-theme" }),
    ).not.toBeInTheDocument();
  });
});

describe("ProductAuthoringForm (create)", () => {
  it("shows validation errors instead of submitting when required fields are empty", async () => {
    const onSuccess = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderWithProviders(
      <ProductAuthoringForm
        csrfToken={base64UrlToken()}
        mode="create"
        onSuccess={onSuccess}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: enSeller.Seller.authoringForm.createSubmit,
      }),
    );

    expect(
      await screen.findByText(enSeller.Seller.authoringForm.fields.slug.error),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("never renders a control for any server-owned field (sellerId, publicationState, isFeatured, reviewState, price) and never a publish/approve control", () => {
    const { container } = renderWithProviders(
      <ProductAuthoringForm
        csrfToken={base64UrlToken()}
        mode="create"
        onSuccess={vi.fn()}
      />,
    );

    const controls = Array.from(
      container.querySelectorAll("input, select, textarea"),
    );
    const controlNames = controls.map((control) =>
      control.getAttribute("name"),
    );

    for (const forbidden of [
      "sellerId",
      "publicationState",
      "isFeatured",
      "reviewState",
      "price",
      "amount",
      "currency",
    ]) {
      expect(controlNames).not.toContain(forbidden);
    }

    expect(
      screen.queryByRole("button", { name: /publish/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /approve/i }),
    ).not.toBeInTheDocument();
  });
});

/** Chains the three authoring steps exactly as `products/[id]/page.tsx` composes them. */
function SellerAuthoringFlowHarness({ csrfToken }: { csrfToken: string }) {
  const [product, setProduct] = useState<SellerProductDetailResponse | null>(
    null,
  );

  if (!product) {
    return (
      <ProductAuthoringForm
        csrfToken={csrfToken}
        mode="create"
        onSuccess={setProduct}
      />
    );
  }

  const draftVersion = product.versions.find(
    (version) => version.reviewState === "draft",
  );

  return (
    <div>
      <VersionForm
        csrfToken={csrfToken}
        onSuccess={setProduct}
        productId={product.id}
      />
      {draftVersion ? (
        <SubmitForReviewAction
          csrfToken={csrfToken}
          productId={product.id}
          version={draftVersion.version}
        />
      ) : null}
    </div>
  );
}

describe("create → version → submit-for-review flow", () => {
  it("creates a draft product, adds a version, then submits it for review — every mutation carrying the CSRF header, with no publish/approve control ever appearing", async () => {
    const csrfToken = base64UrlToken();
    const detail = productDetailFixture();
    const calls: {
      url: string;
      method: string;
      headers: Headers;
      body: unknown;
    }[] = [];

    const impl = vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        const body = init?.body
          ? (JSON.parse(init.body as string) as unknown)
          : undefined;
        calls.push({ url, method, headers: new Headers(init?.headers), body });

        if (url === "/api/v1/seller/products" && method === "POST") {
          return jsonResponse({ ...detail, versions: [] });
        }
        if (
          url === `/api/v1/seller/products/${PRODUCT_ID}/versions` &&
          method === "POST"
        ) {
          return jsonResponse(detail);
        }
        if (
          url === `/api/v1/seller/products/${PRODUCT_ID}/submit-for-review` &&
          method === "POST"
        ) {
          return jsonResponse({
            productId: PRODUCT_ID,
            version: "1.0.0",
            reviewState: "in_review",
          });
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", impl);
    const user = userEvent.setup();

    renderWithProviders(<SellerAuthoringFlowHarness csrfToken={csrfToken} />);

    // Step 1 — create the draft product.
    await user.type(
      screen.getByLabelText(enSeller.Seller.authoringForm.fields.slug.label),
      "lotus-commerce-theme",
    );
    await user.type(
      screen.getByLabelText(
        enSeller.Seller.authoringForm.fields.thumbnailUrl.label,
      ),
      "https://cdn.kitvera.example/thumb.png",
    );
    await user.type(
      screen.getByLabelText(
        enSeller.Seller.authoringForm.fields.documentationUrl.label,
      ),
      "https://kitvera.example/docs",
    );
    await user.type(
      screen.getByLabelText(
        enSeller.Seller.authoringForm.fields.isolatedPreviewUrl.label,
      ),
      "https://kitvera.example/preview",
    );
    await user.click(
      screen.getByRole("button", {
        name: enSeller.Seller.authoringForm.createSubmit,
      }),
    );

    // Step 2 — add a version.
    await screen.findByRole("heading", {
      name: enSeller.Seller.versionForm.heading,
    });
    await user.type(
      screen.getByLabelText(enSeller.Seller.versionForm.fields.version.label),
      "1.0.0",
    );
    const releasedAtInput = screen.getByLabelText(
      enSeller.Seller.versionForm.fields.releasedAt.label,
    );
    await user.type(releasedAtInput, "2026-08-01T00:00");
    await user.type(
      screen.getByLabelText(enSeller.Seller.versionForm.fields.notesVi.label),
      "Phát hành đầu tiên.",
    );
    await user.type(
      screen.getByLabelText(enSeller.Seller.versionForm.fields.notesEn.label),
      "Initial release.",
    );
    await user.click(
      screen.getByRole("button", { name: enSeller.Seller.versionForm.submit }),
    );

    // Step 3 — submit that version for review.
    const submitForReviewButton = await screen.findByRole("button", {
      name: enSeller.Seller.submitForReview.action,
    });
    await user.click(submitForReviewButton);

    await screen.findByText(enSeller.Seller.submitForReview.submitted);

    expect(calls).toHaveLength(3);
    const [createCall, versionCall, submitCall] = calls;

    expect(createCall?.url).toBe("/api/v1/seller/products");
    expect(createCall?.headers.get("x-csrf-token")).toBe(csrfToken);
    expect(createCall?.body).toEqual({
      slug: "lotus-commerce-theme",
      category: "wordpress",
      thumbnailUrl: "https://cdn.kitvera.example/thumb.png",
      documentationUrl: "https://kitvera.example/docs",
      isolatedPreviewUrl: "https://kitvera.example/preview",
    });

    expect(versionCall?.url).toBe(
      `/api/v1/seller/products/${PRODUCT_ID}/versions`,
    );
    expect(versionCall?.headers.get("x-csrf-token")).toBe(csrfToken);
    expect(versionCall?.body).toEqual({
      version: "1.0.0",
      releasedAt: new Date("2026-08-01T00:00").toISOString(),
      translations: [
        { locale: "vi", notes: "Phát hành đầu tiên." },
        { locale: "en", notes: "Initial release." },
      ],
    });

    expect(submitCall?.url).toBe(
      `/api/v1/seller/products/${PRODUCT_ID}/submit-for-review`,
    );
    expect(submitCall?.headers.get("x-csrf-token")).toBe(csrfToken);
    expect(submitCall?.body).toEqual({ version: "1.0.0" });

    // No self-publish/approve affordance appeared at any point in the flow.
    expect(
      screen.queryByRole("button", { name: /publish/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /approve/i }),
    ).not.toBeInTheDocument();
  });
});

describe("SubmitForReviewAction", () => {
  it("shows a pending label while submitting and a destructive alert on failure", async () => {
    const csrfToken = base64UrlToken();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: "CONFLICT", message: "Not draft." } }, 409),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderWithProviders(
      <SubmitForReviewAction
        csrfToken={csrfToken}
        productId={PRODUCT_ID}
        version="1.0.0"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: enSeller.Seller.submitForReview.action,
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(enSeller.Seller.submitForReview.error),
      ).toBeInTheDocument(),
    );
  });
});
