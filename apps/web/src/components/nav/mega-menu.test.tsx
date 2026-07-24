import type { LocalizedCategorySummary } from "@shared/catalogue";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import enNavigation from "../../../messages/en/navigation.json";
import viNavigation from "../../../messages/vi/navigation.json";
import { listCategories } from "@/lib/catalogue-client";

import { MegaMenu } from "./mega-menu";

// `vitest-axe`'s `matchers` subpath types this project's installed version
// ships as type-only, so `expect(...).toHaveNoViolations()` can't be wired
// up without fighting that mismatch. Asserting on `AxeResults.violations`
// directly is equivalent and avoids the broken subpath entirely.
async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe(container);
  const summary = results.violations
    .map((violation) => `${violation.id}: ${violation.help}`)
    .join("\n");
  expect(results.violations, summary).toHaveLength(0);
}

vi.mock("@/lib/catalogue-client", () => ({
  listCategories: vi.fn(),
}));

// The reduced-motion branch renders synchronously (no in-flight animation),
// which keeps assertions and axe scans deterministic in jsdom.
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => true };
});

const mockedListCategories = vi.mocked(listCategories);

const categoriesFixture: LocalizedCategorySummary[] = [
  {
    slug: "wordpress",
    translations: [
      { locale: "vi", name: "WordPress", summary: "Mẫu WordPress." },
      { locale: "en", name: "WordPress", summary: "WordPress templates." },
    ],
  },
  {
    slug: "elementor",
    translations: [
      { locale: "vi", name: "Elementor", summary: "Mẫu Elementor." },
      { locale: "en", name: "Elementor", summary: "Elementor templates." },
    ],
  },
  {
    slug: "shopify",
    translations: [
      { locale: "vi", name: "Cửa hàng Shopify", summary: "Mẫu Shopify." },
      {
        locale: "en",
        name: "Shopify storefronts",
        summary: "Shopify templates.",
      },
    ],
  },
];

type FixtureLocale = "vi" | "en";

const localeScenarios: {
  locale: FixtureLocale;
  messages: typeof enNavigation;
  expectedLinks: { name: string; slug: string }[];
}[] = [
  {
    locale: "vi",
    messages: viNavigation,
    expectedLinks: [
      { name: "WordPress", slug: "wordpress" },
      { name: "Elementor", slug: "elementor" },
      { name: "Cửa hàng Shopify", slug: "shopify" },
    ],
  },
  {
    locale: "en",
    messages: enNavigation,
    expectedLinks: [
      { name: "WordPress", slug: "wordpress" },
      { name: "Elementor", slug: "elementor" },
      { name: "Shopify storefronts", slug: "shopify" },
    ],
  },
];

function renderMegaMenu(locale: FixtureLocale, messages: typeof enNavigation) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <MegaMenu />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MegaMenu", () => {
  it.each(localeScenarios)(
    "renders categories from the mocked client with locale-preserving links ($locale)",
    async ({ locale, messages, expectedLinks }) => {
      mockedListCategories.mockResolvedValue({
        data: categoriesFixture,
        meta: { nextCursor: null, hasMore: false },
      });
      const user = userEvent.setup();
      renderMegaMenu(locale, messages);

      const trigger = screen.getByRole("button", {
        name: messages.Shell.browse,
      });
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      await user.click(trigger);

      expect(trigger).toHaveAttribute("aria-expanded", "true");
      const panel = await screen.findByRole("region", {
        name: messages.Shell.categoriesPanel,
      });

      for (const { name, slug } of expectedLinks) {
        const link = within(panel).getByRole("link", { name });
        expect(link).toHaveAttribute("href", `/${locale}/categories/${slug}`);
      }

      expect(mockedListCategories).toHaveBeenCalledWith({ locale });
    },
  );

  it("closes the panel on Escape", async () => {
    mockedListCategories.mockResolvedValue({
      data: categoriesFixture,
      meta: { nextCursor: null, hasMore: false },
    });
    const user = userEvent.setup();
    renderMegaMenu("en", enNavigation);

    await user.click(
      screen.getByRole("button", { name: enNavigation.Shell.browse }),
    );
    await screen.findByRole("region", {
      name: enNavigation.Shell.categoriesPanel,
    });

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("region", {
        name: enNavigation.Shell.categoriesPanel,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: enNavigation.Shell.browse }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the panel when the scrim is clicked", async () => {
    mockedListCategories.mockResolvedValue({
      data: categoriesFixture,
      meta: { nextCursor: null, hasMore: false },
    });
    const user = userEvent.setup();
    renderMegaMenu("en", enNavigation);

    await user.click(
      screen.getByRole("button", { name: enNavigation.Shell.browse }),
    );
    await screen.findByRole("region", {
      name: enNavigation.Shell.categoriesPanel,
    });

    await user.click(
      screen.getByRole("button", { name: enNavigation.Shell.closeCategories }),
    );

    expect(
      screen.queryByRole("region", {
        name: enNavigation.Shell.categoriesPanel,
      }),
    ).not.toBeInTheDocument();
  });

  it("surfaces an honest error state instead of fabricating categories", async () => {
    mockedListCategories.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderMegaMenu("en", enNavigation);

    await user.click(
      screen.getByRole("button", { name: enNavigation.Shell.browse }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enNavigation.Shell.categoriesError,
    );
  });

  it("has no axe violations while open", async () => {
    mockedListCategories.mockResolvedValue({
      data: categoriesFixture,
      meta: { nextCursor: null, hasMore: false },
    });
    const user = userEvent.setup();
    const { container } = renderMegaMenu("en", enNavigation);

    await user.click(
      screen.getByRole("button", { name: enNavigation.Shell.browse }),
    );
    await screen.findByRole("region", {
      name: enNavigation.Shell.categoriesPanel,
    });

    await expectNoAxeViolations(container);
  });
});
