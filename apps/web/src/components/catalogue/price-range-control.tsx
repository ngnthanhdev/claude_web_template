"use client";

import { useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  licenceIdentifierSchema,
  type LicenceIdentifier,
} from "@shared/catalogue";
import type { Currency } from "@shared/localization";

export interface PriceRangeControlProps {
  currency: Currency;
  licence: LicenceIdentifier;
  /** Minor-unit integer amounts (see `@shared/money`), or `undefined` for an open bound. */
  minPrice: number | undefined;
  maxPrice: number | undefined;
  onChange: (range: {
    licence?: LicenceIdentifier;
    minPrice?: number;
    maxPrice?: number;
  }) => void;
}

const currencyFractionDigitsCache = new Map<Currency, number>();

/**
 * Minor-unit digit count for a currency (0 for VND, 2 for USD), derived
 * from `Intl.NumberFormat` itself — mirrors `lib/format.ts`'s `formatMoney`
 * so no currency ever needs a hand-maintained digit table.
 */
function getCurrencyFractionDigits(currency: Currency): number {
  const cached = currencyFractionDigitsCache.get(currency);
  if (cached !== undefined) return cached;

  const digits =
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 0;
  currencyFractionDigitsCache.set(currency, digits);
  return digits;
}

function toMajorUnitText(
  minorAmount: number | undefined,
  currency: Currency,
): string {
  if (minorAmount === undefined) return "";
  return String(minorAmount / 10 ** getCurrencyFractionDigits(currency));
}

function toMinorUnitAmount(
  majorUnitText: string,
  currency: Currency,
): number | undefined {
  if (majorUnitText.trim() === "") return undefined;

  const majorAmount = Number(majorUnitText);
  if (!Number.isFinite(majorAmount) || majorAmount < 0) return undefined;

  return Math.round(majorAmount * 10 ** getCurrencyFractionDigits(currency));
}

/**
 * The collection's price dimension: the licence tier a price is quoted
 * under (switching licence resets the range, since a bound picked for one
 * tier can silently exclude every product in the other) and a min/max
 * range in that licence's price for the selected currency. Values commit on
 * submit (Enter or Apply), not per keystroke, to avoid firing a fetch per
 * digit typed.
 */
export function PriceRangeControl({
  currency,
  licence,
  minPrice,
  maxPrice,
  onChange,
}: PriceRangeControlProps) {
  const t = useTranslations("Collection.price");
  const tLicence = useTranslations("Collection.licence");
  const minId = useId();
  const maxId = useId();

  const [minText, setMinText] = useState(() =>
    toMajorUnitText(minPrice, currency),
  );
  const [maxText, setMaxText] = useState(() =>
    toMajorUnitText(maxPrice, currency),
  );
  const [hasRangeError, setHasRangeError] = useState(false);

  useEffect(() => {
    setMinText(toMajorUnitText(minPrice, currency));
    setMaxText(toMajorUnitText(maxPrice, currency));
    setHasRangeError(false);
  }, [minPrice, maxPrice, currency]);

  function handleLicenceChange(event: ChangeEvent<HTMLInputElement>) {
    const parsed = licenceIdentifierSchema.safeParse(event.target.value);
    if (!parsed.success) return;

    onChange({
      licence: parsed.data,
      minPrice: undefined,
      maxPrice: undefined,
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextMinPrice = toMinorUnitAmount(minText, currency);
    const nextMaxPrice = toMinorUnitAmount(maxText, currency);

    if (
      nextMinPrice !== undefined &&
      nextMaxPrice !== undefined &&
      nextMinPrice > nextMaxPrice
    ) {
      setHasRangeError(true);
      return;
    }

    setHasRangeError(false);
    onChange({ minPrice: nextMinPrice, maxPrice: nextMaxPrice });
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">
          {t("licenceHeading")}
        </legend>
        {licenceIdentifierSchema.options.map((option) => (
          <label
            className="inline-flex min-h-11 items-center gap-2 text-sm text-foreground"
            key={option}
          >
            <input
              checked={licence === option}
              className="size-5"
              name="collection-licence"
              onChange={handleLicenceChange}
              type="radio"
              value={option}
            />
            {tLicence(option)}
          </label>
        ))}
      </fieldset>

      <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
        <fieldset className="flex flex-wrap items-end gap-3">
          <legend className="text-sm font-medium text-foreground">
            {t("heading")}
          </legend>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground" htmlFor={minId}>
              {t("minLabel")}
            </label>
            <input
              className="h-11 w-28 rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              id={minId}
              inputMode="decimal"
              min={0}
              onChange={(event) => setMinText(event.target.value)}
              type="number"
              value={minText}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground" htmlFor={maxId}>
              {t("maxLabel")}
            </label>
            <input
              className="h-11 w-28 rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              id={maxId}
              inputMode="decimal"
              min={0}
              onChange={(event) => setMaxText(event.target.value)}
              type="number"
              value={maxText}
            />
          </div>
          <Button type="submit">{t("apply")}</Button>
        </fieldset>
        {hasRangeError ? (
          <p className="text-sm text-destructive" role="alert">
            {t("rangeError")}
          </p>
        ) : null}
      </form>
    </div>
  );
}
