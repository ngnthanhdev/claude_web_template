"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { checkoutRequestSchema } from "@shared/commerce";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { createCheckout, settlePaymentAttempt } from "@/lib/commerce-client";
import { cn } from "@/lib/utils";

import type { CheckoutSummaryItem } from "./order-summary";

const checkoutRegionSchema = z.enum(["global", "vietnam"]);
type CheckoutRegion = z.infer<typeof checkoutRegionSchema>;

const checkoutFormSchema = z.object({
  region: checkoutRegionSchema,
  email: z.string().trim().email(),
  name: z.string().trim().min(1),
});
type CheckoutFormValues = z.infer<typeof checkoutFormSchema>;

const REGION_OPTIONS: readonly CheckoutRegion[] = ["global", "vietnam"];
const REGION_LABEL_KEYS: Record<
  CheckoutRegion,
  "regionGlobal" | "regionVietnam"
> = {
  global: "regionGlobal",
  vietnam: "regionVietnam",
};

type SubmitFailure = "checkout" | "settle";

export interface CheckoutFormProps {
  /**
   * The shopper's current selection. Only `productId`/`licence` from each
   * entry ever reach the network — this component builds the outgoing
   * request from that alone (plus a fresh idempotency key), so no display
   * field (title, price) can leak into the request even by accident.
   */
  items: CheckoutSummaryItem[];
  csrfToken: string;
  onOrderCreated: (orderId: string) => void;
}

/**
 * The Global/Vietnam + email + name + continue information hierarchy
 * (design §4/§6). Region, email, and name are **UI-only in Wave 1** — none
 * of them are sent to the server; `checkoutRequestSchema` carries only
 * `items` and `idempotencyKey`. On submit this creates the order, then
 * immediately triggers the sandbox settle for the resulting payment
 * attempt, then reports the settled order id back to the caller.
 */
export function CheckoutForm({
  items,
  csrfToken,
  onOrderCreated,
}: CheckoutFormProps) {
  const t = useTranslations("Checkout.form");
  const [submitFailure, setSubmitFailure] = useState<SubmitFailure | null>(
    null,
  );
  // Generated once per mount (i.e. once per checkout attempt) rather than
  // per submit, so a shopper retrying after a transient failure replays the
  // same idempotency key — the server's unique constraint then returns the
  // original order instead of creating a duplicate one.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const regionLegendId = useId();
  const emailId = useId();
  const emailErrorId = useId();
  const nameId = useId();
  const nameErrorId = useId();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: { region: "global", email: "", name: "" },
  });

  const selectedRegion = watch("region");
  const hasItems = items.length > 0;

  const onSubmit: SubmitHandler<CheckoutFormValues> = async () => {
    setSubmitFailure(null);

    const checkoutRequest = checkoutRequestSchema.parse({
      items: items.map(({ productId, licence }) => ({ productId, licence })),
      idempotencyKey: idempotencyKeyRef.current,
    });

    let paymentAttemptId: string;
    let orderId: string;
    try {
      const checkoutResponse = await createCheckout(checkoutRequest, csrfToken);
      paymentAttemptId = checkoutResponse.paymentAttemptId;
      orderId = checkoutResponse.orderId;
    } catch {
      setSubmitFailure("checkout");
      return;
    }

    try {
      await settlePaymentAttempt(paymentAttemptId, csrfToken);
    } catch {
      setSubmitFailure("settle");
      return;
    }

    onOrderCreated(orderId);
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <fieldset
        aria-labelledby={regionLegendId}
        className="flex flex-col gap-2"
      >
        <legend
          className="text-sm font-medium text-foreground"
          id={regionLegendId}
        >
          {t("regionLegend")}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {REGION_OPTIONS.map((option) => (
            <label
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-medium transition-colors duration-200 ease-out",
                selectedRegion === option
                  ? "border-primary bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:border-primary",
              )}
              key={option}
            >
              <input
                className="size-5"
                type="radio"
                value={option}
                {...register("region")}
              />
              {t(REGION_LABEL_KEYS[option])}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={emailId}
        >
          {t("emailLabel")}
        </label>
        <input
          aria-describedby={errors.email ? emailErrorId : undefined}
          aria-invalid={errors.email ? "true" : undefined}
          autoComplete="email"
          className="h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          id={emailId}
          type="email"
          {...register("email")}
        />
        {errors.email ? (
          <p
            className="text-sm text-destructive"
            id={emailErrorId}
            role="alert"
          >
            {t("emailInvalid")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor={nameId}>
          {t("nameLabel")}
        </label>
        <input
          aria-describedby={errors.name ? nameErrorId : undefined}
          aria-invalid={errors.name ? "true" : undefined}
          autoComplete="name"
          className="h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          id={nameId}
          type="text"
          {...register("name")}
        />
        {errors.name ? (
          <p className="text-sm text-destructive" id={nameErrorId} role="alert">
            {t("nameRequired")}
          </p>
        ) : null}
      </div>

      {submitFailure ? (
        <p className="text-sm text-destructive" role="alert">
          {t(submitFailure === "checkout" ? "checkoutError" : "settleError")}
        </p>
      ) : null}

      <Button disabled={isSubmitting || !hasItems} type="submit">
        {isSubmitting ? t("submitting") : t("continue")}
      </Button>
    </form>
  );
}
