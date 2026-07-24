import {
  accountPath,
  assertNoLeakedSessionMaterial,
  assertPageIsHealthy,
  expect,
  FAKE_MAGIC_LINK_TOKEN,
  magicLinkCaptureFilePath,
  magicLinkPath,
  pressTabUntilFocused,
  requestAndRedeemMagicLink,
  SESSION_COOKIE_NAME,
  signInPath,
  t,
  test,
  uniqueTestEmail,
} from "./fixtures/test-catalogue";

/**
 * Auth coverage for T-b8d260. Sign-in initiation, an invalid/expired token,
 * and the unauthenticated account redirect need no backend seam and run for
 * real in both locales on every viewport project. The full
 * request -> capture -> redeem -> account -> sign-out happy path additionally
 * needs the capture-only magic-link email seam documented in
 * `e2e/README.md`; those tests are written and statically valid but SKIP
 * themselves (not fail) when `E2E_MAGIC_LINK_CAPTURE_FILE` isn't set, since
 * apps/api does not yet ship the capture adapter that seam requires (see the
 * fixtures module and the README for the exact gap).
 */

const LOCALES = ["vi", "en"] as const;

for (const locale of LOCALES) {
  test.describe(`Sign-in request — ${locale}`, () => {
    test("submits the generic confirmation and leaks no session material", async ({
      page,
      axeBuilder,
    }) => {
      await page.goto(signInPath(locale));
      await assertPageIsHealthy(page, axeBuilder);

      const emailField = page.getByRole("textbox", {
        name: t(locale, "Auth.signIn.emailLabel"),
      });
      await pressTabUntilFocused(page, emailField);
      await emailField.fill(uniqueTestEmail());
      await page
        .getByRole("button", { name: t(locale, "Auth.signIn.submit") })
        .click();

      // However initiation actually resolves server-side, the UI only ever
      // shows this one generic confirmation (sign-in-form.tsx) — it never
      // branches on whether the address is registered.
      await expect(
        page.getByText(t(locale, "Auth.signIn.sentTitle")),
      ).toBeVisible();
      await expect(page).toHaveURL(new RegExp(signInPath(locale)));
      await assertNoLeakedSessionMaterial(page);
    });
  });

  test.describe(`Invalid magic-link token — ${locale}`, () => {
    test("shows the recovery state and clears the token from the URL instead of leaking it", async ({
      page,
      axeBuilder,
    }) => {
      await page.goto(
        `${magicLinkPath(locale)}#token=${FAKE_MAGIC_LINK_TOKEN}`,
      );

      await expect(
        page.getByRole("heading", {
          level: 1,
          name: t(locale, "Auth.magicLink.invalidOrExpiredTitle"),
        }),
      ).toBeVisible();
      await assertPageIsHealthy(page, axeBuilder);
      // redemption-status.tsx clears the fragment on first read, regardless
      // of outcome — the fake token must never persist in the URL bar.
      await assertNoLeakedSessionMaterial(page);

      const backLink = page.getByRole("link", {
        name: t(locale, "Auth.magicLink.backToSignInCta"),
      });
      await pressTabUntilFocused(page, backLink);
      await backLink.click();
      await expect(page).toHaveURL(new RegExp(signInPath(locale)));
    });
  });

  test.describe(`Unauthenticated account access — ${locale}`, () => {
    test("redirects to sign-in instead of exposing the account panel", async ({
      page,
    }) => {
      await page.goto(accountPath(locale));
      await expect(page).toHaveURL(new RegExp(signInPath(locale)));
      await assertNoLeakedSessionMaterial(page);
    });
  });
}

test.describe("Magic-link happy path (requires the capture-only email seam)", () => {
  test.skip(
    !magicLinkCaptureFilePath(),
    "Set E2E_MAGIC_LINK_CAPTURE_FILE to the capture adapter's JSONL file — see e2e/README.md. " +
      "apps/api does not ship that adapter yet (only the suppress-everything NullEmailDeliveryAdapter is wired).",
  );

  for (const locale of LOCALES) {
    test(`${locale}: redeems the captured link, reaches account, and signs out of this device`, async ({
      page,
      context,
      axeBuilder,
    }) => {
      const email = uniqueTestEmail();
      await requestAndRedeemMagicLink(page, locale, email);

      await expect(page).toHaveURL(new RegExp(accountPath(locale)));
      await expect(
        page.getByRole("region", {
          name: t(locale, "Account.panel.identityHeading"),
        }),
      ).toContainText(email);
      await assertPageIsHealthy(page, axeBuilder);

      // The session cookie itself is only inspectable from the privileged
      // Playwright harness (context.cookies()), never from in-page JS — that
      // asymmetry is the point of __Host-/httpOnly (auth-cookie.ts).
      const sessionCookie = (await context.cookies()).find(
        (cookie) => cookie.name === SESSION_COOKIE_NAME,
      );
      expect(sessionCookie?.httpOnly).toBe(true);
      expect(sessionCookie?.secure).toBe(true);
      expect(sessionCookie?.sameSite).toBe("Lax");
      await assertNoLeakedSessionMaterial(page);

      const signOutButton = page.getByRole("button", {
        name: t(locale, "Account.actions.signOut"),
      });
      await pressTabUntilFocused(page, signOutButton);
      await signOutButton.click();

      await expect(page).toHaveURL(new RegExp(signInPath(locale)));
      await assertNoLeakedSessionMaterial(page);
    });
  }

  test("en: 'sign out of all devices' clears the session too", async ({
    page,
    context,
  }) => {
    const email = uniqueTestEmail();
    await requestAndRedeemMagicLink(page, "en", email);
    await expect(page).toHaveURL(new RegExp(accountPath("en")));

    await page
      .getByRole("button", { name: t("en", "Account.actions.signOutAll") })
      .click();
    await expect(page).toHaveURL(new RegExp(signInPath("en")));

    const sessionCookieAfter = (await context.cookies()).find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );
    expect(sessionCookieAfter).toBeUndefined();
    await assertNoLeakedSessionMaterial(page);
  });
});
