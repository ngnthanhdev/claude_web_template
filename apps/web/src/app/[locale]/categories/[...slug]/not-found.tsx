import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/**
 * Rendered when `/[locale]/categories/[...slug]` resolves an unknown
 * category segment. `not-found.tsx` never receives route `params` (a Next.js
 * constraint), so the active locale/translations come from next-intl's
 * ambient request context (`getLocale`/`getTranslations`) rather than props.
 */
export default async function CategoryNotFound() {
  const locale = await getLocale();
  const t = await getTranslations("Catalogue");

  return (
    <section
      aria-labelledby="category-not-found-title"
      className="flex flex-col items-center gap-4 py-[var(--space-2xl)] text-center"
    >
      <h1
        className="text-2xl font-semibold text-foreground"
        id="category-not-found-title"
      >
        {t("notFound.heading")}
      </h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        {t("notFound.description")}
      </p>
      <Link
        className={buttonVariants({ variant: "outline" })}
        href={`/${locale}/search`}
      >
        {t("notFound.cta")}
      </Link>
    </section>
  );
}
