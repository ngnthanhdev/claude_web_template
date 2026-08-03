import { randomBytes } from "node:crypto";

import type {
  AdminReviewQueueItem,
  AdminRoleKey,
  AdminUserSummary,
} from "@shared/admin";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { createQueryClient } from "@/lib/query-client";

import enAdmin from "../../../messages/en/admin.json";

import { MfaEnrollment } from "./mfa-enrollment";
import { PublicationPanel } from "./publication-panel";
import { ReviewQueue } from "./review-queue";
import { UserRolesPanel } from "./user-roles-panel";

// This is the single test file the admin shell surface is scoped to, so it
// exercises `ReviewQueue`, `PublicationPanel`, `UserRolesPanel`, and
// `MfaEnrollment` together, matching how `product-authoring-form.test.tsx`
// covers the whole seller authoring surface in one file. `fetch` is
// stubbed (not the admin client), so the CSRF-header, request-body, and
// 403/422 assertions exercise the real request path.

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: vi.fn(),
    useSearchParams: vi.fn(),
  };
});

const mockedUseRouter = vi.mocked(useRouter);
const mockedUseSearchParams = vi.mocked(useSearchParams);

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
const FIXTURE_EMAIL = "admin@example.com";
const FIXTURE_EXPIRES_AT = "2026-08-23T10:15:00.000Z";

const PRODUCT_ID_A = "2a80d74e-6f18-48a6-9034-7b79a8af93e9";
const PRODUCT_ID_B = "6a1c8e6a-9d2a-4a0c-8b9e-1a2b3c4d5e6f";
const SELLER_ID = "8f14e45f-ceea-467e-9a1e-c9c5f4ffdc00";
const OPERATOR_USER_ID = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

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
    { error: { code: "FORBIDDEN", message: "Admin access required." } },
    403,
  );
}

function unprocessableResponse(): Response {
  return jsonResponse(
    {
      error: {
        code: "UNPROCESSABLE_ENTITY",
        message: "The version is not approved or the artifact is unverified.",
      },
    },
    422,
  );
}

function reviewQueueItemFixture(
  overrides: Partial<AdminReviewQueueItem> = {},
): AdminReviewQueueItem {
  return {
    productId: PRODUCT_ID_A,
    productSlug: "lotus-commerce-theme",
    category: "ecommerce",
    thumbnailUrl: "https://cdn.kitvera.example/thumb.png",
    sellerId: SELLER_ID,
    version: "1.0.0",
    releasedAt: "2026-08-01T00:00:00.000Z",
    reviewState: "in_review",
    submittedAt: "2026-08-02T00:00:00.000Z",
    latestBuildRun: null,
    ...overrides,
  };
}

function adminUserFixture(
  overrides: Partial<AdminUserSummary> = {},
): AdminUserSummary {
  return {
    id: OPERATOR_USER_ID,
    email: "operator@example.com",
    roles: ["seller"],
    ...overrides,
  };
}

function renderWithProviders(
  ui: ReactNode,
  queryClient: QueryClient = createQueryClient(),
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enAdmin}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

let routerMock: RouterMock;

