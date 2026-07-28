import {
  assertNoLeakedSessionMaterial,
  assertPageIsHealthy,
  deriveSearchTermFromSlug,
  expect,
  homePath,
  lastPathSegment,
  openCategoryFromNav,
  PAGINATION_PAGE_SIZE,
  pressTabUntilFocused,
  searchPath,
  SEEDED_CATEGORY,
  switchCurrency,
  t,
  test,
  withQueryParam,
} from "./fixtures/test-catalogue";

/**
 * Cross-viewport browse coverage for T-b8d260. Two locale/currency
 * combinations are exercised end to end (rather than a full 2x2 matrix) —
 * `vi`/`VND` through the mega-menu/drawer category path, `en`/`USD` through
 * the always-visible search entry point — so both collection surfaces
 * (`/[locale]/categories/[...slug]` and `/[locale]/search`) and both
 * currencies are proven, without an excessive combinatorial explosion. Each
 * of the five `playwright.config.ts` projects runs this file once per
 * viewport, so together the suite covers both locales, both currencies, and
 * 320-1440px.
 */

const PRODUCT_LINK_SELECTOR = 'a[href*="/templates/"]';

test.describe("Browse happy path — vi / VND / mega-menu-or-drawer -> category", () => {
  const locale = "vi";

  test("home -> category nav -> filters/sort/pagination -> back restores state -> product detail", async ({
    page,
    axeBuilder,
  }) => {
    await page.goto(homePath(locale));
    await assertPageIsHealthy(page, axeBuilder);
    await assertNoLeakedSessionMaterial(page);
    await pressTabUntilFocused(
      page,
      page.getByRole("link", { name: t(locale, "Shell.skipToContent") }),
    );

    const categoryLink = await openCategoryFromNav(
      page,
      locale,
      SEEDED_CATEGORY,
    );
    // The mega-menu/drawer entry is a Next.js <Link>: clicking it triggers an
    // App Router soft navigation (history.pushState — no document `load`
    // event re-fires). Racing `page.waitForURL`, whose default
    // `waitUntil: "load"` never resolves for a same-document navigation,
    // against the click hangs until the 30s timeout even though the URL does
    // update. Await the click, then let the auto-retrying URL assertion poll
    // `page.url()` until the route commits.
    await categoryLink.click();
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/categories/${SEEDED_CATEGORY}`),
    );

    await expect(
      page.getByRole("list", {
        name: t(locale, "Collection.grid.regionLabel"),
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`category=${SEEDED_CATEGORY}`));
    await assertPageIsHealthy(page, axeBuilder);

    // The only facet FilterRail renders in "category" mode: the category
    // itself is route-locked (no checkbox for it), and CollectionView never
    // supplies facetGroups/compatibilityOptions, so "recently updated" is the
    // sole remaining filter besides price/licence (see filter-rail.tsx).
    await page
      .getByRole("radio", {
        name: t(locale, "Collection.filters.updatedWithin.1y"),
      })
      .click();
    await expect(page).toHaveURL(/updatedWithin=1y/);
    await expect(
      page
        .getByRole("list", { name: t(locale, "Collection.grid.regionLabel") })
        .getByRole("listitem")
        .first(),
    ).toBeVisible();

    await page
      .getByRole("combobox", { name: t(locale, "Collection.sort.label") })
      .selectOption({ label: t(locale, "Collection.sort.options.price-asc") });
    await expect(page).toHaveURL(/sort=price-asc/);

    // URL-backed state restores on Back navigation: use-product-collection's
    // filter/sort changes call `router.replace` (they don't push new history
    // entries), so this page's *last* URL is what a real push-navigation
    // away-and-back returns to.
    const urlBeforeLeaving = page.url();
    const probeLink = page.locator(PRODUCT_LINK_SELECTOR).first();
    await Promise.all([page.waitForURL(/\/templates\//), probeLink.click()]);
    await page.goBack();
    await expect(page).toHaveURL(urlBeforeLeaving);
    await expect(
      page.getByRole("combobox", { name: t(locale, "Collection.sort.label") }),
    ).toHaveValue("price-asc");

    // Pagination: force a small `limit` via a direct link (a legitimate
    // shareable URL) so MIN_SEEDED_PRODUCTS_IN_CATEGORY is enough to produce
    // a second page, instead of requiring the API's default limit (24) worth
    // of fixture rows.
    await page.goto(
      withQueryParam(page.url(), "limit", String(PAGINATION_PAGE_SIZE)),
    );
    const pager = page.getByRole("navigation", {
      name: t(locale, "Collection.pager.regionLabel"),
    });
    await expect(
      pager.getByRole("button", {
        name: t(locale, "Collection.pager.previous"),
      }),
    ).toBeDisabled();
    const nextButton = pager.getByRole("button", {
      name: t(locale, "Collection.pager.next"),
    });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    await expect(page).toHaveURL(/cursor=/);
    const previousButton = pager.getByRole("button", {
      name: t(locale, "Collection.pager.previous"),
    });
    await expect(previousButton).toBeEnabled();
    await previousButton.click();
    await expect(page).not.toHaveURL(/cursor=/);

    const productHref = await page
      .locator(PRODUCT_LINK_SELECTOR)
      .first()
      .getAttribute("href");
    if (!productHref) {
      throw new Error(
        `Expected >= ${String(PAGINATION_PAGE_SIZE)} seeded products under "${SEEDED_CATEGORY}" — see fixtures/test-catalogue.ts.`,
      );
    }
    await page.goto(productHref);
    await assertPageIsHealthy(page, axeBuilder);
    await assertNoLeakedSessionMaterial(page);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("iframe")).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-forms",
    );
    await expect(
      page.getByRole("button", {
        name: t(locale, "Product.licence.purchaseLabel"),
      }),
    ).toBeDisabled();

    // Currency independence: switching VND -> USD must change the rendered
    // licence prices without touching locale (src/lib/currency.tsx).
    const licenceSection = page.getByRole("region", {
      name: t(locale, "Product.licence.heading"),
    });
    await expect(licenceSection).toContainText("₫"); // VND symbol
    const priceTextBefore = await licenceSection.textContent();
    await switchCurrency(page, locale, "USD");
    await expect(licenceSection).toContainText("$");
    const priceTextAfter = await licenceSection.textContent();
    expect(priceTextAfter).not.toBe(priceTextBefore);

    await pressTabUntilFocused(
      page,
      page
        .getByRole("group", { name: t(locale, "Product.demo.switcherLabel") })
        .getByRole("button")
        .first(),
    );
  });
});

test.describe("Browse happy path — en / USD / search icon -> search", () => {
  const locale = "en";

  test.beforeEach(async ({ context }) => {
    // Deterministically starts this flow in USD (currency is independent of
    // locale) without depending on the toggle's viewport-dependent
    // reachability — the vi/VND flow above already exercises that toggle.
    await context.addInitScript(() => {
      window.localStorage.setItem("kitvera.currency", "USD");
    });
  });

  test("home -> search -> filters/sort -> product detail", async ({
    page,
    axeBuilder,
  }) => {
    await page.goto(homePath(locale));
    await page.getByRole("link", { name: t(locale, "Shell.search") }).click();
    await expect(page).toHaveURL(new RegExp(searchPath(locale)));
    await assertPageIsHealthy(page, axeBuilder);
    await assertNoLeakedSessionMaterial(page);

    const searchBox = page.getByRole("searchbox", {
      name: t(locale, "Catalogue.search.inputLabel"),
    });
    await pressTabUntilFocused(page, searchBox);

    // No `q` yet: sort defaults to "newest" (collection-view.tsx).
    await expect(
      page.getByRole("combobox", { name: t(locale, "Collection.sort.label") }),
    ).toHaveValue("newest");

    const seedHref = await page
      .locator(PRODUCT_LINK_SELECTOR)
      .first()
      .getAttribute("href");
    if (!seedHref) {
      throw new Error(
        "Expected at least one seeded product on the unfiltered search page.",
      );
    }
    const searchTerm = deriveSearchTermFromSlug(lastPathSegment(seedHref));

    await searchBox.fill(searchTerm);
    await page
      .getByRole("button", { name: t(locale, "Catalogue.search.submit") })
      .click();

    await expect(page).toHaveURL(/q=/);
    await expect(page).toHaveURL(/sort=relevance/);
    await expect(
      page.getByText(
        t(locale, "Catalogue.search.activeQuery", { query: searchTerm }),
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("list", {
        name: t(locale, "Collection.grid.regionLabel"),
      }),
    ).toBeVisible();

    // The search-mode-only category checkbox facet (suppressed in category
    // mode — collection-view.tsx). Selected by its `value=` slug attribute,
    // not its seed-data-driven translated label.
    // Controlled off the URL: onChange -> updateFilters -> router.replace, so
    // `checked` only flips once that async navigation re-renders. Locator
    // .check() asserts the state changed synchronously right after its click
    // and fails ("Clicking the checkbox did not change its state") before the
    // URL round-trip lands. Dispatch a plain click, wait for the URL to carry
    // the category, then confirm the box reflects the settled state.
    const categoryFacet = page.locator(
      `input[type="checkbox"][value="${SEEDED_CATEGORY}"]`,
    );
    await categoryFacet.click();
    await expect(page).toHaveURL(new RegExp(`category=${SEEDED_CATEGORY}`));
    await expect(categoryFacet).toBeChecked();
    await assertPageIsHealthy(page, axeBuilder);

    const resultHref = await page
      .locator(PRODUCT_LINK_SELECTOR)
      .first()
      .getAttribute("href");
    if (!resultHref) {
      throw new Error(
        "Expected the filtered search to still return a product.",
      );
    }
    await page.goto(resultHref);

    await assertPageIsHealthy(page, axeBuilder);
    await assertNoLeakedSessionMaterial(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Every licence option always prices both currencies (licenceOptionsSchema
    // requires one price per supported currency), so USD is guaranteed here.
    await expect(
      page.getByRole("region", { name: t(locale, "Product.licence.heading") }),
    ).toContainText("$");
  });
});
