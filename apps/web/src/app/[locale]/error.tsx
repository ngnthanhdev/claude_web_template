"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

interface LocaleErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * The `/[locale]` segment's error boundary. Catches any error thrown while
 * rendering a localized route (Server or Client Component) that isn't
 * routed through the dedicated `not-found.tsx` 404 flow — most notably a
 * non-404 catalogue API failure (500/unreachable/schema mismatch) surfaced
 * by `catalogue-server.ts` — and renders a localized, retryable failure
 * state instead of unwinding to Next's default (unstyled, English-only)
 * error page. `reset()` re-renders the segment, retrying the failed render
 * in place.
 */
export default function LocaleError({ error, reset }: LocaleErrorProps) {
  const t = useTranslations("Error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className="flex w-full flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)] text-center"
      role="alert"
    >
      <h1 className="text-lg font-semibold text-foreground">{t("heading")}</h1>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <Button onClick={reset} type="button" variant="outline">
        {t("retry")}
      </Button>
    </div>
  );
}
