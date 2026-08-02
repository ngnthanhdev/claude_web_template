"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { issueDownload } from "@/lib/commerce-client";

export interface DownloadActionProps {
  entitlementId: string;
  productId: string;
  version: string;
  csrfToken: string;
}

/**
 * The library's Download action. POSTs `/v1/entitlements/:id/download` via
 * the Round-2 commerce client to issue a short-lived signed URL, sending the
 * entitlement's own `{ productId, version }` in the body so the server can
 * cross-check them against the entitlement (anti-tamper — a mismatch
 * 404s), then navigates directly to the issued URL with
 * `window.location.assign`. The endpoint responds
 * `content-disposition: attachment`, so the browser downloads the file in
 * place instead of navigating away or opening a new tab — and unlike
 * `window.open`, this isn't liable to be silently blocked as a popup. The
 * returned `{ url, expiresAt }` is only ever handed to
 * `window.location.assign` — this component never renders it into an
 * anchor `href`, a query string, or any pre-fetched link, and never logs it
 * (design §9 "Download/entitlement tokens / Information disclosure").
 */
export function DownloadAction({
  entitlementId,
  productId,
  version,
  csrfToken,
}: DownloadActionProps) {
  const t = useTranslations("Account.library.download");

  const downloadMutation = useMutation({
    mutationFn: () =>
      issueDownload(entitlementId, { productId, version }, csrfToken),
    onSuccess: (issued) => {
      window.location.assign(issued.url);
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
