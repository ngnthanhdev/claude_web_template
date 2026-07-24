"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  /** `"empty"` for an honest no-results state; `"error"` for a failed fetch. */
  variant: "empty" | "error";
  /** Resets filters (`"empty"`) or retries the fetch (`"error"`). */
  onAction: () => void;
}

/**
 * The catalogue kit's shared empty/error surface. Never invents inventory,
 * bestseller, or rating content — just an honest heading, description, and
 * a single recovery action, all sourced from `messages/<locale>/collection.json`.
 */
export function EmptyState({ variant, onAction }: EmptyStateProps) {
  const t = useTranslations("Collection");

  return (
    <div
      className="flex flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)] text-center"
      role={variant === "error" ? "alert" : "status"}
    >
      <p className="text-base font-semibold text-foreground">
        {t(`${variant}.heading`)}
      </p>
      <p className="text-sm text-muted-foreground">
        {t(`${variant}.description`)}
      </p>
      <Button onClick={onAction} type="button" variant="outline">
        {t(`${variant}.action`)}
      </Button>
    </div>
  );
}
