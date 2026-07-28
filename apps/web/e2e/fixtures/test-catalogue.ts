import { existsSync, readFileSync } from "node:fs";

import {
  test as base,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import type { CategorySlug } from "@shared/catalogue";
import type { Currency, Locale } from "@shared/localization";

import enAccount from "../../messages/en/account.json" with { type: "json" };
import enAuth from "../../messages/en/auth.json" with { type: "json" };
import enCatalogue from "../../messages/en/catalogue.json" with { type: "json" };
import enCollection from "../../messages/en/collection.json" with { type: "json" };
import enNavigation from "../../messages/en/navigation.json" with { type: "json" };
import enProduct from "../../messages/en/product.json" with { type: "json" };
import viAccount from "../../messages/vi/account.json" with { type: "json" };
import viAuth from "../../messages/vi/auth.json" with { type: "json" };
import viCatalogue from "../../messages/vi/catalogue.json" with { type: "json" };
import viCollection from "../../messages/vi/collection.json" with { type: "json" };
import viNavigation from "../../messages/vi/navigation.json" with { type: "json" };
import viProduct from "../../messages/vi/product.json" with { type: "json" };

/**
 * `e2e/fixtures/test-catalogue.ts` — the one shared module `T-b8d260`'s file
 * scope allows, so it carries three things `browse.spec.ts` and
 * `auth.spec.ts` both need: (1) the seeded-data contract those specs drive
 * against, (2) the capture-only magic-link email seam reader, and (3) small
 * Playwright fixtures/helpers (axe, overflow, storage-leak, keyboard,
 * navigation) kept out of each spec to avoid duplicating them twice.
 */

// -----------------------------------------------------------------------------
// Seeded disposable catalogue contract
//
// The real Playwright run (a real-terminal step — see e2e/README.md) needs a
// disposable Postgres database migrated and seeded with data matching this
// contract before the suite runs. Nothing in this file creates that data:
// `apps/api` has no public write endpoint for products/categories (the
// catalogue is read-only per the approved spec), so seeding is a
// `prisma`-level step owned by whoever stands up the environment.
// -----------------------------------------------------------------------------

/** A real `categorySlugSchema` value (packages/shared/src/catalogue.ts). */
export const SEEDED_CATEGORY: CategorySlug = "wordpress";

/**
 * At least this many *published* products must exist under
 * `SEEDED_CATEGORY`, each with both licence tiers and both currencies priced
 * (required by `licenceOptionsSchema`/`licenceOptionSchema` regardless), and
 * `updatedAt` within the last year — true of any freshly-seeded row. Kept
 * small on purpose: the pagination check below forces a small `limit` via a
 * direct URL rather than requiring the API's default page size (24) worth of
 * fixture rows.
 */
export const MIN_SEEDED_PRODUCTS_IN_CATEGORY = 3;

/** The explicit `limit` the pagination step uses so `MIN_SEEDED_PRODUCTS_IN_CATEGORY` is enough to produce a second page. */
export const PAGINATION_PAGE_SIZE = 2;

// -----------------------------------------------------------------------------
// Localized copy lookup
//
// Mirrors the deep-merge `src/i18n/request.ts` performs at runtime (each
// namespace file owns a distinct top-level key, so a shallow per-locale merge
// is enough here) by importing the real message catalogues directly, so spec
// assertions can never drift from the shipped copy in either locale.
// -----------------------------------------------------------------------------

type LocaleMessages = Record<string, unknown>;

const MESSAGES: Record<Locale, LocaleMessages> = {
  en: {
    ...enNavigation,
    ...enCatalogue,
    ...enCollection,
    ...enProduct,
    ...enAuth,
    ...enAccount,
  },
  vi: {
    ...viNavigation,
    ...viCatalogue,
    ...viCollection,
    ...viProduct,
    ...viAuth,
    ...viAccount,
  },
};

function getMessage(locale: Locale, path: string): string {
  const segments = path.split(".");
  let current: unknown = MESSAGES[locale];

  for (const segment of segments) {
    if (typeof current !== "object" || current === null) {
      throw new Error(`Missing i18n key "${path}" for locale "${locale}"`);
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current !== "string") {
    throw new Error(
      `i18n key "${path}" for locale "${locale}" is not a string`,
    );
  }
  return current;
}

/** Replaces `{name}` tokens the same way next-intl's simple (non-ICU-plural) messages use them. */
export function interpolate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(
    /\{(\w+)\}/g,
    (match: string, key: string): string => {
      const value = values[key];
      return value === undefined ? match : String(value);
    },
  );
}

/** Looks up a dot-path message key (e.g. `"Shell.browse"`) from the real `messages/<locale>/*.json` catalogues. */
export function t(
  locale: Locale,
  path: string,
  values?: Readonly<Record<string, string | number>>,
): string {
  const template = getMessage(locale, path);
  return values ? interpolate(template, values) : template;
}

// -----------------------------------------------------------------------------
// Route paths
// -----------------------------------------------------------------------------

export function homePath(locale: Locale): string {
  return `/${locale}`;
}

export function searchPath(locale: Locale): string {
  return `/${locale}/search`;
}

export function signInPath(locale: Locale): string {
  return `/${locale}/auth/sign-in`;
}

export function magicLinkPath(locale: Locale): string {
  return `/${locale}/auth/magic-link`;
}

export function accountPath(locale: Locale): string {
  return `/${locale}/account`;
}

/** Adds/overwrites one query parameter on an absolute URL without disturbing the rest (used to force a small pager `limit`). */
export function withQueryParam(
  url: string,
  key: string,
  value: string,
): string {
  const target = new URL(url);
  target.searchParams.set(key, value);
  return target.toString();
}

/** The trailing path segment of an href, e.g. `/vi/templates/lotus-commerce` -> `lotus-commerce`. */
export function lastPathSegment(href: string): string {
  const withoutQueryOrFragment = href.split(/[?#]/)[0] ?? href;
  const segments = withoutQueryOrFragment
    .split("/")
    .filter((segment) => segment.length > 0);
  return segments.at(-1) ?? href;
}

/** Derives a >=2 character search token from a product slug (slugs are conventionally title-derived, e.g. `lotus-commerce` -> `lotus`). */
export function deriveSearchTermFromSlug(slug: string): string {
  const [firstWord] = slug.split("-");
  return firstWord && firstWord.length >= 2 ? firstWord : slug;
}

let uniqueEmailCounter = 0;

/** A fresh, never-reused, non-deliverable test address (`example.com` is reserved for documentation/testing per RFC 2606). */
export function uniqueTestEmail(prefix = "e2e"): string {
  uniqueEmailCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueEmailCounter}@example.com`;
}

// -----------------------------------------------------------------------------
// Capture-only magic-link email seam
//
// apps/api has no public write endpoint and, today, only a suppress-everything
// `NullEmailDeliveryAdapter` (apps/api/src/auth/magic-links/) — there is no
// cross-process way yet to learn a real magic-link URL from outside the API's
// own process. Wiring a real capture adapter is an apps/api change and is out
// of this task's file scope (apps/web only); this reader documents and
// consumes the contract such an adapter would need to satisfy so the suite is
// ready the moment it lands. See e2e/README.md.
// -----------------------------------------------------------------------------

const MAGIC_LINK_CAPTURE_FILE_ENV = "E2E_MAGIC_LINK_CAPTURE_FILE";

/** Mirrors apps/api's `MagicLinkDelivery` (email-delivery.port.ts) plus nothing else — the capture adapter should append exactly this shape as one JSON object per line. */
export interface CapturedMagicLink {
  readonly email: string;
  readonly locale: string;
  readonly link: string;
}

/** `undefined` when the capture-only seam isn't configured for this run — callers use this to skip seam-dependent tests instead of failing them. */
export function magicLinkCaptureFilePath(): string | undefined {
  return process.env[MAGIC_LINK_CAPTURE_FILE_ENV];
}

function isCapturedMagicLink(value: unknown): value is CapturedMagicLink {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.email === "string" &&
    typeof record.locale === "string" &&
    typeof record.link === "string"
  );
}

function parseCapturedLine(line: string): CapturedMagicLink | null {
  if (line.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(line);
    return isCapturedMagicLink(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Polls the capture file (append-only JSONL) for the most recent delivery to
 * `email`. Returns `null` on timeout rather than throwing — callers decide
 * whether a miss is a hard failure or (when the seam isn't configured at all)
 * a skip.
 */
export async function waitForCapturedMagicLink(
  email: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<CapturedMagicLink | null> {
  const { timeoutMs = 10_000, pollIntervalMs = 250 } = options;
  const filePath = magicLinkCaptureFilePath();
  if (!filePath) return null;

  const normalizedEmail = email.trim().toLowerCase();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (existsSync(filePath)) {
      const matches = readFileSync(filePath, "utf8")
        .split("\n")
        .map(parseCapturedLine)
        .filter((entry): entry is CapturedMagicLink => entry !== null)
        .filter(
          (entry) => entry.email.trim().toLowerCase() === normalizedEmail,
        );
      const latest = matches.at(-1);
      if (latest) return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return null;
}

/** A syntactically-valid (`base64Url256BitTokenSchema`-shaped) but never-issued token, for exercising the "invalid or expired" redemption state without the capture seam. */
export const FAKE_MAGIC_LINK_TOKEN = "A".repeat(43);

/** Mirrors apps/api/src/auth/core/auth-cookie.ts's `SESSION_COOKIE_NAME` (not importable across apps). */
export const SESSION_COOKIE_NAME = "__Host-kitvera_session";

/** Submits the sign-in form, waits for the captured link, redeems it, and waits for the account redirect. Throws if the seam is configured but nothing arrives — callers gate the whole describe block on `magicLinkCaptureFilePath()` first. */
export async function requestAndRedeemMagicLink(
  page: Page,
  locale: Locale,
  email: string,
): Promise<CapturedMagicLink> {
  await page.goto(signInPath(locale));
  await page
    .getByRole("textbox", { name: t(locale, "Auth.signIn.emailLabel") })
    .fill(email);
  await page
    .getByRole("button", { name: t(locale, "Auth.signIn.submit") })
    .click();
  await expect(
    page.getByText(t(locale, "Auth.signIn.sentTitle")),
  ).toBeVisible();

  const captured = await waitForCapturedMagicLink(email);
  if (!captured) {
    throw new Error(
      `No magic link was captured for "${email}" within the timeout — is the capture-only email seam ` +
        `(${MAGIC_LINK_CAPTURE_FILE_ENV}) actually wired to apps/api's EMAIL_DELIVERY_PORT? See e2e/README.md.`,
    );
  }

  await page.goto(captured.link);
  await page.waitForURL((url) => url.pathname.startsWith(accountPath(locale)));
  return captured;
}

