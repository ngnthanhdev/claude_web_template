"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export interface CollectionPagerProps {
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  isFetching: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Forward/back continuation over the opaque cursor. The API only returns a
 * `nextCursor` (never a `prevCursor`), so "previous" is only ever enabled
 * once the shopper has already paged forward this session — see
 * `use-product-collection`'s cursor-history stack.
 */
export function CollectionPager({
  hasPreviousPage,
  hasNextPage,
  isFetching,
  onPrevious,
  onNext,
}: CollectionPagerProps) {
  const t = useTranslations("Collection.pager");

  return (
    <nav
      aria-label={t("regionLabel")}
      className="flex items-center justify-center gap-3"
    >
      <Button
        disabled={!hasPreviousPage || isFetching}
        onClick={onPrevious}
        type="button"
        variant="outline"
      >
        {t("previous")}
      </Button>
      <Button
        disabled={!hasNextPage || isFetching}
        onClick={onNext}
        type="button"
        variant="outline"
      >
        {t("next")}
      </Button>
    </nav>
  );
}
