import type { PublicationState } from "@shared/catalogue";
import type { ReviewState } from "@shared/seller";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export type ReviewStateBadgeProps =
  | { kind: "publicationState"; value: PublicationState }
  | { kind: "reviewState"; value: ReviewState };

/**
 * Only the reachable states get the accent treatment (`in_review`,
 * `approved`, `published`) — `draft` and `delisted` stay visually quiet.
 * `approved`/`published` can still appear here even though this surface can
 * never *set* them (they're admin-only transitions, design §5/§8) — a
 * previously admin-approved/published product must still render its real
 * state honestly.
 */
const BADGE_TONE: Record<PublicationState | ReviewState, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  in_review: "border-primary bg-background text-foreground",
  approved: "border-primary bg-primary text-primary-foreground",
  published: "border-primary bg-primary text-primary-foreground",
  delisted: "border-destructive bg-background text-destructive",
};

/**
 * A small pill rendering either a product's `publicationState` or a
 * version's `reviewState` (design §4/§6) — both are server-owned, read-only
 * facts on this surface, so this component only ever displays a value it is
 * given; it exposes no control to change one.
 */
export function ReviewStateBadge(props: ReviewStateBadgeProps) {
  const t = useTranslations("Seller.states");

  const label =
    props.kind === "publicationState"
      ? t(`publicationState.${props.value}`)
      : t(`reviewState.${props.value}`);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        BADGE_TONE[props.value],
      )}
    >
      {label}
    </span>
  );
}
