"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { semanticVersionSchema } from "@shared/catalogue";
import { localeSchema } from "@shared/localization";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { ApiClientError } from "@/lib/api-client";
import { delistProduct, publishProduct } from "@/lib/admin-client";

import { useAdminContextStatus } from "./admin-nav-entry";

const productIdSchema = z.string().uuid();

const inputClassName =
  "h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const publishFormSchema = z.object({
  productId: productIdSchema,
  version: semanticVersionSchema,
});
type PublishFormValues = z.infer<typeof publishFormSchema>;

const delistFormSchema = z.object({
  productId: productIdSchema,
});
type DelistFormValues = z.infer<typeof delistFormSchema>;

/** `true` for the server's `422` — an unapproved version or an unverified artifact (design §5). */
function isUnprocessableError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 422;
}

function PublishForm({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations("Admin.publish.publishForm");
  const tStates = useTranslations("Admin.states");
  const searchParams = useSearchParams();
  const productIdId = useId();
  const productIdErrorId = useId();
  const versionId = useId();
  const versionErrorId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PublishFormValues>({
    resolver: zodResolver(publishFormSchema),
    defaultValues: {
      productId: searchParams.get("productId") ?? "",
      version: searchParams.get("version") ?? "",
    },
  });

  const publishMutation = useMutation({
    mutationFn: (values: PublishFormValues) =>
      publishProduct(values.productId, { version: values.version }, csrfToken),
  });

  const onSubmit: SubmitHandler<PublishFormValues> = (values) => {
    publishMutation.mutate(values);
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-border p-4"
      noValidate
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <h2 className="text-base font-semibold text-foreground">
        {t("heading")}
      </h2>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={productIdId}
        >
          {t("productIdLabel")}
        </label>
        <input
          aria-describedby={errors.productId ? productIdErrorId : undefined}
          aria-invalid={errors.productId ? "true" : undefined}
          className={inputClassName}
          id={productIdId}
          type="text"
          {...register("productId")}
        />
        {errors.productId ? (
          <p
            className="text-sm text-destructive"
            id={productIdErrorId}
            role="alert"
          >
            {t("productIdError")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={versionId}
        >
          {t("versionLabel")}
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
            {t("versionError")}
          </p>
        ) : null}
      </div>

      {publishMutation.isSuccess ? (
        <p className="text-sm font-medium text-foreground" role="status">
          {t("success")}{" "}
          {tStates(`publicationState.${publishMutation.data.publicationState}`)}
        </p>
      ) : null}

      {publishMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {isUnprocessableError(publishMutation.error)
            ? t("unprocessable")
            : t("error")}
        </p>
      ) : null}

      <Button disabled={publishMutation.isPending} type="submit">
        {publishMutation.isPending ? t("pending") : t("submit")}
      </Button>
    </form>
  );
}

function DelistForm({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations("Admin.publish.delistForm");
  const tStates = useTranslations("Admin.states");
  const productIdId = useId();
  const productIdErrorId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DelistFormValues>({
    resolver: zodResolver(delistFormSchema),
    defaultValues: { productId: "" },
  });

  const delistMutation = useMutation({
    mutationFn: (values: DelistFormValues) =>
      delistProduct(values.productId, csrfToken),
  });

  const onSubmit: SubmitHandler<DelistFormValues> = (values) => {
    delistMutation.mutate(values);
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-border p-4"
      noValidate
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <h2 className="text-base font-semibold text-foreground">
        {t("heading")}
      </h2>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={productIdId}
        >
          {t("productIdLabel")}
        </label>
        <input
          aria-describedby={errors.productId ? productIdErrorId : undefined}
          aria-invalid={errors.productId ? "true" : undefined}
          className={inputClassName}
          id={productIdId}
          type="text"
          {...register("productId")}
        />
        {errors.productId ? (
          <p
            className="text-sm text-destructive"
            id={productIdErrorId}
            role="alert"
          >
            {t("productIdError")}
          </p>
        ) : null}
      </div>

      {delistMutation.isSuccess ? (
        <p className="text-sm font-medium text-foreground" role="status">
          {t("success")}{" "}
          {tStates(`publicationState.${delistMutation.data.publicationState}`)}
        </p>
      ) : null}

      {delistMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {isUnprocessableError(delistMutation.error)
            ? t("unprocessable")
            : t("error")}
        </p>
      ) : null}

      <Button
        disabled={delistMutation.isPending}
        type="submit"
        variant="outline"
      >
        {delistMutation.isPending ? t("pending") : t("submit")}
      </Button>
    </form>
  );
}

/**
 * `/[locale]/admin/publish`: the guarded publish/delist transitions (design
 * §5). There is no listing endpoint for "publishable" products yet (only the
 * dedicated per-product transitions exist), so each form addresses a single
 * product by id — reached either by typing it in directly or via the
 * "publish this version" link `review-actions.tsx` renders after an approve
 * (which pre-fills `productId`/`version` from the URL). Both forms surface
 * the server's `422` verbatim when the version is unapproved or the
 * artifact unverified — this UI never fabricates a publishable state.
 */
export function PublicationPanel() {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Admin.publish");
  const session = useSession();
  const { status: adminStatus, refetch: refetchAdminStatus } =
    useAdminContextStatus();

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

  if (adminStatus === "loading" || adminStatus === "idle") {
    return <p role="status">{t("loading")}</p>;
  }

  if (adminStatus === "forbidden" || adminStatus === "error") {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)]"
        role="alert"
      >
        <p className="text-base font-semibold text-foreground">
          {t("forbidden.heading")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("forbidden.description")}
        </p>
        {adminStatus === "error" ? (
          <Button onClick={refetchAdminStatus} type="button" variant="outline">
            {t("error.action")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="admin-publish-heading"
      className="flex flex-col gap-6"
    >
      <h1
        className="text-2xl font-semibold text-foreground"
        id="admin-publish-heading"
      >
        {t("heading")}
      </h1>
      <PublishForm csrfToken={session.csrfToken} />
      <DelistForm csrfToken={session.csrfToken} />
    </section>
  );
}
