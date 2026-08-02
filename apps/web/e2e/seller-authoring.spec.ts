import type { Page } from "@playwright/test";

import {
  draftProductFormInput,
  newSellerProductPath,
  sellerPath,
  SELLER_EMAIL,
  trackSellerApiResponses,
  uniqueDraftProductSlug,
  versionFormInput,
} from "./fixtures/seller-user";
import {
  assertNoLeakedSessionMaterial,
  assertPageIsHealthy,
  expect,
  magicLinkCaptureFilePath,
  requestAndRedeemMagicLink,
  signInPath,
  t,
  test,
  uniqueTestEmail,
} from "./fixtures/test-catalogue";

/** Shared by every test below that needs a real signed-in session — mirrors `auth.spec.ts`'s seam-gate exactly. */
const MAGIC_LINK_SEAM_SKIP_REASON =
  "Set E2E_MAGIC_LINK_CAPTURE_FILE to the capture adapter's JSONL file — see e2e/README.md. " +
  "apps/api does not ship that adapter yet (only the suppress-everything NullEmailDeliveryAdapter is wired).";

/**
 * Cross-viewport v1 seller-authoring happy-path coverage: sign in as the
 * seeded `seller`-role user (magic-link capture seam, see e2e/README.md) ->
 * create a draft product -> add a version -> submit it for review -> see the
 * version reach `in_review`, in both vi/en. Also covers the two access-
 * control edges (an unauthenticated visitor never reaches the authoring
 * surface; a signed-in non-seller sees an honest "forbidden" state, never
 * the authoring UI) and asserts, at every step, that no self-publish/approve
 * control ever appears and no server-owned field or ingest secret reaches
 * the browser (see `fixtures/seller-user.ts`'s `trackSellerApiResponses`).
 * Every test needing a real signed-in session explicitly self-skips (not
 * fails) via `test.skip(!magicLinkCaptureFilePath(), ...)`, mirroring
 * `auth.spec.ts`'s own seam gate, when `E2E_MAGIC_LINK_CAPTURE_FILE` isn't
 * configured; the two unauthenticated-redirect access-control tests need no
 * session at all and always run.
 *
 * Cross-viewport, not cross-every-viewport, for the same reason
 * `commerce.spec.ts` restricts itself (`playwright.config.ts` is out of this
 * task's file scope, so there is no dedicated project to pin to the way
 * `auth.spec.ts` gets one): every scenario needing a real signed-in session
 * spends part of apps/api's per-source-IP magic-link budget
 * (auth-rate-limit.service.ts: 20 initiations / 10 redemptions per 15 min,
 * shared across every spec in the same Playwright process). This file's
 * happy path pins each locale scenario to one of the two extremes of the
 * acceptance's 320-1440px range (mobile-320 for vi, desktop-1440 for en) via
 * `testInfo.project.name`, exactly like `commerce.spec.ts` — 2
 * initiations/redemptions per full run (both scenarios reuse the same seeded
 * `SELLER_EMAIL`, well under the per-email 3/15min cap). The non-seller
 * access-control check needs one more signed-in session but isn't part of
 * the per-locale acceptance clause, so it runs once, pinned to a single
 * project, visiting both locale paths in that one session — 1 more
 * initiation/redemption. Total added by this file: 3 initiations/3
 * redemptions per full run. Combined with `auth.spec.ts` (up to 5/3) and
 * `commerce.spec.ts` (2/2), a full seam-enabled run costs at most 10
 * initiations and 8 redemptions — still comfortably under both caps. See
 * e2e/README.md's "Rate limiting" section for the up-to-date combined
 * budget.
 */

const LOCALE_PROJECTS = {
  vi: "mobile-320",
  en: "desktop-1440",
} as const;

/**
 * `publish`/`approve` (English) and their Vietnamese equivalents
 * `xuất bản`/`phê duyệt` — deliberately not the bare word `duyệt`, which is
 * also a substring of the legitimate `Seller.submitForReview.action` button
 * ("Gửi xét duyệt") and the legitimate `Seller.states.reviewState.in_review`
 * badge ("Đang xét duyệt"); matching on that substring would false-positive
 * on controls this surface is supposed to have. Scoped to `button`/`link`
 * roles only, so a status badge's own text (a non-interactive `<span>`, e.g.
 * `publicationState.published`'s "Đã xuất bản") can never trip this check
 * either — only an actual affordance would.
 */
const FORBIDDEN_ACTION_PATTERN = /publish|approve|xuất bản|phê duyệt/i;

async function assertNoPublishOrApproveAffordance(page: Page): Promise<void> {
  await expect(
    page.getByRole("button", { name: FORBIDDEN_ACTION_PATTERN }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: FORBIDDEN_ACTION_PATTERN }),
  ).toHaveCount(0);
}