beforeEach(() => {
  routerMock = createRouterMock();
  mockedUseRouter.mockReturnValue(routerMock);
  mockedUseSearchParams.mockReturnValue(
    new URLSearchParams() as ReturnType<typeof useSearchParams>,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ReviewQueue", () => {
  it("renders the in_review queue with QA/scan verdicts, completes the approve/reject sequence with CSRF, and shows no order/entitlement affordance", async () => {
    const csrfToken = base64UrlToken();
    const itemA = reviewQueueItemFixture();
    const itemB = reviewQueueItemFixture({
      productId: PRODUCT_ID_B,
      productSlug: "aurora-landing-kit",
    });
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
        if (method === "POST") {
          calls.push({
            url,
            method,
            headers: new Headers(init?.headers),
            body,
          });
        }

        if (url === "/api/v1/sessions/current" && method === "GET") {
          return jsonResponse(sessionFixture(csrfToken));
        }
        if (url.startsWith("/api/v1/admin/review?") && method === "GET") {
          return jsonResponse({
            data: [itemA, itemB],
            meta: { nextCursor: null, hasMore: false },
          });
        }
        if (
          url ===
            `/api/v1/admin/products/${PRODUCT_ID_A}/versions/1.0.0/approve` &&
          method === "POST"
        ) {
          return jsonResponse({
            productId: PRODUCT_ID_A,
            version: "1.0.0",
            reviewState: "approved",
          });
        }
        if (
          url ===
            `/api/v1/admin/products/${PRODUCT_ID_B}/versions/1.0.0/reject` &&
          method === "POST"
        ) {
          return jsonResponse({
            productId: PRODUCT_ID_B,
            version: "1.0.0",
            reviewState: "draft",
          });
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", impl);
    const user = userEvent.setup();

    const { container } = renderWithProviders(<ReviewQueue />);

    expect(
      await screen.findByRole("heading", {
        name: enAdmin.Admin.review.heading,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("lotus-commerce-theme · 1.0.0"),
    ).toBeInTheDocument();
    expect(screen.getByText("aurora-landing-kit · 1.0.0")).toBeInTheDocument();

    expect((await axe(container)).violations).toEqual([]);

    // Approve item A.
    const approveButtons = screen.getAllByRole("button", {
      name: enAdmin.Admin.reviewActions.approve,
    });
    expect(approveButtons).toHaveLength(2);
    await user.click(approveButtons[0] as HTMLElement);
    await screen.findByText(enAdmin.Admin.reviewActions.approved);
    expect(
      screen.getByRole("link", {
        name: enAdmin.Admin.reviewActions.goToPublish,
      }),
    ).toHaveAttribute(
      "href",
      `/en/admin/publish?productId=${PRODUCT_ID_A}&version=1.0.0`,
    );

    // Reject item B, with a captured reason.
    const rejectButtons = screen.getAllByRole("button", {
      name: enAdmin.Admin.reviewActions.reject,
    });
    expect(rejectButtons).toHaveLength(1);
    await user.click(rejectButtons[0] as HTMLElement);
    await user.type(
      screen.getByLabelText(enAdmin.Admin.reviewActions.reasonLabel),
      "Fails licence compliance.",
    );
    await user.click(
      screen.getByRole("button", {
        name: enAdmin.Admin.reviewActions.rejectSubmit,
      }),
    );
    await screen.findByText(enAdmin.Admin.reviewActions.rejected);

    expect(calls).toHaveLength(2);
    const [approveCall, rejectCall] = calls;

    expect(approveCall?.url).toBe(
      `/api/v1/admin/products/${PRODUCT_ID_A}/versions/1.0.0/approve`,
    );
    expect(approveCall?.headers.get("x-csrf-token")).toBe(csrfToken);
    expect(approveCall?.body).toEqual({});

    expect(rejectCall?.url).toBe(
      `/api/v1/admin/products/${PRODUCT_ID_B}/versions/1.0.0/reject`,
    );
    expect(rejectCall?.headers.get("x-csrf-token")).toBe(csrfToken);
    expect(rejectCall?.body).toEqual({ reason: "Fails licence compliance." });

    // No order/entitlement/discount/review-moderation affordance anywhere.
    expect(container.innerHTML).not.toMatch(
      /\border\b|entitlement|discount|coupon|refund|chargeback|revenue|\bbuyer\b|\bprice\b/i,
    );
  });

  it("shows the honest not-authorised state for a non-admin (403) instead of fabricating data", async () => {
    const csrfToken = base64UrlToken();
    const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/sessions/current" && method === "GET") {
        return jsonResponse(sessionFixture(csrfToken));
      }
      if (url.startsWith("/api/v1/admin/review?") && method === "GET") {
        return forbiddenResponse();
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", impl);

    renderWithProviders(<ReviewQueue />);

    expect(
      await screen.findByText(enAdmin.Admin.review.forbidden.heading),
    ).toBeInTheDocument();
  });
});

describe("PublicationPanel", () => {
  it("surfaces the server's 422 when publishing an unapproved/unverified version, never fabricating a publishable state", async () => {
    const csrfToken = base64UrlToken();
    const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/sessions/current" && method === "GET") {
        return jsonResponse(sessionFixture(csrfToken));
      }
      if (url.startsWith("/api/v1/admin/users?") && method === "GET") {
        return jsonResponse({
          data: [adminUserFixture()],
          meta: { nextCursor: null, hasMore: false },
        });
      }
      if (
        url === `/api/v1/admin/products/${PRODUCT_ID_A}/publish` &&
        method === "POST"
      ) {
        return unprocessableResponse();
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", impl);
    const user = userEvent.setup();

    renderWithProviders(<PublicationPanel />);

    const productIdInputs = await screen.findAllByLabelText(
      enAdmin.Admin.publish.publishForm.productIdLabel,
    );
    await user.type(productIdInputs[0] as HTMLElement, PRODUCT_ID_A);
    await user.type(
      screen.getByLabelText(enAdmin.Admin.publish.publishForm.versionLabel),
      "1.0.0",
    );
    await user.click(
      screen.getByRole("button", {
        name: enAdmin.Admin.publish.publishForm.submit,
      }),
    );

    expect(
      await screen.findByText(enAdmin.Admin.publish.publishForm.unprocessable),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(enAdmin.Admin.publish.publishForm.success, {
        exact: false,
      }),
    ).not.toBeInTheDocument();
  });

  it("publishes and delists a product, each mutation carrying the CSRF header", async () => {
    const csrfToken = base64UrlToken();
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
        if (method === "POST") {
          calls.push({
            url,
            method,
            headers: new Headers(init?.headers),
            body,
          });
        }

        if (url === "/api/v1/sessions/current" && method === "GET") {
          return jsonResponse(sessionFixture(csrfToken));
        }
        if (url.startsWith("/api/v1/admin/users?") && method === "GET") {
          return jsonResponse({
            data: [adminUserFixture()],
            meta: { nextCursor: null, hasMore: false },
          });
        }
        if (
          url === `/api/v1/admin/products/${PRODUCT_ID_A}/publish` &&
          method === "POST"
        ) {
          return jsonResponse({
            productId: PRODUCT_ID_A,
            version: "1.0.0",
            publicationState: "published",
          });
        }
        if (
          url === `/api/v1/admin/products/${PRODUCT_ID_B}/delist` &&
          method === "POST"
        ) {
          return jsonResponse({
            productId: PRODUCT_ID_B,
            publicationState: "delisted",
          });
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", impl);
    const user = userEvent.setup();

    renderWithProviders(<PublicationPanel />);

    const productIdInputs = await screen.findAllByLabelText(
      enAdmin.Admin.publish.publishForm.productIdLabel,
    );
    await user.type(productIdInputs[0] as HTMLElement, PRODUCT_ID_A);
    await user.type(
      screen.getByLabelText(enAdmin.Admin.publish.publishForm.versionLabel),
      "1.0.0",
    );
    await user.click(
      screen.getByRole("button", {
        name: enAdmin.Admin.publish.publishForm.submit,
      }),
    );
    await screen.findByText(enAdmin.Admin.publish.publishForm.success, {
      exact: false,
    });

    await user.type(productIdInputs[1] as HTMLElement, PRODUCT_ID_B);
    await user.click(
      screen.getByRole("button", {
        name: enAdmin.Admin.publish.delistForm.submit,
      }),
    );
    await screen.findByText(enAdmin.Admin.publish.delistForm.success, {
      exact: false,
    });

    expect(calls).toHaveLength(2);
    const [publishCall, delistCall] = calls;

    expect(publishCall?.url).toBe(
      `/api/v1/admin/products/${PRODUCT_ID_A}/publish`,
    );
    expect(publishCall?.headers.get("x-csrf-token")).toBe(csrfToken);
    expect(publishCall?.body).toEqual({ version: "1.0.0" });

    expect(delistCall?.url).toBe(
      `/api/v1/admin/products/${PRODUCT_ID_B}/delist`,
    );
    expect(delistCall?.headers.get("x-csrf-token")).toBe(csrfToken);
    expect(delistCall?.body).toEqual({});
  });
});

describe("UserRolesPanel", () => {
  it("lists PII-minimized users and completes the grant/revoke role sequence with CSRF", async () => {
    const csrfToken = base64UrlToken();
    let currentRoles: AdminRoleKey[] = ["seller"];
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
        if (method !== "GET") {
          calls.push({
            url,
            method,
            headers: new Headers(init?.headers),
            body,
          });
        }

        if (url === "/api/v1/sessions/current" && method === "GET") {
          return jsonResponse(sessionFixture(csrfToken));
        }
        if (url.startsWith("/api/v1/admin/users?") && method === "GET") {
          return jsonResponse({
            data: [adminUserFixture({ roles: currentRoles })],
            meta: { nextCursor: null, hasMore: false },
          });
        }
        if (
          url === `/api/v1/admin/users/${OPERATOR_USER_ID}/roles` &&
          method === "POST"
        ) {
          const grantedRole = (body as { role: AdminRoleKey }).role;
          currentRoles = [...currentRoles, grantedRole];
          return jsonResponse(adminUserFixture({ roles: currentRoles }));
        }
        if (
          url === `/api/v1/admin/users/${OPERATOR_USER_ID}/roles/seller` &&
          method === "DELETE"
        ) {
          currentRoles = currentRoles.filter((role) => role !== "seller");
          return jsonResponse(adminUserFixture({ roles: currentRoles }));
        }
        throw new Error(`Unhandled fetch in test: ${method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", impl);
    const user = userEvent.setup();

    renderWithProviders(<UserRolesPanel />);

    expect(await screen.findByText("operator@example.com")).toBeInTheDocument();
    expect(screen.getByText(enAdmin.Admin.roles.seller)).toBeInTheDocument();

    // Grant the admin role.
    await user.selectOptions(
      screen.getByLabelText(enAdmin.Admin.users.grantLabel),
      "admin",
    );
    await user.click(
      screen.getByRole("button", { name: enAdmin.Admin.users.grantAction }),
    );
    await screen.findByText(enAdmin.Admin.roles.admin);

    // Revoke the seller role.
    const sellerChip = screen
      .getByText(enAdmin.Admin.roles.seller)
      .closest("li");
    expect(sellerChip).not.toBeNull();
    await user.click(
      within(sellerChip as HTMLElement).getByRole("button", {
        name: enAdmin.Admin.users.revokeAction,
      }),
    );

    await screen.findByText(enAdmin.Admin.roles.admin);
    // Only the "admin" chip's revoke control remains — the "seller" chip is
    // gone (its role text may still appear as a re-grantable dropdown
    // option, which is expected and not the chip being asserted against).
    expect(
      screen.getAllByRole("button", { name: enAdmin.Admin.users.revokeAction }),
    ).toHaveLength(1);

    expect(calls).toHaveLength(2);
    const [grantCall, revokeCall] = calls;

    expect(grantCall?.url).toBe(
      `/api/v1/admin/users/${OPERATOR_USER_ID}/roles`,
    );
    expect(grantCall?.headers.get("x-csrf-token")).toBe(csrfToken);
    expect(grantCall?.body).toEqual({ role: "admin" });

    expect(revokeCall?.url).toBe(
      `/api/v1/admin/users/${OPERATOR_USER_ID}/roles/seller`,
    );
    expect(revokeCall?.method).toBe("DELETE");
    expect(revokeCall?.headers.get("x-csrf-token")).toBe(csrfToken);
  });
});

describe("MfaEnrollment", () => {
  it("shows the one-time secret and recovery codes without ever persisting or logging them", async () => {
    const csrfToken = base64UrlToken();
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const otpauthUri =
      "otpauth://totp/Kitvera:admin@example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Kitvera";
    const factorId = "4f9a2c3e-1b2d-4e5f-8a6b-7c8d9e0f1a2b";
    const recoveryCodes = Array.from(
      { length: 10 },
      (_, index) => `recovery-code-${String(index + 1).padStart(2, "0")}`,
    );

    const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/sessions/current" && method === "GET") {
        return jsonResponse(sessionFixture(csrfToken));
      }
      if (url === "/api/v1/admin/mfa/enroll" && method === "POST") {
        return jsonResponse({ factorId, type: "totp", otpauthUri, secret });
      }
      if (url === "/api/v1/admin/mfa/confirm" && method === "POST") {
        return jsonResponse({
          factorId,
          confirmedAt: "2026-08-03T00:00:00.000Z",
          recoveryCodes,
        });
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", impl);

    const setItemSpy = vi.spyOn(window.localStorage, "setItem");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const user = userEvent.setup();

    renderWithProviders(<MfaEnrollment />);

    await user.click(
      await screen.findByRole("button", {
        name: enAdmin.Admin.mfa.enroll.start,
      }),
    );

    expect(await screen.findByText(secret)).toBeInTheDocument();
    expect(screen.getByText(otpauthUri)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(enAdmin.Admin.mfa.confirm.codeLabel),
      "123456",
    );
    await user.click(
      screen.getByRole("button", { name: enAdmin.Admin.mfa.confirm.submit }),
    );

    expect(
      await screen.findByText(enAdmin.Admin.mfa.recoveryCodes.heading),
    ).toBeInTheDocument();
    for (const code of recoveryCodes) {
      expect(screen.getByText(code)).toBeInTheDocument();
    }
    // The secret/otpauth panel is gone once confirmed — the payload is
    // shown exactly once, matching what the server itself only ever
    // returns once.
    expect(screen.queryByText(secret)).not.toBeInTheDocument();

    expect(setItemSpy).not.toHaveBeenCalled();
    for (const spy of [logSpy, warnSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        for (const arg of call) {
          expect(String(arg)).not.toContain(secret);
          for (const code of recoveryCodes) {
            expect(String(arg)).not.toContain(code);
          }
        }
      }
    }
  });

  it("shows the honest not-authorised state for a non-admin (403) on the enroll attempt, instead of fabricating a started enrollment", async () => {
    const csrfToken = base64UrlToken();
    const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/sessions/current" && method === "GET") {
        return jsonResponse(sessionFixture(csrfToken));
      }
      if (url === "/api/v1/admin/mfa/enroll" && method === "POST") {
        return forbiddenResponse();
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", impl);
    const user = userEvent.setup();

    renderWithProviders(<MfaEnrollment />);

    await user.click(
      await screen.findByRole("button", {
        name: enAdmin.Admin.mfa.enroll.start,
      }),
    );

    expect(
      await screen.findByText(enAdmin.Admin.mfa.forbidden.description),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(enAdmin.Admin.mfa.enroll.secretLabel),
    ).not.toBeInTheDocument();
  });
});
