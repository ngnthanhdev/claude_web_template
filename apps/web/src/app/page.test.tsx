import type { LocalizedCategorySummary } from "@shared/catalogue";
import { localeSchema } from "@shared/localization";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { usePathname } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

import { viewport } from "@/app/layout";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import {
  isSupportedLocale,
  resolvePreferredLocale,
  routing,
} from "@/i18n/routing";
import { listCategories } from "@/lib/catalogue-client";
import enNavigation from "../../messages/en/navigation.json";
import viNavigation from "../../messages/vi/navigation.json";

vi.mock("next-intl/middleware", () => ({ default: () => vi.fn() }));

vi.mock("@/lib/catalogue-client", () => ({
  listCategories: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, usePathname: vi.fn(() => "/en") };
});

// The reduced-motion branch renders synchronously (no in-flight animation),
// which keeps open/close assertions deterministic in jsdom.
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => true };
});

const mockedListCategories = vi.mocked(listCategories);
const mockedUsePathname = vi.mocked(usePathname);

const categoriesFixture: LocalizedCategorySummary[] = [
  {
    slug: "wordpress",
    translations: [
      { locale: "vi", name: "WordPress", summary: "Mẫu WordPress." },
      { locale: "en", name: "WordPress", summary: "WordPress templates." },
    ],
  },
  {
    slug: "jamstack",
    translations: [
      { locale: "vi", name: "Jamstack", summary: "Mẫu Jamstack." },
      { locale: "en", name: "Jamstack", summary: "Jamstack templates." },
    ],
  },
];

function ShellProbe() {
  return <p role="status">shell probe content</p>;
}

