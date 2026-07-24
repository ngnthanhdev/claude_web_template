"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import type { Locale } from "@shared/localization";
import { localeSchema } from "@shared/localization";

import { SessionActions } from "./session-actions";

const SESSION_EXPIRY_INTL_LOCALES: Record<Locale, string> = {
  vi: "vi-VN",
  en: "en-US",
};

function formatSessionExpiry(expiresAt: string, locale: Locale): string {
  return new Intl.DateTimeFormat(SESSION_EXPIRY_INTL_LOCALES[locale], {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(expiresAt));
}

/**
 * The account landing's data-driven core. Reads the current session through
 * `useSession`, redirects an unauthenticated visitor to sign-in, and — once
 * authenticated — renders only the allowlisted `sessionUserSchema`/
 * `safeSessionSchema` fields read-only, plus `SessionActions`. Library,
 * orders, and profile editing are explicitly deferred and are never
 * rendered here as if they were functional.
 */
export function AccountPanel() {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Account.panel");
  const session = useSession();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/${locale}/auth/sign-in`);
    }
  }, [session.status, locale, router]);

  if (session.status === "loading" || session.status === "unauthenticated") {
    return (
      <p role="status">
        {t(session.status === "loading" ? "loading" : "redirecting")}
      </p>
    );
  }

  if (session.status === "error") {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)]"
        role="alert"
      >
        <p className="text-base font-semibold text-foreground">
          {t("error.heading")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("error.description")}
        </p>
        <Button onClick={session.refetch} type="button" variant="outline">
          {t("error.action")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section
        aria-labelledby="account-identity-heading"
        className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-border bg-background p-6"
      >
        <h2
          className="text-sm font-semibold uppercase tracking-wide text-foreground"
          id="account-identity-heading"
        >
          {t("identityHeading")}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">{t("emailLabel")}</dt>
            <dd className="text-base font-medium text-foreground">
              {session.user.email}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              {t("sessionExpiresLabel")}
            </dt>
            <dd className="text-base font-medium text-foreground">
              {formatSessionExpiry(session.session.expiresAt, locale)}
            </dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
      </section>
      <SessionActions />
    </div>
  );
}
