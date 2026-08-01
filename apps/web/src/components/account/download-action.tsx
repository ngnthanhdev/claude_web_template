"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { issueDownload } from "@/lib/commerce-client";

export interface DownloadActionProps {
  entitlementId: string;
  csrfToken: string;
}

/**
 * The library's Download action. POSTs `/v1/entitlements/:id/download` via
 * the Round-2 commerce client to issue a short-lived signed URL, then opens
 * it directly with `window.open`. The returned `{ url, expiresAt }` is only
 * ever handed to `window.open` — this component never renders it into an
 * anchor `href`, a query string, or any pre-fetched link, and never logs it
 * (design §9 "Download/entitlement tokens / Information disclosure").
 */
export function DownloadAction({
  entitlementId,
  csrfToken,
}: DownloadActionProps) {
  const t = useTranslations("Account.library.download");

  const downloadMutation = useMutation({
    mutationFn: () => issueDownload(entitlementId, csrfToken),
    onSuccess: (issued) => {
      window.open(issued.url, "_blank", "noopener,noreferrer");
    },
  });

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        disabled={downloadMutation.isPending}
        onClick={() => downloadMutation.mutate()}
        type="button"
      >
        {downloadMutation.isPending ? t("pending") : t("action")}
      </Button>
      {downloadMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("error")}
        </p>
      ) : null}
    </div>
  );
}