// -----------------------------------------------------------------------------
// Page-health assertions
// -----------------------------------------------------------------------------

/** Tailwind's default `sm` breakpoint (unmodified by this project — see src/app/globals.css), where MegaMenu takes over from MobileDrawer (src/components/app-shell.tsx). */
export const SM_BREAKPOINT_PX = 640;

const WCAG22AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface AxeViolationSummary {
  readonly id: string;
  readonly help: string;
}

function describeAxeViolations(
  violations: readonly AxeViolationSummary[],
): string {
  return violations
    .map((violation) => `${violation.id}: ${violation.help}`)
    .join("\n");
}

/** No page-level horizontal scroll at the project's configured viewport (a 1px tolerance for rounding). */
export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    scrollWidth,
    "page-level horizontal overflow detected",
  ).toBeLessThanOrEqual(clientWidth + 1);
}

const CLIENT_STORAGE_ALLOWLIST = new Set<string>(["kitvera.currency"]);
const SENSITIVE_MATERIAL_PATTERN = /token|csrf|session/i;

/**
 * The session/CSRF the app holds (see src/hooks/use-session.ts) lives only in
 * an in-memory TanStack Query cache — never `localStorage`, `sessionStorage`,
 * a URL, or (being `__Host-`/`httpOnly`) `document.cookie`. This asserts that
 * invariant holds at the point it's called; the only allowed client-storage
 * entry is the non-sensitive `VND`/`USD` currency preference.
 */
