"use client";

import {
  kitveraReturnToSchema,
  magicLinkRedemptionRequestSchema,
} from "@shared/auth";
import { localeSchema } from "@shared/localization";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";
import { redeemMagicLink } from "@/lib/auth-client";

type RedemptionState =
  | { readonly status: "verifying" }
  | { readonly status: "success"; readonly csrfToken: string }
  | { readonly status: "invalidOrExpired" }
  | { readonly status: "error" };

/**
 * Reads the `#token=` fragment exactly once and immediately clears it from
 * the URL bar/history. Fragments are never included in an HTTP request
 * target by the browser, so the raw token never reaches a request log,
 * analytics call, or referrer by construction; replacing the URL here
 * additionally keeps it out of browser history and any later copy/share of
 * this page's address.
 */
function readAndClearTokenFragment(): string | null {
  const { hash } = window.location;
  if (hash) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }
  if (hash.length <= 1) return null;

  const token = new URLSearchParams(hash.slice(1)).get("token");
  return token && token.length > 0 ? token : null;
}

/**
 * Re-validates the redemption response's `returnTo` against the KITVERA
 * allowlist for the active locale before ever navigating there. The shared
 * auth client already validates the full response with the same schema, so
 * this is defense in depth — this component never trusts a `returnTo` it
 * has not independently checked itself.
 */
function resolveSafeReturnTo(candidate: string, locale: string): string {
  const parsed = kitveraReturnToSchema.safeParse(candidate);
  if (!parsed.success) return `/${locale}/account`;

  const [, returnToLocale] = parsed.data.split("/");
  return returnToLocale === locale ? parsed.data : `/${locale}/account`;
}

/**
 * Client-only redemption flow for `/[locale]/auth/magic-link#token=...`.
 * Owns the page's single heading since its text depends on the in-flight
 * state (verifying / success / invalid-or-expired / error).
 */
export function RedemptionStatus() {
  const locale = localeSchema.parse(useLocale());
  const t = useTranslations("Auth.magicLink");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<RedemptionState>({
    status: "verifying",
  });

  // The token is single-use and the fragment is cleared on first read, so
  // redemption must run exactly once per mount — even under React StrictMode's
  // dev double-invocation of effects. A `cancelled`-flag cleanup can't achieve
  // that here: StrictMode's teardown would cancel the real (first) redeem and
  // the second pass would read the already-cleared fragment and render a false
  // "invalid/expired" over a session the server actually established. A ref
  // latch guarantees a single redemption instead.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      const token = readAndClearTokenFragment();
      if (
        !token ||
        !magicLinkRedemptionRequestSchema.safeParse({ token }).success
      ) {
        setState({ status: "invalidOrExpired" });
        return;
      }

      try {
        const response = await redeemMagicLink({ token });

        // Held only in component state (never `localStorage`/
        // `sessionStorage`/a URL) for the brief remainder of this
        // navigation. Later mutating calls (e.g. sign-out) re-derive their
        // own CSRF value from `GET /v1/sessions/current` instead of relying
        // on this one surviving the redirect below.
        setState({ status: "success", csrfToken: response.csrfToken });
        // Drop any account-surface cache (orders, library, an order's own
        // detail) left over from a previous session on this tab, before
        // navigating anywhere the newly-signed-in visitor might read it —
        // a shared device must never let this sign-in see the last
        // visitor's cached data.
        queryClient.removeQueries({ queryKey: ["account"] });
        queryClient.removeQueries({ queryKey: ["orders"] });
        router.replace(resolveSafeReturnTo(response.returnTo, locale));
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.status === 401 &&
          error.code === "MAGIC_LINK_INVALID_OR_EXPIRED"
        ) {
          setState({ status: "invalidOrExpired" });
          return;
        }
        setState({ status: "error" });
      }
    }

    void run();
  }, [locale, queryClient, router]);

  if (state.status === "verifying") {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-border bg-muted p-6 text-center"
        role="status"
      >
        <h1>{t("verifyingTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("verifyingDescription")}
        </p>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-border bg-muted p-6 text-center"
        role="status"
      >
        <h1>{t("successTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("successDescription")}
        </p>
      </div>
    );
  }

  const isExpired = state.status === "invalidOrExpired";

  return (
    <div
      className="flex flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-6 text-center"
      role="alert"
    >
      <h1>{isExpired ? t("invalidOrExpiredTitle") : t("errorTitle")}</h1>
      <p className="text-sm text-muted-foreground">
        {isExpired ? t("invalidOrExpiredDescription") : t("errorDescription")}
      </p>
      <Link
        className={buttonVariants({ variant: "outline" })}
        href={`/${locale}/auth/sign-in`}
      >
        {t("backToSignInCta")}
      </Link>
    </div>
  );
}
