"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { ProductDetailResponse } from "@shared/catalogue";
import { localeSchema } from "@shared/localization";

type DemoPage = ProductDetailResponse["demoPages"][number];

export interface DemoViewerProps {
  /** The product's always-on live demo, isolated from the storefront origin. */
  isolatedPreviewUrl: string;
  demoPages: readonly DemoPage[];
}

interface DemoOption {
  id: string;
  title: string;
  url: string;
}

/**
 * Deliberately minimal sandbox grant for a cross-origin, untrusted-by-default
 * preview frame: scripts and forms so a demo template renders and behaves
 * normally, but no `allow-same-origin` (the frame can never read/write the
 * real preview host's cookies or storage as itself), no `allow-popups` and no
 * `allow-top-navigation*` (the frame can never open windows or navigate the
 * storefront tab), and no modals/downloads/pointer-lock. This keeps the
 * preview unable to reach the storefront's session or credentials no matter
 * what the framed page does.
 */
const PREVIEW_SANDBOX = "allow-scripts allow-forms";

function pickDemoPageTitle(demoPage: DemoPage, locale: string): string {
  return (
    demoPage.translations.find((entry) => entry.locale === locale)?.title ??
    demoPage.slug
  );
}

/**
 * Renders the product's live demo and its demo pages inside one sandboxed,
 * cross-origin iframe. Switching options changes only the framed `src`; no
 * storefront session, cookie, or CSRF material is ever available to the
 * frame.
 */
export function DemoViewer({ isolatedPreviewUrl, demoPages }: DemoViewerProps) {
  const locale = localeSchema.parse(useLocale());
  const t = useTranslations("Product.demo");

  const liveOption: DemoOption = {
    id: "__live__",
    title: t("liveDemoOption"),
    url: isolatedPreviewUrl,
  };
  const options: DemoOption[] = [
    liveOption,
    ...demoPages.map((demoPage) => ({
      id: demoPage.slug,
      title: pickDemoPageTitle(demoPage, locale),
      url: demoPage.previewUrl,
    })),
  ];

  const [selectedId, setSelectedId] = useState(liveOption.id);
  const selected =
    options.find((option) => option.id === selectedId) ?? liveOption;

  return (
    <section
      aria-labelledby="demo-viewer-heading"
      className="flex w-full flex-col gap-4"
    >
      <h2
        className="text-xl font-semibold text-foreground"
        id="demo-viewer-heading"
      >
        {t("heading")}
      </h2>
      <div
        aria-label={t("switcherLabel")}
        className="flex flex-wrap gap-2"
        role="group"
      >
        {options.map((option) => (
          <button
            aria-pressed={option.id === selectedId}
            className={cn(
              "inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 text-sm font-medium transition-colors duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              option.id === selectedId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted",
            )}
            key={option.id}
            onClick={() => setSelectedId(option.id)}
            type="button"
          >
            {option.title}
          </button>
        ))}
      </div>
      <div className="aspect-video w-full overflow-hidden rounded-[var(--radius-panel)] border border-border bg-muted">
        <iframe
          className="size-full"
          referrerPolicy="no-referrer"
          sandbox={PREVIEW_SANDBOX}
          src={selected.url}
          title={t("frameLabel", { title: selected.title })}
        />
      </div>
    </section>
  );
}
