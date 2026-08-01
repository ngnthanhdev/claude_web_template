export const STORAGE_PORT = Symbol("STORAGE_PORT");

/** The owned entitlement a download is being issued against. */
export interface DownloadEntitlement {
  readonly id: string;
  readonly userId: string;
}

/** The exact product the entitled artifact belongs to. */
export interface DownloadProduct {
  readonly id: string;
}

export interface IssuedDownload {
  readonly url: string;
  readonly expiresAt: Date;
}

/**
 * Provider-neutral seam for minting a short-lived, single-use download URL
 * scoped to exactly the entitled `(product, version)` object — design §9
 * "Download issue / Elevation (BOLA/IDOR)". Callers must re-verify the
 * entitlement themselves before invoking this port; the port only signs.
 *
 * The dev/CI adapter ({@link ../downloads/local-storage.adapter.js}) signs an
 * app-route HMAC token over a local private files directory. A production
 * S3/R2 presigned-URL adapter would implement this same interface but is a
 * go-live storage-provider decision (§8/§10) — not wired in this layer.
 */
export interface StoragePort {
  issueDownload(
    entitlement: DownloadEntitlement,
    product: DownloadProduct,
    version: string,
  ): Promise<IssuedDownload>;
}
