import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { viewport } from "@/app/layout";
import HomePage from "@/app/[locale]/page";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { isSupportedLocale, resolvePreferredLocale } from "@/i18n/routing";
import { ApiClientError, apiClient } from "@/lib/api-client";
import enMessages from "../../messages/en.json";
import viMessages from "../../messages/vi.json";

function QueryProviderProbe() {
  const queryClient = useQueryClient();

  return <span aria-label="Query provider status">{queryClient ? "ready" : "missing"}</span>;
}

describe("public marketplace shell", () => {
  it.each([
    {
      browseLabel: "Duyệt nhóm mẫu",
      heading: "Sàn mẫu web đang được xây dựng.",
      homeHref: "/vi",
      locale: "vi",
      messages: viMessages,
      navigationLabel: "Điều hướng chính",
      status: "Nội dung danh mục sẽ xuất hiện tại đây",
      templateGroupsLabel: "Nhóm mẫu",
    },
    {
      browseLabel: "Browse template groups",
      heading: "The marketplace is being assembled.",
      homeHref: "/en",
      locale: "en",
      messages: enMessages,
      navigationLabel: "Primary navigation",
      status: "Catalogue content will appear here",
      templateGroupsLabel: "Template groups",
    },
  ])("renders the $locale route inside the accessible shell", async ({
    browseLabel,
    heading,
    homeHref,
    locale,
    messages,
    navigationLabel,
    status,
    templateGroupsLabel,
  }) => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <Providers>
          <AppShell>
            <HomePage />
            <QueryProviderProbe />
          </AppShell>
        </Providers>
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: navigationLabel })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(status);
    expect(screen.getByLabelText("Query provider status")).toHaveTextContent("ready");
    expect(screen.getByRole("link", { name: /KITVERA/ })).toHaveAttribute("href", homeHref);

    const skipLink = screen.getByRole("link", { name: locale === "vi" ? /chuyển đến nội dung/i : /skip to content/i });
    skipLink.focus();
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveClass("skip-link");

    const menuButton = screen.getByRole("button", { name: browseLabel });
    expect(menuButton).toHaveClass("h-11", "min-h-11");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: templateGroupsLabel })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: /template groups/i })).not.toBeInTheDocument();
  });
});

afterEach(() => cleanup());

describe("locale routing", () => {
  it.each([
    {
      acceptLanguage: "vi-VN,vi;q=0.9",
      cookie: "NEXT_LOCALE=en",
      expectedPathname: "/en",
      label: "stored locale before Accept-Language",
    },
    {
      acceptLanguage: "en-US,en;q=0.9",
      cookie: undefined,
      expectedPathname: "/en",
      label: "Accept-Language when no locale is stored",
    },
    {
      acceptLanguage: "fr-FR,fr;q=0.9",
      cookie: undefined,
      expectedPathname: "/vi",
      label: "Vietnamese fallback for unsupported preferences",
    },
  ])("negotiates the root using $label", ({ acceptLanguage, cookie, expectedPathname }) => {
    const storedLocale = cookie?.split("=").at(1);

    expect(`/${resolvePreferredLocale(storedLocale, acceptLanguage)}`).toBe(expectedPathname);
  });

  it("rejects unsupported locale segments", () => {
    expect(isSupportedLocale("vi")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
  });

  it("keeps both message catalogues on exactly the same key set", () => {
    const keys = (value: unknown, prefix = ""): string[] => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return [prefix];

      return Object.entries(value).flatMap(([key, nested]) => keys(nested, prefix ? `${prefix}.${key}` : key));
    };

    expect(keys(viMessages).sort()).toEqual(keys(enMessages).sort());
  });

  it("keeps viewport zoom enabled for localized routes", () => {
    expect(viewport).toMatchObject({ initialScale: 1, viewportFit: "cover", width: "device-width" });
    expect(viewport).not.toHaveProperty("maximumScale");
    expect(viewport).not.toHaveProperty("userScalable", false);
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
