import type { Locale } from "@shared/localization";
import type { Money } from "@shared/money";

const INTL_LOCALE_TAGS: Record<Locale, string> = {
  vi: "vi-VN",
  en: "en-US",
};

function resolveIntlLocaleTag(locale: Locale): string {
  return INTL_LOCALE_TAGS[locale];
}

const moneyFormatterCache = new Map<string, Intl.NumberFormat>();

/**
 * Returns the cached `Intl.NumberFormat` currency formatter for a given
 * `{currency, locale}` pair, creating it once per combination.
 */
function getMoneyFormatter(
  locale: Locale,
  currency: Money["currency"],
): Intl.NumberFormat {
  const cacheKey = `${locale}:${currency}`;
  const cached = moneyFormatterCache.get(cacheKey);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat(resolveIntlLocaleTag(locale), {
    style: "currency",
    currency,
  });
  moneyFormatterCache.set(cacheKey, formatter);
  return formatter;
}

/**
 * Formats a `Money` value (an integer amount in the currency's minor unit,
 * per `@shared/money`) for display. The minor-unit digit count comes from
 * `Intl.NumberFormat` itself (e.g. 0 for VND, 2 for USD), so no currency
 * ever needs a hand-maintained minor-unit table.
 */
export function formatMoney(money: Money, locale: Locale): string {
  const formatter = getMoneyFormatter(locale, money.currency);
  // `style: "currency"` always resolves a fraction-digit count; the fallback
  // only guards the type declaration's optionality, not a real runtime case.
  const minorUnitDigits =
    formatter.resolvedOptions().maximumFractionDigits ?? 0;
  const majorUnitAmount = money.amount / 10 ** minorUnitDigits;

  return formatter.format(majorUnitAmount);
}