for (const locale of ["vi", "en"] as const) {
  test.describe(`Seller authoring happy path — ${locale}`, () => {
    test(`${locale}: sign in -> create draft -> add version -> submit for review -> in_review`, async ({
      page,
      axeBuilder,
    }, testInfo) => {
      test.skip(!magicLinkCaptureFilePath(), MAGIC_LINK_SEAM_SKIP_REASON);
      test.skip(
        testInfo.project.name !== LOCALE_PROJECTS[locale],
        `This scenario only runs on the "${LOCALE_PROJECTS[locale]}" project — see the rate-limit note in this file's header comment.`,
      );

      const stopTrackingSellerResponses = trackSellerApiResponses(page);

      await requestAndRedeemMagicLink(page, locale, SELLER_EMAIL);
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);

      // --- Seller product list ---------------------------------------------
      await page.goto(sellerPath(locale));
      await expect(
        page.getByRole("heading", { name: t(locale, "Seller.list.heading") }),
      ).toBeVisible();
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);
      await assertNoPublishOrApproveAffordance(page);

      await page
        .getByRole("link", { name: t(locale, "Seller.list.createAction") })
        .click();
      // Soft App Router navigation — no document `load` event — so this
      // auto-retrying URL assertion polls page.url() (see commerce.spec.ts's
      // identical note) instead of racing page.waitForURL.
      await expect(page).toHaveURL(new RegExp(newSellerProductPath(locale)));

      // --- Create a draft product --------------------------------------------
      await expect(
        page.getByRole("heading", {
          name: t(locale, "Seller.newProduct.heading"),
        }),
      ).toBeVisible();
      await assertPageIsHealthy(page, axeBuilder);

      const draft = draftProductFormInput(uniqueDraftProductSlug());
      await page
        .getByRole("textbox", {
          name: t(locale, "Seller.authoringForm.fields.slug.label"),
        })
        .fill(draft.slug);
      await page
        .getByRole("textbox", {
          name: t(locale, "Seller.authoringForm.fields.thumbnailUrl.label"),
        })
        .fill(draft.thumbnailUrl);
      await page
        .getByRole("textbox", {
          name: t(locale, "Seller.authoringForm.fields.documentationUrl.label"),
        })
        .fill(draft.documentationUrl);
      await page
        .getByRole("textbox", {
          name: t(
            locale,
            "Seller.authoringForm.fields.isolatedPreviewUrl.label",
          ),
        })
        .fill(draft.isolatedPreviewUrl);
      await page
        .getByRole("button", {
          name: t(locale, "Seller.authoringForm.createSubmit"),
        })
        .click();

      await expect(page).toHaveURL(/\/seller\/products\/[0-9a-f-]{36}$/);

      // --- Product detail: the new draft ------------------------------------
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);
      await assertNoPublishOrApproveAffordance(page);
      await expect(
        page.getByText(t(locale, "Seller.states.publicationState.draft")),
      ).toBeVisible();

      // --- Add a version -----------------------------------------------------
      const version = versionFormInput();
      await page
        .getByRole("textbox", {
          name: t(locale, "Seller.versionForm.fields.version.label"),
        })
        .fill(version.version);
      await page
        .getByLabel(t(locale, "Seller.versionForm.fields.releasedAt.label"))
        .fill(version.releasedAt);
      await page
        .getByRole("textbox", {
          name: t(locale, "Seller.versionForm.fields.notesVi.label"),
        })
        .fill(version.notesVi);
      await page
        .getByRole("textbox", {
          name: t(locale, "Seller.versionForm.fields.notesEn.label"),
        })
        .fill(version.notesEn);
      await page
        .getByRole("button", { name: t(locale, "Seller.versionForm.submit") })
        .click();

      const versionItem = page
        .getByRole("listitem")
        .filter({ hasText: version.version });
      await expect(versionItem).toBeVisible();
      await expect(
        versionItem.getByText(t(locale, "Seller.states.reviewState.draft")),
      ).toBeVisible();
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);
      await assertNoPublishOrApproveAffordance(page);

      // --- Submit for review ---------------------------------------------------
      await versionItem
        .getByRole("button", {
          name: t(locale, "Seller.submitForReview.action"),
        })
        .click();

      // Success re-fetches the product; once `reviewState` moves off
      // `draft`, `SubmitForReviewAction` itself un-renders (see
      // seller-product-detail page.tsx) — the badge below is the durable
      // signal, not the transient "submitted" message.
      await expect(
        versionItem.getByText(t(locale, "Seller.states.reviewState.in_review")),
      ).toBeVisible();
      await expect(
        versionItem.getByRole("button", {
          name: t(locale, "Seller.submitForReview.action"),
        }),
      ).toHaveCount(0);
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);
      await assertNoPublishOrApproveAffordance(page);

      await stopTrackingSellerResponses();
    });
  });
}

test.describe("Seller authoring access control", () => {
  for (const locale of ["vi", "en"] as const) {
    test(`${locale}: an unauthenticated visitor is redirected to sign-in instead of the authoring surface`, async ({
      page,
      axeBuilder,
    }) => {
      await page.goto(sellerPath(locale));
      await expect(page).toHaveURL(new RegExp(signInPath(locale)));
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);
    });
  }

  test("a signed-in non-seller cannot reach the authoring surface, in either locale", async ({
    page,
    axeBuilder,
  }, testInfo) => {
    test.skip(!magicLinkCaptureFilePath(), MAGIC_LINK_SEAM_SKIP_REASON);
    // One session, both locale paths — see this file's header comment for
    // why this is pinned to a single project instead of per-locale.
    test.skip(
      testInfo.project.name !== "mobile-320",
      'This scenario only runs on the "mobile-320" project — see the rate-limit note in this file\'s header comment.',
    );

    const stopTrackingSellerResponses = trackSellerApiResponses(page);

    const email = uniqueTestEmail();
    await requestAndRedeemMagicLink(page, "vi", email);
    await assertNoLeakedSessionMaterial(page);

    for (const locale of ["vi", "en"] as const) {
      await page.goto(sellerPath(locale));
      await expect(
        page.getByRole("heading", {
          name: t(locale, "Seller.list.forbidden.heading"),
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: t(locale, "Seller.list.createAction") }),
      ).toHaveCount(0);
      await assertPageIsHealthy(page, axeBuilder);
      await assertNoLeakedSessionMaterial(page);
      await assertNoPublishOrApproveAffordance(page);
    }

    await stopTrackingSellerResponses();
  });
});
