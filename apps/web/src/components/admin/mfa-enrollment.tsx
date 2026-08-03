"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type {
  AdminMfaEnrollConfirmResponse,
  AdminMfaEnrollStartResponse,
} from "@shared/admin";
import { localeSchema } from "@shared/localization";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import {
  confirmMfaEnrollment,
  regenerateMfaRecoveryCodes,
  startMfaEnrollment,
} from "@/lib/admin-client";

import { isAdminForbiddenError } from "./admin-nav-entry";

const inputClassName =
  "h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const confirmFormSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
type ConfirmFormValues = z.infer<typeof confirmFormSchema>;

function ConfirmEnrollmentForm({
  pendingFactor,
  csrfToken,
  onConfirmed,
}: {
  pendingFactor: AdminMfaEnrollStartResponse;
  csrfToken: string;
  onConfirmed: (result: AdminMfaEnrollConfirmResponse) => void;
}) {
  const t = useTranslations("Admin.mfa.confirm");
  const codeId = useId();
  const codeErrorId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmFormValues>({
    resolver: zodResolver(confirmFormSchema),
    defaultValues: { code: "" },
  });

  const confirmMutation = useMutation({
    mutationFn: (values: ConfirmFormValues) =>
      confirmMfaEnrollment(
        { factorId: pendingFactor.factorId, code: values.code },
        csrfToken,
      ),
    onSuccess: onConfirmed,
  });

  const onSubmit: SubmitHandler<ConfirmFormValues> = (values) => {
    confirmMutation.mutate(values);
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor={codeId}>
          {t("codeLabel")}
        </label>
        <input
          aria-describedby={errors.code ? codeErrorId : undefined}
          aria-invalid={errors.code ? "true" : undefined}
          className={inputClassName}
          id={codeId}
          inputMode="numeric"
          type="text"
          {...register("code")}
        />
        {errors.code ? (
          <p className="text-sm text-destructive" id={codeErrorId} role="alert">
            {t("codeError")}
          </p>
        ) : null}
      </div>

      {confirmMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("error")}
        </p>
      ) : null}

      <Button disabled={confirmMutation.isPending} type="submit">
        {confirmMutation.isPending ? t("pending") : t("submit")}
      </Button>
    </form>
  );
}

function RecoveryCodesPanel({
  codes,
  csrfToken,
}: {
  codes: string[];
  csrfToken: string;
}) {
  const t = useTranslations("Admin.mfa.recoveryCodes");
  const [currentCodes, setCurrentCodes] = useState(codes);

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateMfaRecoveryCodes(csrfToken),
    onSuccess: (result) => setCurrentCodes(result.recoveryCodes),
  });

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border p-4">
      <h2 className="text-base font-semibold text-foreground">
        {t("heading")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("warning")}</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-foreground">
        {currentCodes.map((code) => (
          <li
            className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2"
            key={code}
          >
            {code}
          </li>
        ))}
      </ul>
      {regenerateMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("regenerateError")}
        </p>
      ) : null}
      <Button
        disabled={regenerateMutation.isPending}
        onClick={() => regenerateMutation.mutate()}
        type="button"
        variant="outline"
      >
        {regenerateMutation.isPending ? t("regenerating") : t("regenerate")}
      </Button>
    </div>
  );
}

/**
 * `/[locale]/admin/mfa`: TOTP enrollment (design §6). The one-time
 * provisioning payload (`otpauthUri`/`secret`) and the recovery codes are
 * held only in this component's own React state — never written to
 * `localStorage`/`sessionStorage`, a URL, or logged — and are shown to the
 * admin exactly once, matching what the server itself only ever returns
 * once (`adminMfaEnrollStartResponseSchema`/
 * `adminMfaEnrollConfirmResponseSchema` are response-only shapes).
 *
 * Unlike the other admin panels, this page does **not** gate on the
 * `useAdminContextStatus` probe: that probe reads an endpoint the server
 * guards with `AdminMfaEnforcementGuard`, but `enroll`/`confirm` themselves
 * are deliberately *not* MFA-enforced server-side (an admin cannot already
 * be MFA-verified before they have enrolled) — gating this page on that
 * probe would lock a first-time admin out of the only page that can get
 * them un-stuck. A non-admin who reaches this page instead sees the
 * server's real `403` reactively, surfaced on the enroll attempt itself,
 * never a fabricated success.
 */
export function MfaEnrollment() {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Admin.mfa");
  const session = useSession();
  const [pendingFactor, setPendingFactor] =
    useState<AdminMfaEnrollStartResponse | null>(null);
  const [confirmedFactor, setConfirmedFactor] =
    useState<AdminMfaEnrollConfirmResponse | null>(null);

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/${locale}/auth/sign-in`);
    }
  }, [session.status, locale, router]);

  const startMutation = useMutation({
    mutationFn: (csrfToken: string) => startMfaEnrollment(csrfToken),
    onSuccess: setPendingFactor,
  });

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

  const csrfToken = session.csrfToken;

  return (
    <section
      aria-labelledby="admin-mfa-heading"
      className="flex flex-col gap-6"
    >
      <h1
        className="text-2xl font-semibold text-foreground"
        id="admin-mfa-heading"
      >
        {t("heading")}
      </h1>

      {confirmedFactor ? (
        <RecoveryCodesPanel
          codes={confirmedFactor.recoveryCodes}
          csrfToken={csrfToken}
        />
      ) : pendingFactor ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-border p-4">
            <h2 className="text-base font-semibold text-foreground">
              {t("enroll.secretHeading")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("enroll.secretLabel")}
            </p>
            <p className="break-all font-mono text-sm text-foreground">
              {pendingFactor.secret}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("enroll.otpauthLabel")}
            </p>
            <p className="break-all font-mono text-sm text-foreground">
              {pendingFactor.otpauthUri}
            </p>
            <p className="text-sm text-destructive">{t("enroll.warning")}</p>
          </div>
          <ConfirmEnrollmentForm
            csrfToken={csrfToken}
            onConfirmed={(result) => {
              setConfirmedFactor(result);
              setPendingFactor(null);
            }}
            pendingFactor={pendingFactor}
          />
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            {t("enroll.description")}
          </p>
          <Button
            disabled={startMutation.isPending}
            onClick={() => startMutation.mutate(csrfToken)}
            type="button"
          >
            {startMutation.isPending ? t("enroll.starting") : t("enroll.start")}
          </Button>
          {startMutation.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {isAdminForbiddenError(startMutation.error)
                ? t("forbidden.description")
                : t("enroll.error")}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
