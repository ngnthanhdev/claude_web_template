"use client";

import type { LocalizedCategorySummary } from "@shared/catalogue";
import { localeSchema } from "@shared/localization";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { listCategories } from "@/lib/catalogue-client";

const MEGA_MENU_COLUMN_COUNT = 3;
const MEGA_MENU_TRANSITION_SECONDS = 0.2;

function pickCategoryName(
  category: LocalizedCategorySummary,
  locale: string,
): string {
  return (
    category.translations.find((translation) => translation.locale === locale)
      ?.name ?? category.slug
  );
}

/** Splits the flat category list into up to `columnCount` contiguous slices for the N11 layout — no invented group labels, just the real catalogue split for scanability. */
function splitIntoColumns<T>(items: readonly T[], columnCount: number): T[][] {
  if (items.length === 0) return [];

  const columnSize = Math.ceil(items.length / columnCount);
  const columns: T[][] = [];
  for (let start = 0; start < items.length; start += columnSize) {
    columns.push(items.slice(start, start + columnSize));
  }
  return columns;
}

/** Desktop N11 mega-menu: a 3-column category grid behind a dim/blur scrim. */
export function MegaMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
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

  const columns = splitIntoColumns(
    categoriesQuery.data?.data ?? [],
    MEGA_MENU_COLUMN_COUNT,
  );

  return (
    // No `relative` here on purpose: the panel is `position: absolute` and must
    // anchor to the full-width `.site-header` (the nearest positioned ancestor),
    // not this narrow button wrapper — otherwise `inset-inline: 0` collapses the
    // N11 panel to the button's width and the category columns overlap.
    <div className="hidden sm:block">
      <Button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
        type="button"
        variant="ghost"
      >
        {t("browse")} <span aria-hidden="true">⌄</span>
      </Button>
      {open ? (
        <>
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            aria-label={t("categoriesPanel")}
            className="mega-panel"
            id={panelId}
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            transition={{
              duration: MEGA_MENU_TRANSITION_SECONDS,
              ease: "easeOut",
            }}
          >
            <div className="shell-container mega-grid">
              {categoriesQuery.isError ? (
                <p role="alert">{t("categoriesError")}</p>
              ) : categoriesQuery.isPending ? (
                <p role="status">{t("categoriesLoading")}</p>
              ) : (
                columns.map((column, columnIndex) => (
                  <div className="mega-group" key={`column-${columnIndex}`}>
                    <ul>
                      {column.map((category) => (
                        <li key={category.slug}>
                          <Link
                            className="flex min-h-11 items-center"
                            href={`/${locale}/categories/${category.slug}`}
                            onClick={() => setOpen(false)}
                          >
                            {pickCategoryName(category, locale)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </motion.section>
          <motion.button
            animate={{ opacity: 1 }}
            aria-label={t("closeCategories")}
            className="nav-scrim backdrop-blur-sm"
            initial={reduceMotion ? false : { opacity: 0 }}
            onClick={() => setOpen(false)}
            transition={{
              duration: MEGA_MENU_TRANSITION_SECONDS,
              ease: "easeOut",
            }}
            type="button"
          />
        </>
      ) : null}
    </div>
  );
}