export async function assertNoLeakedSessionMaterial(page: Page): Promise<void> {
  expect(page.url()).not.toMatch(SENSITIVE_MATERIAL_PATTERN);

  const snapshot = await page.evaluate(() => ({
    cookie: document.cookie,
    localStorage: Object.entries(window.localStorage),
    sessionStorage: Object.entries(window.sessionStorage),
  }));

  expect(snapshot.cookie).not.toMatch(SENSITIVE_MATERIAL_PATTERN);

  for (const [key, value] of snapshot.localStorage) {
    if (CLIENT_STORAGE_ALLOWLIST.has(key)) continue;
    expect(
      `${key}=${value}`,
      `unexpected localStorage entry "${key}"`,
    ).not.toMatch(SENSITIVE_MATERIAL_PATTERN);
  }
  for (const [key, value] of snapshot.sessionStorage) {
    expect(
      `${key}=${value}`,
      `unexpected sessionStorage entry "${key}"`,
    ).not.toMatch(SENSITIVE_MATERIAL_PATTERN);
  }
}

// -----------------------------------------------------------------------------
// Navigation helpers (viewport-aware: MegaMenu >= SM_BREAKPOINT_PX, MobileDrawer below)
// -----------------------------------------------------------------------------

/** Opens the mega-menu (desktop) or drawer (mobile), and returns the seeded category's link scoped to whichever nav panel is now open. */
export async function openCategoryFromNav(
  page: Page,
  locale: Locale,
  category: CategorySlug,
): Promise<Locator> {
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const categorySelector = `a[href*="/categories/${category}"]`;

  if (viewportWidth < SM_BREAKPOINT_PX) {
    await page.getByRole("button", { name: t(locale, "Shell.menu") }).click();
    const drawer = page.getByRole("region", {
      name: t(locale, "Shell.mobileNavigation"),
    });
    await drawer
      .getByRole("button", { name: t(locale, "Shell.categoriesSection") })
      .click();
    return drawer.locator(categorySelector).first();
  }

  await page.getByRole("button", { name: t(locale, "Shell.browse") }).click();
  const panel = page.getByRole("region", {
    name: t(locale, "Shell.categoriesPanel"),
  });
  return panel.locator(categorySelector).first();
}

