"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  licenceIdentifierSchema,
  type LicenceIdentifier,
  type LicenceOptions,
} from "@shared/catalogue";
import { localeSchema } from "@shared/localization";

export interface LicenceComparisonProps {
  licenceOptions: LicenceOptions;
}

/**
 * The Regular/Extended licence comparison. Prices always come from the
 * matching `{identifier, currency}` entry in `licenceOptions` — never
 * computed or hard-coded here. Purchasing itself lives in the add-to-cart
 * block above this comparison (`DetailHeader`); this component is
 * comparison-only.
 */
export function LicenceComparison({ licenceOptions }: LicenceComparisonProps) {
  const locale = localeSchema.parse(useLocale());
  const { currency } = useCurrency();
  const t = useTranslations("Product.licence");
  const [selected, setSelected] = useState<LicenceIdentifier>("Regular");

  return (
    <section
      aria-labelledby="licence-heading"
      className="flex w-full flex-col gap-4"
    >
      <h2
        className="text-xl font-semibold text-foreground"
        id="licence-heading"
      >
        {t("heading")}
      </h2>
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="sr-only">{t("heading")}</legend>
        {licenceIdentifierSchema.options.map((identifier) => {
          const option = licenceOptions.find(
            (entry) => entry.identifier === identifier,
          );
          const price = option?.prices.find(
            (entry) => entry.currency === currency,
          );
          const isSelected = selected === identifier;

          return (
            <label
              className={cn(
                "flex min-h-11 cursor-pointer flex-col gap-1 rounded-[var(--radius-panel)] border p-4 transition-colors duration-200 ease-out",
                isSelected
                  ? "border-primary bg-muted"
                  : "border-border hover:border-primary",
              )}
              key={identifier}
            >
              <span className="flex items-center gap-2">
                <input
                  checked={isSelected}
                  className="size-5"
                  name="product-licence"
                  onChange={() => setSelected(identifier)}
                  type="radio"
                  value={identifier}
                />
                <span className="font-semibold text-foreground">
                  {t(identifier)}
                </span>
              </span>
              <span className="text-lg font-semibold text-foreground">
                {price ? formatMoney(price, locale) : t("priceUnavailable")}
              </span>
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}
