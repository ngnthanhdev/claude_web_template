import { defineRouting } from "next-intl/routing";

export const localeCookieName = "NEXT_LOCALE";

export const routing = defineRouting({
  defaultLocale: "vi",
  localeCookie: { name: localeCookieName },
  localeDetection: true,
  localePrefix: "always",
  locales: ["vi", "en"],
});

export function isSupportedLocale(
  locale: string | undefined,
): locale is (typeof routing.locales)[number] {
  return (
    locale !== undefined &&
    (routing.locales as readonly string[]).includes(locale)
  );
}

export function resolvePreferredLocale(
  storedLocale: string | undefined,
  acceptLanguage: string | null,
) {
  if (storedLocale && isSupportedLocale(storedLocale)) return storedLocale;

  const acceptedLocales = (acceptLanguage ?? "")
    .split(",")
    .map((entry) => {
      const [languageTag = "", ...parameters] = entry
        .trim()
        .toLowerCase()
        .split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number(qualityParameter.trim().slice(2))
        : 1;
      return { languageTag, quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter(({ quality }) => quality > 0)
    .sort((left, right) => right.quality - left.quality);

  for (const { languageTag } of acceptedLocales) {
    const locale = routing.locales.find(
      (candidate) =>
        languageTag === candidate || languageTag.startsWith(`${candidate}-`),
    );
    if (locale) return locale;
  }

  return routing.defaultLocale;
}
