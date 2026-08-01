import { stat } from "node:fs/promises";

import {
  accountLibraryPath,
  cartPath,
  checkoutResultPath,
  PURCHASABLE_PRODUCT_SLUG,
  PURCHASABLE_PRODUCT_TITLES,
  templatePath,
} from "./fixtures/purchasable-product";
import {
  assertNoLeakedSessionMaterial,
  assertPageIsHealthy,
  expect,
  requestAndRedeemMagicLink,
  t,
  test,
  uniqueTestEmail,
} from "./fixtures/test-catalogue";

/**
 * Cross-viewport Wave-1 purchase-happy-path coverage for T-e3a9d7: sign in
 * (magic-link capture seam, see e2e/README.md) -> add to cart -> open
 * checkout (sandbox) -> checkout -> sandbox settle -> checkout result ->
 * account/library -> download, in both vi/VND and en/USD. Like
 * `auth.spec.ts`'s happy-path block, this whole file self-skips when
 * `E2E_MAGIC_LINK_CAPTURE_FILE` isn't configured, since every scenario here
 * needs a real signed-in session.
 *
 * Cross-viewport, not cross-every-viewport: `playwright.config.ts` is out of
 * this task's file scope (unlike `auth.spec.ts`, which the config itself pins
 * to a single dedicated project), so this file matches every one of the five
 * `BROWSE_VIEWPORTS` projects by filename the same way `browse.spec.ts` does.
 * But each scenario here spends one of apps/api's per-source-IP magic-link
 * initiation+redemption budget (auth-rate-limit.service.ts: 20
 * initiations/15min, 10 redemptions/15min, shared across every spec run in
 * the same Playwright process) — running both locale/currency scenarios on
 * all five projects would cost 10 redemptions on top of `auth.spec.ts`'s own
 * (up to 3), risking the 10/15min redemption cap on a single full suite run.
 * So each scenario below pins itself, via `testInfo.project.name`, to one of
 * the two extremes of the acceptance's 320-1440px range — mobile-320 and
 * desktop-1440 — the same "representative viewport" idea
 * `playwright.config.ts` already documents for `BROWSE_VIEWPORTS`, just
 * applied per-scenario instead of per-file since the project list itself is
 * out of scope here. That keeps this file's total redemption cost at 2 per
 * full run (see e2e/README.md's "Rate limiting" section for the combined
 * budget).
 */

const LOCALE_PROJECTS = {
  vi: "mobile-320",
  en: "desktop-1440",
} as const;

for (const locale of ["vi", "en"] as const) {
  test.describe(`Purchase happy path — ${locale}`, () => {
    test(`${locale}: sign in -> add to cart -> checkout -> sandbox settle -> result -> library -> download`, async ({
      page,
      context,
      axeBuilder,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== LOCALE_PROJECTS[locale],
        `This scenario only runs on the "${LOCALE_PROJECTS[locale]}" project — see the rate-limit note in this file's header comment.`,
      );

      if (locale === "en") {
        // Mirrors browse.spec.ts's en/USD block: currency is independent of
        // locale, so USD display is set explicitly rather than relying on
        // the viewport-dependent toggle.
        await context.addInitScript(() => {
          window.localStorage.setItem("kitvera.currency", "USD");
        });
      }

      const email = uniqueTestEmail();
      await requestAndRedeemMagicLink(page, locale, email);
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);

      // --- Add to cart ---------------------------------------------------
      await page.goto(templatePath(locale, PURCHASABLE_PRODUCT_SLUG));
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);

      const productTitle = PURCHASABLE_PRODUCT_TITLES[locale];
      // Every licence tier's add-to-cart button shares the same accessible
      // name (title only, not licence — see add-to-cart-button.tsx); the
      // Regular tier renders first (licenceIdentifierSchema's option order).
      await page
        .getByRole("button", {
          name: t(locale, "Cart.addToCart.addLabelForTitle", {
            title: productTitle,
          }),
        })
        .first()
        .click();

      const cartNavLink = page.getByRole("link", {
        name: t(locale, "Cart.navEntry.label", { count: 1 }),
      });
      await expect(cartNavLink).toBeVisible();

      // --- Open checkout (sandbox) ----------------------------------------
      await cartNavLink.click();
      await expect(page).toHaveURL(new RegExp(cartPath(locale)));
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);

      await page
        .getByRole("button", { name: t(locale, "Cart.page.checkout") })
        .click();
      const checkoutDialog = page.getByRole("dialog");
      await expect(checkoutDialog).toBeVisible();
      await expect(
        checkoutDialog.getByText(t(locale, "Checkout.dialog.sandboxLabel")),
      ).toBeVisible();
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);

      // --- Checkout -> sandbox settle --------------------------------------
      await checkoutDialog
        .getByRole("textbox", { name: t(locale, "Checkout.form.emailLabel") })
        .fill(email);
      await checkoutDialog
        .getByRole("textbox", { name: t(locale, "Checkout.form.nameLabel") })
        .fill("Nguyen Van A");
      await checkoutDialog
        .getByRole("button", { name: t(locale, "Checkout.form.continue") })
        .click();

      // The dialog's onOrderCreated triggers an App Router soft navigation
      // (router.push — no document `load` event): await the click, then let
      // this auto-retrying URL assertion poll page.url() instead of racing
      // page.waitForURL (see browse.spec.ts's identical note).
      await expect(page).toHaveURL(new RegExp(checkoutResultPath(locale)));

      // --- Checkout result --------------------------------------------------
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);
      await expect(
        page.getByRole("heading", {
          name: t(locale, "Checkout.result.settledHeading"),
        }),
      ).toBeVisible();

      // --- Account / library --------------------------------------------------
      await page
        .getByRole("link", { name: t(locale, "Checkout.result.libraryLink") })
        .click();
      await expect(page).toHaveURL(new RegExp(accountLibraryPath(locale)));
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);

      const downloadButton = page.getByRole("button", {
        name: t(locale, "Account.library.download.action"),
      });
      await expect(downloadButton).toBeVisible();

      // --- Download -----------------------------------------------------
      const libraryUrl = page.url();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        downloadButton.click(),
      ]);

      // window.location.assign navigates to a `content-disposition:
      // attachment` response, so the browser turns it into a download
      // instead of a real navigation — the visible page URL never changes,
      // and never carries the short-lived download token (design §9
      // "Download/entitlement tokens / Information disclosure").
      expect(page.url()).toBe(libraryUrl);
      await assertNoLeakedSessionMaterial(page);

      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      if (downloadPath) {
        const stats = await stat(downloadPath);
        expect(stats.size).toBeGreaterThan(0);
      }
    });
  });
}
