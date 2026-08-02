"use client";

import type { SubmitForReviewResponse } from "@shared/seller";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { submitForReview } from "@/lib/seller-client";

export interface SubmitForReviewActionProps {
  productId: string;
  version: string;
  csrfToken: string;
  onSubmitted?: (result: SubmitForReviewResponse) => void;
}

/**
 * The only state-transition control anywhere on this surface: moves one
 * version `draft -> in_review` through the dedicated guarded endpoint
 * (design §5/§8). There is no publish/approve affordance next to it, or
 * anywhere else in the seller authoring components — those transitions are
 * admin-only and this client never has a way to request them.
 */
export function SubmitForReviewAction({
  productId,
  version,
  csrfToken,
  onSubmitted,
}: SubmitForReviewActionProps) {
  const t = useTranslations("Seller.submitForReview");

  const submitMutation = useMutation({
    mutationFn: () => submitForReview(productId, { version }, csrfToken),
    onSuccess: onSubmitted,
  });

  if (submitMutation.isSuccess) {
    return (
      <p className="text-sm font-medium text-foreground" role="status">
        {t("submitted")}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        disabled={submitMutation.isPending}
        onClick={() => submitMutation.mutate()}
        type="button"
        variant="outline"
      >
        {submitMutation.isPending ? t("pending") : t("action")}
      </Button>
      {submitMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("error")}
        </p>
      ) : null}
    </div>
  );
}
