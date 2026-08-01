import { randomBytes } from "node:crypto";

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useRouter } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { createQueryClient } from "@/lib/query-client";
import enAccount from "../../../messages/en/account.json";
import viAccount from "../../../messages/vi/account.json";

import { AccountPanel } from "./account-panel";

// This suite is the single test file this task is scoped to (see the Files
// list in tasks/layer-5-todo.md), so it exercises the whole account-landing
// composition — `AccountPanel`, which owns the session read + unauthenticated
// redirect, rendering the identity block and the colocated `SessionActions`
// (both sign-out affordances) — rather than any one piece in isolation.
// `fetch` is stubbed (not `@/lib/auth-client`), so the CSRF-header and
// 204-handling assertions exercise the real auth-client/api-client request
// path, matching how `auth-client.test.ts` verifies the same client.

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
const FIXTURE_EMAIL = "person@example.com";
const FIXTURE_EXPIRES_AT = "2026-08-23T10:15:00.000Z";

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

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

function unauthenticatedResponse(): Response {
  return jsonResponse(
    { error: { code: "UNAUTHENTICATED", message: "Not signed in." } },
    401,
  );
}

interface FetchCall {
  url: string;
  method: string;
  headers: Headers;
}

/**
 * A stateful fetch stub covering exactly the requests this feature makes:
 * `GET /api/v1/sessions/current` (returns the fixture session until either
 * revocation endpoint is hit, then 401 — the real server behavior a cleared
 * session cookie produces) and both `DELETE` revocation endpoints (204).
 */
function createFetchMock(csrfToken: string) {
  let signedOut = false;
  const calls: FetchCall[] = [];

  const impl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, headers: new Headers(init?.headers) });

      if (url === "/api/v1/sessions/current" && method === "GET") {
        return signedOut
          ? unauthenticatedResponse()
          : jsonResponse(sessionFixture(csrfToken));
      }
      if (url === "/api/v1/sessions/current" && method === "DELETE") {
        signedOut = true;
        return emptyResponse(204);
      }
      if (url === "/api/v1/sessions" && method === "DELETE") {
        signedOut = true;
        return emptyResponse(204);
      }

      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    },
  );

  return { impl, calls };
}

function renderAccountPanel() {
  const queryClient = createQueryClient();
  return render(
    <NextIntlClientProvider locale="en" messages={enAccount}>
      <QueryClientProvider client={queryClient}>
        <AccountPanel />
      </QueryClientProvider>
    </NextIntlClientProvider>,
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

describe("AccountPanel (authenticated)", () => {
  it("renders only the allowlisted session identity, read-only, for a signed-in visitor", async () => {
    const csrfToken = base64UrlToken();
    const { impl, calls } = createFetchMock(csrfToken);
    vi.stubGlobal("fetch", impl);

    renderAccountPanel();

    expect(await screen.findByText(FIXTURE_EMAIL)).toBeInTheDocument();

    const expectedExpiry = new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(FIXTURE_EXPIRES_AT));
    expect(screen.getByText(expectedExpiry)).toBeInTheDocument();

    // Never redirected, and the sign-out actions are present.
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: enAccount.Account.actions.signOut }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: enAccount.Account.actions.signOutAll,
      }),
    ).toBeInTheDocument();

    // Orders and library now link to their real `T-1d6f3a` pages; profile
    // editing remains deferred and is never rendered as functional.
    expect(
      screen.getByRole("link", { name: enAccount.Account.panel.ordersLink }),
    ).toHaveAttribute("href", "/en/account/orders");
    expect(
      screen.getByRole("link", { name: enAccount.Account.panel.libraryLink }),
    ).toHaveAttribute("href", "/en/account/library");
    expect(
      screen.queryByRole("link", { name: /profile/i }),
    ).not.toBeInTheDocument();

    // `AccountPanel` and the nested `SessionActions` both call `useSession`;
    // sharing one TanStack Query cache entry means exactly one network read.
    expect(calls.filter((call) => call.method === "GET")).toHaveLength(1);
  });

  it("has no detectable accessibility violations once authenticated", async () => {
    const csrfToken = base64UrlToken();
    const { impl } = createFetchMock(csrfToken);
    vi.stubGlobal("fetch", impl);

    const { container } = renderAccountPanel();
    await screen.findByText(FIXTURE_EMAIL);

    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("AccountPanel (unauthenticated)", () => {
  it("redirects to the locale-prefixed sign-in route instead of rendering any session data", async () => {
    const fetchMock = vi.fn(async () => unauthenticatedResponse());
    vi.stubGlobal("fetch", fetchMock);

    renderAccountPanel();

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/en/auth/sign-in"),
    );

    expect(screen.queryByText(FIXTURE_EMAIL)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: enAccount.Account.actions.signOut }),
    ).not.toBeInTheDocument();
  });
});

