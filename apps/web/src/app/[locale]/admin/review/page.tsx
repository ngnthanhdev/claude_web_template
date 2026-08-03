import { ReviewQueue } from "@/components/admin/review-queue";

/**
 * `/[locale]/admin/review` — the admin review queue. All data-fetching, the
 * unauthenticated redirect, and the honest empty/error/not-authorised states
 * live in the client-side `ReviewQueue`.
 */
export default function AdminReviewPage() {
  return <ReviewQueue />;
}
