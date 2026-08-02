"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { semanticVersionSchema } from "@shared/catalogue";
import type { SellerProductDetailResponse } from "@shared/seller";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { createProductVersion } from "@/lib/seller-client";

const nonEmptyTextSchema = z.string().trim().min(1);

/**
 * The form's own local validation shape — not the shared
 * `createVersionRequestSchema` directly, because the browser's
 * `datetime-local` input can't natively produce the offset-qualified ISO
 * string that schema requires. `onSubmit` below builds the real
 * `CreateVersionRequest` (validated again by `createProductVersion` itself)
 * from these values.
 */
const versionFormSchema = z.object({
  version: semanticVersionSchema,
  releasedAt: nonEmptyTextSchema,
  notesVi: nonEmptyTextSchema,
  notesEn: nonEmptyTextSchema,
});
type VersionFormValues = z.infer<typeof versionFormSchema>;

const inputClassName =
  "h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export interface VersionFormProps {
  productId: string;
  csrfToken: string;
  onSuccess: (product: SellerProductDetailResponse) => void;
}

/**
 * Adds a new `ProductVersion` to an owned draft product (design §5/§6).
 * `reviewState` is never a field here — every new version starts at `draft`
 * server-side; moving it to `in_review` is `submit-for-review-action.tsx`'s
 * own dedicated call, never a byproduct of this form.
 */
export function VersionForm({
  productId,
  csrfToken,
  onSuccess,
}: VersionFormProps) {
  const t = useTranslations("Seller.versionForm");
  const versionId = useId();
  const versionErrorId = useId();
  const releasedAtId = useId();
  const releasedAtErrorId = useId();
  const notesViId = useId();
  const notesViErrorId = useId();
  const notesEnId = useId();
  const notesEnErrorId = useId();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VersionFormValues>({
    resolver: zodResolver(versionFormSchema),
    defaultValues: { version: "", releasedAt: "", notesVi: "", notesEn: "" },
  });

  const createVersionMutation = useMutation({
    mutationFn: (values: VersionFormValues) =>
      createProductVersion(
        productId,
        {
          version: values.version,
          releasedAt: new Date(values.releasedAt).toISOString(),
          translations: [
            { locale: "vi", notes: values.notesVi },
            { locale: "en", notes: values.notesEn },
          ],
        },
        csrfToken,
      ),
    onSuccess: (product) => {
      reset();
      onSuccess(product);
    },
  });

  const onSubmit: SubmitHandler<VersionFormValues> = (values) => {
    createVersionMutation.mutate(values);
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-border p-4"
      noValidate
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <h3 className="text-base font-semibold text-foreground">
        {t("heading")}
      </h3>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={versionId}
        >
          {t("fields.version.label")}
        </label>
        <input
          aria-describedby={errors.version ? versionErrorId : undefined}
          aria-invalid={errors.version ? "true" : undefined}
          className={inputClassName}
          id={versionId}
          placeholder="1.0.0"
          type="text"
          {...register("version")}
        />
        {errors.version ? (
          <p
            className="text-sm text-destructive"
            id={versionErrorId}
            role="alert"
          >
            {t("fields.version.error")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={releasedAtId}
        >
          {t("fields.releasedAt.label")}
        </label>
        <input
          aria-describedby={errors.releasedAt ? releasedAtErrorId : undefined}
          aria-invalid={errors.releasedAt ? "true" : undefined}
          className={inputClassName}
          id={releasedAtId}
          type="datetime-local"
          {...register("releasedAt")}
        />
        {errors.releasedAt ? (
          <p
            className="text-sm text-destructive"
            id={releasedAtErrorId}
            role="alert"
          >
            {t("fields.releasedAt.error")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={notesViId}
        >
          {t("fields.notesVi.label")}
        </label>
        <textarea
          aria-describedby={errors.notesVi ? notesViErrorId : undefined}
          aria-invalid={errors.notesVi ? "true" : undefined}
          className={inputClassName}
          id={notesViId}
          {...register("notesVi")}
        />
        {errors.notesVi ? (
          <p
            className="text-sm text-destructive"
            id={notesViErrorId}
            role="alert"
          >
            {t("fields.notesVi.error")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={notesEnId}
        >
          {t("fields.notesEn.label")}
        </label>
        <textarea
          aria-describedby={errors.notesEn ? notesEnErrorId : undefined}
          aria-invalid={errors.notesEn ? "true" : undefined}
          className={inputClassName}
          id={notesEnId}
          {...register("notesEn")}
        />
        {errors.notesEn ? (
          <p
            className="text-sm text-destructive"
            id={notesEnErrorId}
            role="alert"
          >
            {t("fields.notesEn.error")}
          </p>
        ) : null}
      </div>

      {createVersionMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("submitError")}
        </p>
      ) : null}

      <Button
        disabled={isSubmitting || createVersionMutation.isPending}
        type="submit"
      >
        {createVersionMutation.isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