describe("AccountPanel (session read failure)", () => {
  it("shows a retry state instead of redirecting on a non-401 failure", async () => {
    const fetchMock = vi.fn(async () => emptyResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    renderAccountPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enAccount.Account.panel.error.heading,
    );
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

describe("SessionActions revocation", () => {
  it("signs out of the current device: DELETEs /sessions/current with X-CSRF-Token and clears the session on 204", async () => {
    const csrfToken = base64UrlToken();
    const { impl, calls } = createFetchMock(csrfToken);
    vi.stubGlobal("fetch", impl);
    const user = userEvent.setup();

    renderAccountPanel();
    await screen.findByText(FIXTURE_EMAIL);

    await user.click(
      screen.getByRole("button", { name: enAccount.Account.actions.signOut }),
    );

    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.url === "/api/v1/sessions/current" && call.method === "DELETE",
        ),
      ).toBe(true),
    );
    const revocationCall = calls.find(
      (call) =>
        call.url === "/api/v1/sessions/current" && call.method === "DELETE",
    );
    expect(revocationCall?.headers.get("x-csrf-token")).toBe(csrfToken);

    // The 204 response clears the session cookie server-side; the hook's
    // re-check comes back unauthenticated, which sends the visitor to a
    // public locale route via the same redirect the unauthenticated case uses.
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/en/auth/sign-in"),
    );
  });

  it("signs out of every device: DELETEs /sessions (not /sessions/current) with X-CSRF-Token and clears the session on 204", async () => {
    const csrfToken = base64UrlToken();
    const { impl, calls } = createFetchMock(csrfToken);
    vi.stubGlobal("fetch", impl);
    const user = userEvent.setup();

    renderAccountPanel();
    await screen.findByText(FIXTURE_EMAIL);

    await user.click(
      screen.getByRole("button", {
        name: enAccount.Account.actions.signOutAll,
      }),
    );

    await waitFor(() =>
      expect(
        calls.some(
          (call) => call.url === "/api/v1/sessions" && call.method === "DELETE",
        ),
      ).toBe(true),
    );
    const revocationCall = calls.find(
      (call) => call.url === "/api/v1/sessions" && call.method === "DELETE",
    );
    expect(revocationCall?.headers.get("x-csrf-token")).toBe(csrfToken);
    expect(
      calls.some(
        (call) =>
          call.url === "/api/v1/sessions/current" && call.method === "DELETE",
      ),
    ).toBe(false);

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/en/auth/sign-in"),
    );
  });
});

describe("no session/CSRF token leak", () => {
  it("never writes to localStorage/sessionStorage and never renders the CSRF token or session id", async () => {
    const csrfToken = base64UrlToken();
    const { impl, calls } = createFetchMock(csrfToken);
    vi.stubGlobal("fetch", impl);
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();

    const { container } = renderAccountPanel();
    await screen.findByText(FIXTURE_EMAIL);

    expect(container.textContent).not.toContain(csrfToken);
    expect(container.textContent).not.toContain(FIXTURE_SESSION_ID);
    expect(container.textContent).not.toContain(FIXTURE_USER_ID);

    await user.click(
      screen.getByRole("button", { name: enAccount.Account.actions.signOut }),
    );
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalled());

    expect(setItemSpy).not.toHaveBeenCalled();
    for (const call of calls) {
      expect(call.url).not.toContain(csrfToken);
    }
  });
});

describe("account.json locale parity", () => {
  it("keeps the vi and en Account message catalogues on exactly the same key set", () => {
    expect(collectKeys(viAccount).sort()).toEqual(
      collectKeys(enAccount).sort(),
    );
  });
});
