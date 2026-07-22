import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import HomePage from "@/app/page";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { ApiClientError, apiClient } from "@/lib/api-client";

function QueryProviderProbe() {
  const queryClient = useQueryClient();

  return <span aria-label="Query provider status">{queryClient ? "ready" : "missing"}</span>;
}

describe("public marketplace shell", () => {
  it("renders the placeholder inside the provider-backed accessible shell", async () => {
    const user = userEvent.setup();

    render(
      <Providers>
        <AppShell>
          <HomePage />
          <QueryProviderProbe />
        </AppShell>
      </Providers>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /marketplace is being assembled/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/catalogue content will appear here/i);
    expect(screen.getByLabelText("Query provider status")).toHaveTextContent("ready");

    const skipLink = screen.getByRole("link", { name: /skip to content/i });
    skipLink.focus();
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveClass("skip-link");

    const menuButton = screen.getByRole("button", { name: /browse template groups/i });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: /template groups/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: /template groups/i })).not.toBeInTheDocument();
  });
});

describe("typed API boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts only health responses that satisfy the shared contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "not-ok" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.health()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledWith(
      "/health",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it.each([
    {
      body: "<html>upstream unavailable</html>",
      expectedMessage: "Bad Gateway",
      status: 502,
      statusText: "Bad Gateway",
    },
    {
      body: "",
      expectedMessage: "Request failed with status 503",
      status: 503,
      statusText: "",
    },
  ])("normalizes a $status non-JSON API failure", async ({ body, expectedMessage, status, statusText }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(new Response(body, { status, statusText }))),
    );

    const failure: unknown = await apiClient.health().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiClientError);
    expect(failure).toEqual(
      expect.objectContaining({
        code: "HTTP_ERROR",
        message: expectedMessage,
        status,
      }),
    );
  });

  it("routes a successful non-JSON response through shared-contract validation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));

    await expect(apiClient.health()).rejects.toBeInstanceOf(ZodError);
  });
});
