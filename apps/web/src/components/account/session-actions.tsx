"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

type RevocationScope = "current" | "all";

/**
 * The account landing's sign-out controls: revoke only this device's
 * session, or every session the account owns. Both send the session-bound
 * CSRF token `useSession` already holds as the `X-CSRF-Token` header — this
 * component never reads, stores, or renders that token itself. On success
 * the shared session query is invalidated; once the re-checked session
 * comes back unauthenticated, `AccountPanel`'s redirect effect sends the
 * visitor to a public route.
 */
export function SessionActions() {
  const t = useTranslations("Account.actions");
  const session = useSession();
  const [pendingScope, setPendingScope] = useState<RevocationScope | null>(
    null,
  );

  if (session.status !== "authenticated") return null;

  const isBusy = session.isSigningOutCurrent || session.isSigningOutAll;

  function handleSignOut(scope: RevocationScope) {
    setPendingScope(scope);
    if (scope === "current") session.signOut();
    else session.signOutAll();
  }

  return (
    <section
      aria-labelledby="account-sessions-heading"
      className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-border bg-background p-6"
    >
      <div>
        <h2
          className="text-sm font-semibold uppercase tracking-wide text-foreground"
          id="account-sessions-heading"
        >
          {t("heading")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {session.signOutError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("error")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={isBusy}
          onClick={() => handleSignOut("current")}
          type="button"
        >
          {pendingScope === "current" && session.isSigningOutCurrent
            ? t("signOutPending")
            : t("signOut")}
        </Button>
        <Button
          disabled={isBusy}
          onClick={() => handleSignOut("all")}
          type="button"
          variant="outline"
        >
          {pendingScope === "all" && session.isSigningOutAll
            ? t("signOutAllPending")
            : t("signOutAll")}
        </Button>
      </div>
    </section>
  );
}