function renderShell(locale: "vi" | "en", messages: typeof enNavigation) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Providers>
        <AppShell>
          <ShellProbe />
        </AppShell>
      </Providers>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("marketplace shell presence", () => {
  it.each([
    { locale: "vi" as const, messages: viNavigation },
    { locale: "en" as const, messages: enNavigation },
  ])(
    "renders the $locale shell with landmarks, skip link, and a locale-prefixed home link",
    ({ locale, messages }) => {
      mockedUsePathname.mockReturnValue(`/${locale}`);
      mockedListCategories.mockResolvedValue({
        data: categoriesFixture,
        meta: { nextCursor: null, hasMore: false },
      });
      renderShell(locale, messages);

      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(
        screen.getByRole("navigation", {
          name: messages.Shell.primaryNavigation,
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        "shell probe content",
      );

      expect(screen.getByRole("link", { name: /KITVERA/ })).toHaveAttribute(
        "href",
        `/${locale}`,
      );

      const skipLink = screen.getByRole("link", {
        name: messages.Shell.skipToContent,
      });
      skipLink.focus();
      expect(skipLink).toHaveFocus();
      expect(skipLink).toHaveClass("skip-link");

      const searchLink = screen.getByRole("link", {
        name: messages.Shell.search,
      });
      expect(searchLink).toHaveAttribute("href", `/${locale}/search`);
    },
  );

  it.each([
    { locale: "vi" as const, messages: viNavigation },
    { locale: "en" as const, messages: enNavigation },
  ])(
    "opens and closes the desktop category menu with Escape ($locale)",
    async ({ locale, messages }) => {
      mockedUsePathname.mockReturnValue(`/${locale}`);
      mockedListCategories.mockResolvedValue({
        data: categoriesFixture,
        meta: { nextCursor: null, hasMore: false },
      });
      const user = userEvent.setup();
      renderShell(locale, messages);

      const trigger = screen.getByRole("button", {
        name: messages.Shell.browse,
      });
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      await user.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");

      const panel = await screen.findByRole("region", {
        name: messages.Shell.categoriesPanel,
      });
      expect(
        within(panel).getByRole("link", { name: "WordPress" }),
      ).toHaveAttribute("href", `/${locale}/categories/wordpress`);

      await user.keyboard("{Escape}");
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByRole("region", { name: messages.Shell.categoriesPanel }),
      ).not.toBeInTheDocument();
    },
  );

  it("opens and closes the mobile drawer, including its category accordion", async () => {
    mockedUsePathname.mockReturnValue("/en");
    mockedListCategories.mockResolvedValue({
      data: categoriesFixture,
      meta: { nextCursor: null, hasMore: false },
    });
    const user = userEvent.setup();
    renderShell("en", enNavigation);

    const trigger = screen.getByRole("button", { name: /Menu/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const drawer = await screen.findByRole("region", {
      name: enNavigation.Shell.mobileNavigation,
    });

    const categoriesToggle = within(drawer).getByRole("button", {
      name: enNavigation.Shell.categoriesSection,
    });
    expect(categoriesToggle).toHaveAttribute("aria-expanded", "false");
    await user.click(categoriesToggle);
    expect(categoriesToggle).toHaveAttribute("aria-expanded", "true");
    expect(
      await within(drawer).findByRole("link", { name: "WordPress" }),
    ).toHaveAttribute("href", "/en/categories/wordpress");

    await user.click(
      within(drawer).getByRole("button", {
        name: enNavigation.Shell.closeMenu,
      }),
    );
    expect(
      screen.queryByRole("region", {
        name: enNavigation.Shell.mobileNavigation,
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps the locale and currency toggles independent", async () => {
    mockedUsePathname.mockReturnValue("/en");
    mockedListCategories.mockResolvedValue({
      data: categoriesFixture,
      meta: { nextCursor: null, hasMore: false },
    });
    const user = userEvent.setup();
    renderShell("en", enNavigation);

    const localeGroup = screen.getByRole("group", {
      name: enNavigation.Shell.localeToggleLabel,
    });
    const currencyGroup = screen.getByRole("group", {
      name: enNavigation.Shell.currencyToggleLabel,
    });

    const viLink = within(localeGroup).getByRole("link", { name: "VI" });
    const enLink = within(localeGroup).getByRole("link", { name: "EN" });
    expect(enLink).toHaveAttribute("aria-current", "true");
    expect(viLink).not.toHaveAttribute("aria-current");

    const usdButton = within(currencyGroup).getByRole("button", {
      name: "USD",
    });
    const vndButton = within(currencyGroup).getByRole("button", {
      name: "VND",
    });
    expect(vndButton).toHaveAttribute("aria-pressed", "true");
    expect(usdButton).toHaveAttribute("aria-pressed", "false");

    await user.click(usdButton);

    expect(usdButton).toHaveAttribute("aria-pressed", "true");
    expect(vndButton).toHaveAttribute("aria-pressed", "false");
    // Switching currency must not change the locale links.
    expect(enLink).toHaveAttribute("aria-current", "true");
    expect(viLink).toHaveAttribute("href", "/vi");
    expect(enLink).toHaveAttribute("href", "/en");
  });

  it("preserves the current path (not just the locale root) when switching locales", () => {
    mockedUsePathname.mockReturnValue("/en/categories/wordpress");
    mockedListCategories.mockResolvedValue({
      data: categoriesFixture,
      meta: { nextCursor: null, hasMore: false },
    });
    renderShell("en", enNavigation);

    const localeGroup = screen.getByRole("group", {
      name: enNavigation.Shell.localeToggleLabel,
    });
    expect(
      within(localeGroup).getByRole("link", { name: "VI" }),
    ).toHaveAttribute("href", "/vi/categories/wordpress");
  });

  it("keeps the vi and en navigation message catalogues on exactly the same key set", () => {
    const keys = (value: unknown, prefix = ""): string[] => {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        return [prefix];

      return Object.entries(value).flatMap(([key, nested]) =>
        keys(nested, prefix ? `${prefix}.${key}` : key),
      );
    };

    expect(keys(viNavigation).sort()).toEqual(keys(enNavigation).sort());
  });
});

describe("locale routing", () => {
  it("uses the shared catalogue locale vocabulary for every web route", () => {
    expect([...routing.locales]).toEqual(localeSchema.options);
  });

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
  ])(
    "negotiates the root using $label",
    ({ acceptLanguage, cookie, expectedPathname }) => {
      const storedLocale = cookie?.split("=").at(1);

      expect(`/${resolvePreferredLocale(storedLocale, acceptLanguage)}`).toBe(
        expectedPathname,
      );
    },
  );

  it("rejects unsupported locale segments", () => {
    expect(isSupportedLocale("vi")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
  });

  it("keeps viewport zoom enabled for localized routes", () => {
    expect(viewport).toMatchObject({
      initialScale: 1,
      viewportFit: "cover",
      width: "device-width",
    });
    expect(viewport).not.toHaveProperty("maximumScale");
    expect(viewport).not.toHaveProperty("userScalable", false);
  });
});
