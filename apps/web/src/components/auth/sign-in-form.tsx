"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  magicLinkInitiationRequestSchema,
  kitveraReturnToSchema,
} from "@shared/auth";
import { localeSchema, type Locale } from "@shared/localization";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  initiateMagicLink,
  type InitiateMagicLinkInput,
} from "@/lib/auth-client";

export interface SignInFormProps {
  /**
   * Raw, untrusted `returnTo` value read from the sign-in URL's query string
   * (e.g. a shopper who was bounced here from a gated page). Only forwarded
   * when it re-validates against `kitveraReturnToSchema` for the active
   * locale; an attacker-crafted value (absolute, protocol-relative, or for
   * another locale) is silently dropped in favor of the shared schema's own
   * default rather than surfaced as a field error — the visitor never typed
   * it, so there is nothing for them to correct.
   */
  initialReturnTo?: string;
}

type SignInOutcome = "idle" | "sent" | "error";

function sanitizeReturnTo(
  raw: string | undefined,
  locale: Locale,
): string | undefined {
  if (!raw) return undefined;

  const parsed = kitveraReturnToSchema.safeParse(raw);
  if (!parsed.success) return undefined;

  const [, returnToLocale] = parsed.data.split("/");
  return returnToLocale === locale ? parsed.data : undefined;
}

/**
 * Requests a passwordless sign-in link. However the initiation actually
 * resolves server-side (accepted / rate-limited / suppressed), the API
 * always answers `{status:"accepted"}`, so this form only ever has one
 * client-observable success path — it cannot and must not branch on account
 * state.
 */
export function SignInForm({ initialReturnTo }: SignInFormProps) {
  const locale = localeSchema.parse(useLocale());
  const t = useTranslations("Auth.signIn");
  const [outcome, setOutcome] = useState<SignInOutcome>("idle");
  const emailId = useId();
  const emailErrorId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InitiateMagicLinkInput>({
    resolver: zodResolver(magicLinkInitiationRequestSchema),
    defaultValues: {
      email: "",
      locale,
      returnTo: sanitizeReturnTo(initialReturnTo, locale),
    },
  });

  const onSubmit: SubmitHandler<InitiateMagicLinkInput> = async (data) => {
    try {
      await initiateMagicLink(data);
    } catch {
      setOutcome("error");
      return;
    }
    setOutcome("sent");
  };

  if (outcome === "sent") {
    return (
      <div
        className="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-border bg-muted p-6"
        role="status"
      >
        <p className="text-base font-semibold text-foreground">
          {t("sentTitle")}
        </p>
        <p className="text-sm text-muted-foreground">{t("sentDescription")}</p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
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

      {outcome === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {t("errorDescription")}
        </p>
      ) : null}

      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
