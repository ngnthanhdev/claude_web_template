"use client";

import { localeSchema } from "@shared/localization";
import { motion, useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

import { CheckoutForm } from "./checkout-form";
import { OrderSummary, type CheckoutSummaryItem } from "./order-summary";

export type { CheckoutSummaryItem } from "./order-summary";

const DIALOG_TRANSITION_SECONDS = 0.2;

export interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The shopper's current selection to buy, with display-only title/price
   * for the order summary. Callers (e.g. the cart page) already hold this
   * data from the catalogue — this component never fetches it itself.
   */
  items: CheckoutSummaryItem[];
}

/**
 * The Wave-1 checkout surface (design §6): a centered dialog at `sm:` and
 * above, a full-screen sheet below it. Composes the display-only
 * `OrderSummary` with `CheckoutForm`, and — once the form reports a
 * settled order — closes itself and routes to `/[locale]/checkout/result`.
 */
export function CheckoutDialog({
  open,
  onOpenChange,
  items,
}: CheckoutDialogProps) {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Checkout.dialog");
  const session = useSession();
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onOpenChange]);

  // Minimal focus management (a full focus trap is out of scope): move focus
  // into the panel as soon as it opens, and return it to whatever element
  // had focus beforehand once the dialog closes — mirrors the escape-key
  // effect's open-gated lifecycle above.
  useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panelRef.current?.focus();

    return () => {
      previouslyFocusedElementRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  function handleOrderCreated(orderId: string) {
    onOpenChange(false);
    router.push(`/${locale}/checkout/result?orderId=${orderId}`);
  }

  return (
    <>
      {/* `z-[210]`/`z-[211]` sit just above `--z-sticky` (200, the site
          header's own z-index — see `globals.css`), so the checkout surface
          dims and sits above the header instead of underneath it. */}
      <motion.button
        animate={{ opacity: 1 }}
        aria-label={t("close")}
        className="fixed inset-0 z-[210] bg-[var(--color-scrim)] backdrop-blur-sm"
        initial={reduceMotion ? false : { opacity: 0 }}
        onClick={() => onOpenChange(false)}
        transition={{ duration: DIALOG_TRANSITION_SECONDS }}
        type="button"
      />
      <motion.section
        animate={{ opacity: 1 }}
        aria-labelledby={titleId}
        aria-modal="true"
        className="fixed inset-0 z-[211] flex flex-col gap-6 overflow-y-auto bg-background p-6 outline-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[85dvh] sm:w-[min(30rem,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-panel)] sm:border sm:border-border sm:shadow-lg"
        initial={reduceMotion ? false : { opacity: 0 }}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
        transition={{ duration: DIALOG_TRANSITION_SECONDS, ease: "easeOut" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground" id={titleId}>
              {t("title")}
            </h2>
            <p className="inline-flex w-fit items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("sandboxLabel")}
            </p>
          </div>
          <Button
            aria-label={t("close")}
            onClick={() => onOpenChange(false)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>

        <OrderSummary items={items} />

        {session.status === "authenticated" ? (
          <CheckoutForm
            csrfToken={session.csrfToken}
            items={items}
            onOrderCreated={handleOrderCreated}
          />
        ) : session.status === "loading" ? (
          <p role="status">{t("sessionLoading")}</p>
        ) : (
          <p role="alert">{t("signInRequired")}</p>
        )}
      </motion.section>
    </>
  );
}
