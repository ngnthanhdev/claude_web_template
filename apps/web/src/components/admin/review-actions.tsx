"use client";

import type {
  ApproveReviewResponse,
  RejectReviewResponse,
} from "@shared/admin";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { approveReviewVersion, rejectReviewVersion } from "@/lib/admin-client";

const inputClassName =
  "h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export interface ReviewActionsProps {
  productId: string;
  version: string;
  csrfToken: string;
  onApproved?: (result: ApproveReviewResponse) => void;
  onRejected?: (result: RejectReviewResponse) => void;
}

/**
 * The only state-transition controls on the review queue: approve moves the
 * addressed version `in_review -> approved` (design §4/§5), reject moves it
 * back to `draft` and always carries a non-empty `reason` (design §4/§7).
 * There is no publish affordance here — publishing is a separate guarded
 * transition, only reachable from `publication-panel.tsx`, and there is no
 * order/entitlement/discount affordance anywhere on this surface.
 */
export function ReviewActions({
  productId,
  version,
  csrfToken,
  onApproved,
  onRejected,
}: ReviewActionsProps) {
  const locale = useLocale();
  const t = useTranslations("Admin.reviewActions");
  const [isRejecting, setIsRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonTouched, setReasonTouched] = useState(false);
  const reasonId = useId();
  const reasonErrorId = useId();

  const approveMutation = useMutation({
    mutationFn: () => approveReviewVersion(productId, version, csrfToken),
    onSuccess: onApproved,
  });

  const rejectMutation = useMutation({
    mutationFn: (rejectReason: string) =>
      rejectReviewVersion(
        productId,
        version,
        { reason: rejectReason },
        csrfToken,
      ),
    onSuccess: (result) => {
      setIsRejecting(false);
      onRejected?.(result);
    },
  });

  if (approveMutation.isSuccess) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm font-medium text-foreground" role="status">
          {t("approved")}
        </p>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={`/${locale}/admin/publish?productId=${encodeURIComponent(productId)}&version=${encodeURIComponent(version)}`}
        >
          {t("goToPublish")}
        </Link>
      </div>
    );
  }

  if (rejectMutation.isSuccess) {
    return (
      <p className="text-sm font-medium text-foreground" role="status">
        {t("rejected")}
      </p>
    );
  }

  const reasonIsEmpty = reason.trim().length === 0;

  if (isRejecting) {
    return (
      <div className="flex flex-col items-start gap-2">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={reasonId}
        >
          {t("reasonLabel")}
        </label>
        <textarea
          aria-describedby={
            reasonTouched && reasonIsEmpty ? reasonErrorId : undefined
          }
          aria-invalid={reasonTouched && reasonIsEmpty ? "true" : undefined}
          className={inputClassName}
          id={reasonId}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
        {reasonTouched && reasonIsEmpty ? (
          <p
            className="text-sm text-destructive"
            id={reasonErrorId}
            role="alert"
          >
            {t("reasonError")}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={rejectMutation.isPending}
            onClick={() => {
              setReasonTouched(true);
              if (reasonIsEmpty) return;
              rejectMutation.mutate(reason.trim());
            }}
            type="button"
            variant="outline"
          >
            {rejectMutation.isPending ? t("rejecting") : t("rejectSubmit")}
          </Button>
          <Button
            disabled={rejectMutation.isPending}
            onClick={() => {
              setIsRejecting(false);
              setReason("");
              setReasonTouched(false);
            }}
            type="button"
            variant="ghost"
          >
            {t("rejectCancel")}
          </Button>
        </div>
        {rejectMutation.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {t("rejectError")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={approveMutation.isPending}
          onClick={() => approveMutation.mutate()}
          type="button"
        >
          {approveMutation.isPending ? t("approving") : t("approve")}
        </Button>
        <Button
          disabled={approveMutation.isPending}
          onClick={() => setIsRejecting(true)}
          type="button"
          variant="outline"
        >
          {t("reject")}
        </Button>
      </div>
      {approveMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("approveError")}
        </p>
      ) : null}
    </div>
  );
}
