"use client";

import { useTranslations } from "next-intl";
import { useId, type ChangeEvent } from "react";

import { productSortSchema, type ProductSort } from "@shared/catalogue";

export interface SortControlProps {
  sort: ProductSort;
  onChange: (sort: ProductSort) => void;
}

/**
 * Renders exactly the approved sort keys from `productSortSchema` — never a
 * hard-coded list, and never a bestseller/rating/trending option, since
 * those aren't in the shared enum until real transactions/reviews exist.
 */
export function SortControl({ sort, onChange }: SortControlProps) {
  const t = useTranslations("Collection.sort");
  const selectId = useId();

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const parsed = productSortSchema.safeParse(event.target.value);
    if (parsed.success) onChange(parsed.data);
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-foreground" htmlFor={selectId}>
        {t("label")}
      </label>
      <select
        className="h-11 min-w-0 rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        id={selectId}
        onChange={handleChange}
        value={sort}
      >
        {productSortSchema.options.map((option) => (
          <option key={option} value={option}>
            {t(`options.${option}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
