"use client";

import { localeSchema } from "@shared/localization";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

/**
 * `/[locale]/admin` — the dense operate/review/publish hub (design §2/§4):
 * links into the review queue, publish/delist panel, user/role directory,
 * and MFA enrollment. This page carries no data of its own and no gate
 * beyond "signed in" — deliberately, so `/admin/mfa` stays reachable for a
 * first-time admin who has not yet enrolled (the server's own
 * `AdminMfaEnforcementGuard` only applies to the *other* admin endpoints,
 * never to MFA enrollment itself; gating this hub on that same signal would
 * lock a first-time admin out of the one page that unlocks it). Each linked
 * page enforces its own real `admin` guard server-side and shows the
 * honest `403` state if a non-admin follows a link here — this hub never
 * fabricates admin data itself.
 */
export default function AdminHubPage() {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Admin.hub");
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
    <section
      aria-labelledby="admin-hub-heading"
      className="flex flex-col gap-6"
    >
      <h1
        className="text-2xl font-semibold text-foreground"
        id="admin-hub-heading"
      >
        {t("heading")}
      </h1>
      <nav aria-label={t("heading")} className="flex flex-wrap gap-3">
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={`/${locale}/admin/review`}
        >
          {t("links.review")}
        </Link>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={`/${locale}/admin/publish`}
        >
          {t("links.publish")}
        </Link>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={`/${locale}/admin/users`}
        >
          {t("links.users")}
        </Link>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={`/${locale}/admin/mfa`}
        >
          {t("links.mfa")}
        </Link>
      </nav>
    </section>
  );
}