/** Picks a display currency through the real toggle control, opening/closing the drawer on mobile viewports where it isn't otherwise reachable. */
export async function switchCurrency(
  page: Page,
  locale: Locale,
  currency: Currency,
): Promise<void> {
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const groupName = t(locale, "Shell.currencyToggleLabel");

  if (viewportWidth < SM_BREAKPOINT_PX) {
    await page.getByRole("button", { name: t(locale, "Shell.menu") }).click();
    const drawer = page.getByRole("region", {
      name: t(locale, "Shell.mobileNavigation"),
    });
    await drawer
      .getByRole("group", { name: groupName })
      .getByRole("button", { name: currency })
      .click();
    await drawer
      .getByRole("button", { name: t(locale, "Shell.closeMenu") })
      .click();
    return;
  }

  await page
    .getByRole("group", { name: groupName })
    .getByRole("button", { name: currency })
    .click();
}

/** Tabs forward (up to `maxPresses` times) until `target` is the focused element, then asserts it — proving real keyboard reachability rather than just DOM presence. */
export async function pressTabUntilFocused(
  page: Page,
  target: Locator,
  maxPresses = 40,
): Promise<void> {
  for (let attempt = 0; attempt < maxPresses; attempt += 1) {
    const isFocused = await target
      .evaluate((element) => element === document.activeElement)
      .catch(() => false);
    if (isFocused) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

// -----------------------------------------------------------------------------
// Playwright fixtures
// -----------------------------------------------------------------------------

interface KitveraFixtures {
  /** A ready-to-use `AxeBuilder` factory scoped to WCAG 2.2 AA and excluding the product-detail preview `<iframe>` (untrusted, cross-origin third-party content the storefront doesn't own). */
  axeBuilder: () => AxeBuilder;
}

export const test = base.extend<KitveraFixtures>({
  // Playwright's fixture-provider callback takes a second positional
  // parameter conventionally named `use`; renamed to `provideAxeBuilder`
  // here purely so `eslint-plugin-react-hooks`'s `use`-prefix heuristic
  // doesn't mistake this Node-side test fixture for a React hook call.
  axeBuilder: async ({ page }, provideAxeBuilder) => {
    await provideAxeBuilder(() =>
      new AxeBuilder({ page }).withTags(WCAG22AA_TAGS).exclude("iframe"),
    );
  },
});

export { expect };

/** No horizontal overflow + a clean WCAG 2.2 AA axe scan — the two checks every visited page needs. */
export async function assertPageIsHealthy(
  page: Page,
  axeBuilder: () => AxeBuilder,
): Promise<void> {
  // Client-rendered routes (e.g. /search) receive their <title> from the
  // layout metadata only once the App Router soft navigation settles; axe's
  // document-title rule fails if it scans that transient title-less frame.
  // Wait for a non-empty title first — a genuinely title-less page still fails
  // (the matcher times out), this only stops racing the metadata commit.
  await expect(page).toHaveTitle(/.+/);
  await assertNoHorizontalOverflow(page);
  const { violations } = await axeBuilder().analyze();
  expect(violations, describeAxeViolations(violations)).toEqual([]);
}
