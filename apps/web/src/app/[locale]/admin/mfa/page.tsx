import { MfaEnrollment } from "@/components/admin/mfa-enrollment";

/**
 * `/[locale]/admin/mfa` — TOTP enrollment. All data-fetching, the
 * unauthenticated redirect, and the honest error/not-authorised states live
 * in the client-side `MfaEnrollment`.
 */
export default function AdminMfaPage() {
  return <MfaEnrollment />;
}
