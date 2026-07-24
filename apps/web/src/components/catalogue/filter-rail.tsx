"use client";

import { useTranslations } from "next-intl";

import {
  toggleFacetValue,
  type ProductCollectionFacetKey,
  type ProductCollectionFilterState,
} from "@/lib/product-query-url";
import {
  updatedWithinSchema,
  type CompatibilityFilter,
  type LocalizedCategorySummary,
} from "@shared/catalogue";
import type { Locale } from "@shared/localization";

export interface FacetOption {
  value: string;
  label: string;
}

export interface FacetGroup {
  key: ProductCollectionFacetKey;
  label: string;
  options: readonly FacetOption[];
}

export interface CompatibilityOption {
  value: CompatibilityFilter;
  label: string;
}

export interface FilterRailProps {
  locale: Locale;
  /** The catalogue's category vocabulary, from `GET /v1/categories`. */
  categories: readonly LocalizedCategorySummary[];
  filters: ProductCollectionFilterState;
  onChange: (patch: Partial<ProductCollectionFilterState>) => void;
  onClear: () => void;
  /**
   * Controlled tag facet groups (subcategory/technology/templateType/
   * pageType/industry/feature). Supplied by the caller from whatever the
   * API response currently makes available — never a hard-coded list here.
   * A facet the caller doesn't supply options for simply isn't rendered.
   */
  facetGroups?: readonly FacetGroup[];
  /** Compatibility band options (`<target>@<band>`), supplied the same way. */
  compatibilityOptions?: readonly CompatibilityOption[];
}

function FacetCheckboxGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly FacetOption[];
  selected: readonly string[] | undefined;
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {options.map((option) => (
        <label
          className="inline-flex min-h-11 items-center gap-2 text-sm text-foreground"
          key={option.value}
        >
          <input
            checked={(selected ?? []).includes(option.value)}
            className="size-5"
            onChange={() => onToggle(option.value)}
            type="checkbox"
            value={option.value}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Renders the approved catalogue facets — category, the controlled tag
 * facets, compatibility bands, and `updatedWithin` — as checkbox groups
 * bound to the URL-backed collection state. Every OR-within-a-facet toggle
 * goes through `toggleFacetValue`; picking a different facet is a separate,
 * independent `onChange` patch (AND-across facets).
 */
export function FilterRail({
  categories,
  locale,
  filters,
  onChange,
  onClear,
  facetGroups = [],
  compatibilityOptions = [],
}: FilterRailProps) {
  const t = useTranslations("Collection.filters");

  const categoryOptions: FacetOption[] = categories.map((category) => ({
    value: category.slug,
    label:
      category.translations.find((entry) => entry.locale === locale)?.name ??
      category.slug,
  }));

  function toggleFacetGroupValue(
    key: ProductCollectionFacetKey,
    value: string,
  ) {
    onChange({ [key]: toggleFacetValue(filters[key], value) });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          {t("heading")}
        </h2>
        <button
          className="min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={onClear}
          type="button"
        >
          {t("clear")}
        </button>
      </div>

      <FacetCheckboxGroup
        label={t("categoryHeading")}
        onToggle={(value) =>
          onChange({ category: toggleFacetValue(filters.category, value) })
        }
        options={categoryOptions}
        selected={filters.category}
      />

      {facetGroups.map((group) => (
        <FacetCheckboxGroup
          key={group.key}
          label={group.label}
          onToggle={(value) => toggleFacetGroupValue(group.key, value)}
          options={group.options}
          selected={filters[group.key]}
        />
      ))}

      <FacetCheckboxGroup
        label={t("compatibilityHeading")}
        onToggle={(value) =>
          onChange({
            compatibility: toggleFacetValue(filters.compatibility, value),
          })
        }
        options={compatibilityOptions}
        selected={filters.compatibility}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">
          {t("updatedWithinHeading")}
        </legend>
        {updatedWithinSchema.options.map((option) => (
          <label
            className="inline-flex min-h-11 items-center gap-2 text-sm text-foreground"
            key={option}
          >
            <input
              checked={filters.updatedWithin === option}
              className="size-5"
              name="collection-updated-within"
              // Radios don't fire `onChange` when clicking the option that
              // is already selected, so the deselect-to-clear interaction
              // lives in `onClick` (which always fires); `onChange` is a
              // required no-op for the controlled `checked` prop.
              onChange={() => {}}
              onClick={() =>
                onChange({
                  updatedWithin:
                    filters.updatedWithin === option ? undefined : option,
                })
              }
              type="radio"
              value={option}
            />
            {t(`updatedWithin.${option}`)}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
