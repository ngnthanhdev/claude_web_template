"use client";

import type { LocalizedCategorySummary } from "@shared/catalogue";
import { localeSchema } from "@shared/localization";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { LocaleCurrencyToggle } from "@/components/nav/locale-currency-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { listCategories } from "@/lib/catalogue-client";
import { cn } from "@/lib/utils";

const DRAWER_TRANSITION_SECONDS = 0.25;

function pickCategoryName(
  category: LocalizedCategorySummary,
  locale: string,
): string {
  return (
    category.translations.find((translation) => translation.locale === locale)
      ?.name ?? category.slug
  );
}

/** Mobile accordion drawer: categories collapse behind a single "Categories" section, plus the search entry and locale/currency toggles. */
export function MobileDrawer() {
  const [open, setOpen] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const drawerId = useId();
  const categoriesPanelId = useId();
  const locale = localeSchema.parse(useLocale());
  const t = useTranslations("Shell");
  const reduceMotion = useReducedMotion();

  const categoriesQuery = useQuery({
    queryKey: ["categories", locale],
    queryFn: () => listCategories({ locale }),
  });

  useEffect(() => {
    if (!open) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function closeDrawer() {
    setOpen(false);
  }

  const categories = categoriesQuery.data?.data ?? [];

  return (
    <div className="sm:hidden">
      <Button
        aria-controls={drawerId}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
        type="button"
        variant="ghost"
      >
        <span aria-hidden="true">☰</span> {t("menu")}
      </Button>
      {open ? (
        <>
          <motion.button
            animate={{ opacity: 1 }}
            aria-label={t("closeMenu")}
            className="nav-scrim backdrop-blur-sm"
            initial={reduceMotion ? false : { opacity: 0 }}
            onClick={closeDrawer}
            transition={{ duration: DRAWER_TRANSITION_SECONDS }}
            type="button"
          />
          <motion.section
            animate={{ x: 0 }}
            aria-label={t("mobileNavigation")}
            className="fixed inset-y-0 right-0 z-[var(--z-sticky)] flex w-[min(22rem,88vw)] flex-col gap-6 overflow-y-auto border-l border-[var(--color-rule)] bg-[var(--color-paper-raised)] p-4"
            id={drawerId}
            initial={reduceMotion ? false : { x: "100%" }}
            transition={{
              duration: DRAWER_TRANSITION_SECONDS,
              ease: "easeOut",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="wordmark">KITVERA</span>
              <Button
                aria-label={t("closeMenu")}
                onClick={closeDrawer}
                size="icon"
                type="button"
                variant="ghost"
              >
                <span aria-hidden="true">×</span>
              </Button>
            </div>

            <Link
              className={buttonVariants({ variant: "outline" })}
              href={`/${locale}/search`}
              onClick={closeDrawer}
            >
              {t("search")}
            </Link>

            <div>
              <h2>
                <button
                  aria-controls={categoriesPanelId}
                  aria-expanded={categoriesExpanded}
                  className="flex min-h-11 w-full items-center justify-between text-left text-base font-semibold"
                  onClick={() => setCategoriesExpanded((current) => !current)}
                  type="button"
                >
                  {t("categoriesSection")}
                  <span aria-hidden="true">
                    {categoriesExpanded ? "−" : "+"}
                  </span>
                </button>
              </h2>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  categoriesExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
                id={categoriesPanelId}
              >
                <ul className="overflow-hidden">
                  {categoriesQuery.isError ? (
                    <li role="alert">{t("categoriesError")}</li>
                  ) : categoriesQuery.isPending ? (
                    <li role="status">{t("categoriesLoading")}</li>
                  ) : (
                    categories.map((category) => (
                      <li key={category.slug}>
                        <Link
                          className="flex min-h-11 items-center"
                          href={`/${locale}/categories/${category.slug}`}
                          onClick={closeDrawer}
                        >
                          {pickCategoryName(category, locale)}
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <LocaleCurrencyToggle />
          </motion.section>
        </>
      ) : null}
    </div>
  );
}
