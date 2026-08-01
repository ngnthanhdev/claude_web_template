import { randomBytes } from "node:crypto";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import enAuth from "../../../messages/en/auth.json";
import { ApiClientError } from "@/lib/api-client";
import { redeemMagicLink } from "@/lib/auth-client";
import { createQueryClient } from "@/lib/query-client";

import { RedemptionStatus } from "./redemption-status";

// `vitest-axe`'s `matchers` subpath types this project's installed version
// ships as type-only, so `expect(...).toHaveNoViolations()` can't be wired
// up without fighting that mismatch. Asserting on `AxeResults.violations`
// directly is equivalent and avoids the broken subpath entirely.
async function expectNoAxeViolations(container: Element): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

const { mockRouter } = vi.hoisted(() => ({
  mockRouter: { replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/auth-client", () => ({
  redeemMagicLink: vi.fn(),
}));

const mockedRedeemMagicLink = vi.mocked(redeemMagicLink);

function base64UrlToken(): string {
  return randomBytes(32).toString("base64url");
}

function validRedemptionResponse(overrides?: { returnTo?: string }) {
  return {
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "person@example.com",
    },
    session: {
      id: "00000000-0000-4000-8000-000000000002",
      expiresAt: "2026-08-01T00:00:00.000Z",
    },
    csrfToken: base64UrlToken(),
    returnTo: overrides?.returnTo ?? "/en/account",
  };
}

function renderRedemptionStatus(
  queryClient: QueryClient = createQueryClient(),
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enAuth}>
      <QueryClientProvider client={queryClient}>
        <RedemptionStatus />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

function setUrl(pathAndHash: string) {
  window.history.pushState(null, "", pathAndHash);
}

beforeEach(() => {
  setUrl("/en/auth/magic-link");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("RedemptionStatus", () => {
  it("reads the token fragment once, clears it from the URL, redeems it, and redirects to the validated returnTo", async () => {
    const token = base64UrlToken();
    setUrl(`/en/auth/magic-link#token=${token}`);
    mockedRedeemMagicLink.mockResolvedValue(
      validRedemptionResponse({ returnTo: "/en/templates/lotus-commerce" }),
    );

    renderRedemptionStatus();

    await waitFor(() => {
      expect(mockedRedeemMagicLink).toHaveBeenCalledWith({ token });
    });
    expect(mockedRedeemMagicLink).toHaveBeenCalledTimes(1);
    // The fragment is cleared as soon as it is read, before redemption even
    // resolves.
    expect(window.location.hash).toBe("");

    await screen.findByText(enAuth.Auth.magicLink.successTitle);
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(
        "/en/templates/lotus-commerce",
      );
    });
  });

  it("clears any account/orders cache left over from a previous session on this tab before redirecting", async () => {
    const token = base64UrlToken();
    setUrl(`/en/auth/magic-link#token=${token}`);
    mockedRedeemMagicLink.mockResolvedValue(validRedemptionResponse());

    const queryClient = createQueryClient();
    // Simulates a previous visitor's cached account reads still sitting in
    // this tab's query cache — a shared device's next sign-in must never
    // surface these without a fresh network request of its own.
    queryClient.setQueryData(["account", "orders"], {
      pages: [
        {
          data: [{ id: "prior-user-order" }],
          meta: { nextCursor: null, hasMore: false },
        },
      ],
      pageParams: [undefined],
    });
    queryClient.setQueryData(
      ["orders", "11111111-1111-4111-8111-111111111101"],
      { id: "prior-user-order" },
    );

    renderRedemptionStatus(queryClient);

    await screen.findByText(enAuth.Auth.magicLink.successTitle);

    expect(queryClient.getQueryData(["account", "orders"])).toBeUndefined();
    expect(
      queryClient.getQueryData([
        "orders",
        "11111111-1111-4111-8111-111111111101",
      ]),
    ).toBeUndefined();
  });

  it("shows the generic invalid-or-expired state and a re-request link on HTTP 401 MAGIC_LINK_INVALID_OR_EXPIRED", async () => {
    const token = base64UrlToken();
    setUrl(`/en/auth/magic-link#token=${token}`);
    mockedRedeemMagicLink.mockRejectedValue(
      new ApiClientError(
        401,
        "MAGIC_LINK_INVALID_OR_EXPIRED",
        "invalid or expired",
      ),
    );

    renderRedemptionStatus();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enAuth.Auth.magicLink.invalidOrExpiredTitle,
    );
    expect(
      screen.getByRole("link", {
        name: enAuth.Auth.magicLink.backToSignInCta,
      }),
    ).toHaveAttribute("href", "/en/auth/sign-in");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("surfaces the same shared invalid-or-expired copy for a malformed token, without ever calling the auth client", async () => {
    setUrl("/en/auth/magic-link#token=not-a-valid-token");

    renderRedemptionStatus();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enAuth.Auth.magicLink.invalidOrExpiredTitle,
    );
    expect(mockedRedeemMagicLink).not.toHaveBeenCalled();
  });

  it("treats a missing fragment the same as malformed input, without calling the auth client", async () => {
    setUrl("/en/auth/magic-link");

    renderRedemptionStatus();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enAuth.Auth.magicLink.invalidOrExpiredTitle,
    );
    expect(mockedRedeemMagicLink).not.toHaveBeenCalled();
  });

  it("shows a distinct generic error state (not invalid-or-expired) for an unexpected failure", async () => {
    const token = base64UrlToken();
    setUrl(`/en/auth/magic-link#token=${token}`);
    mockedRedeemMagicLink.mockRejectedValue(new Error("network down"));

    renderRedemptionStatus();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(enAuth.Auth.magicLink.errorTitle);
    expect(alert).not.toHaveTextContent(
      enAuth.Auth.magicLink.invalidOrExpiredTitle,
    );
  });

  it("rejects an unsafe returnTo in the redemption response and falls back to the account default", async () => {
    const token = base64UrlToken();
    setUrl(`/en/auth/magic-link#token=${token}`);
    mockedRedeemMagicLink.mockResolvedValue(
      // The shared client's own schema would normally reject this before it
      // ever reached here; this proves the component does not blindly
      // trust an already-parsed response either.
      validRedemptionResponse({ returnTo: "https://evil.example/phish" }),
    );

    renderRedemptionStatus();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/en/account");
    });
  });

  it("never writes the raw token or the CSRF token to storage, the URL, or the console", async () => {
    const token = base64UrlToken();
    const response = validRedemptionResponse();
    setUrl(`/en/auth/magic-link#token=${token}`);
    mockedRedeemMagicLink.mockResolvedValue(response);

    const localStorageSetItem = vi.spyOn(window.localStorage, "setItem");
    const sessionStorageSetItem = vi.spyOn(window.sessionStorage, "setItem");
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];

    renderRedemptionStatus();

    await screen.findByText(enAuth.Auth.magicLink.successTitle);

    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(token);
    expect(localStorageSetItem).not.toHaveBeenCalled();
    expect(sessionStorageSetItem).not.toHaveBeenCalled();
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        const serialized = call.map(String).join(" ");
        expect(serialized).not.toContain(token);
        expect(serialized).not.toContain(response.csrfToken);
      }
    }
  });

  it("has no detectable accessibility violations in the invalid-or-expired state", async () => {
    setUrl("/en/auth/magic-link#token=not-a-valid-token");

    const { container } = renderRedemptionStatus();
    await screen.findByRole("alert");

    await expectNoAxeViolations(container);
  });
});
