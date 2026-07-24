"use client";

import { useLocale, useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import type { ProductDetailResponse } from "@shared/catalogue";
import { localeSchema } from "@shared/localization";

type Compatibility = ProductDetailResponse["compatibility"][number];
type Specification = ProductDetailResponse["specifications"][number];
type ChangelogEntry = ProductDetailResponse["changelog"][number];

export interface SpecListProps {
  compatibility: readonly Compatibility[];
  specifications: readonly Specification[];
  changelog: readonly ChangelogEntry[];
  documentationUrl: string;
}

/** Turns a controlled slug (e.g. `"wordpress"`) into a readable label (`"Wordpress"`). */
function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

/**
 * Specifications, compatibility, the changelog, and the documentation link —
 * every value comes straight from the validated detail response (already
 * ordered by the API), never re-derived or invented here.
 */
export function SpecList({
  compatibility,
  specifications,
  changelog,
  documentationUrl,
}: SpecListProps) {
  const locale = localeSchema.parse(useLocale());
  const t = useTranslations("Product.specs");
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  });

  return (
    <div className="flex w-full flex-col gap-[var(--space-xl)]">
      <section aria-labelledby="specifications-heading">
        <h2
          className="text-xl font-semibold text-foreground"
          id="specifications-heading"
        >
          {t("specificationsHeading")}
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {specifications.map((spec) => {
            const translation =
              spec.translations.find((entry) => entry.locale === locale) ??
              spec.translations[0];
            return (
              <div className="flex flex-col gap-0.5" key={spec.key}>
                <dt className="text-sm text-muted-foreground">
                  {translation?.label ?? spec.key}
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {translation?.value ?? ""}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section aria-labelledby="compatibility-heading">
        <h2
          className="text-xl font-semibold text-foreground"
          id="compatibility-heading"
        >
          {t("compatibilityHeading")}
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {compatibility.map((entry) => (
            <li
              className="rounded-full border border-border px-3 py-1 text-sm text-foreground"
              key={entry.target}
            >
              {humanizeSlug(entry.target)} {entry.constraint}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="changelog-heading">
        <h2
          className="text-xl font-semibold text-foreground"
          id="changelog-heading"
        >
          {t("changelogHeading")}
        </h2>
        <ol className="mt-3 flex flex-col gap-4">
          {changelog.map((entry) => {
            const translation =
              entry.translations.find((item) => item.locale === locale) ??
              entry.translations[0];
            return (
              <li className="border-l-2 border-border pl-4" key={entry.version}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold text-foreground">
                    {entry.version}
                  </span>
                  <time
                    className="text-sm text-muted-foreground"
                    dateTime={entry.releasedAt}
                  >
                    {dateFormatter.format(new Date(entry.releasedAt))}
                  </time>
                </div>
                <p className="text-sm text-muted-foreground">
                  {translation?.notes ?? ""}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      <a
        className={buttonVariants({ className: "w-fit", variant: "outline" })}
        href={documentationUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t("documentationLabel")}
      </a>
    </div>
  );
}
