"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

const templateGroups = [
  { id: "build", items: ["wordpress", "elementor", "html", "jamstack"] },
  { id: "commerce", items: ["shopify", "ecommerce", "plugins"] },
  { id: "design", items: ["marketing", "cms", "uiTemplates"] },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const locale = useLocale();
  const t = useTranslations("Shell");

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        {t("skipToContent")}
      </a>
      <header className="site-header">
        <div className="shell-container header-row">
          <Link className="wordmark" href={`/${locale}`} aria-label={t("homeLabel")}>
            KITVERA
          </Link>
          <nav aria-label={t("primaryNavigation")}>
            <Button
              aria-controls={menuId}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label={t("browseGroups")}
              onClick={() => setMenuOpen((current) => !current)}
              type="button"
              variant="ghost"
            >
              {t("browse")} <span aria-hidden="true">⌄</span>
            </Button>
          </nav>
        </div>
        {menuOpen ? (
          <section aria-label={t("templateGroups")} className="mega-panel" id={menuId}>
            <div className="shell-container mega-grid">
              {templateGroups.map((group) => (
                <div className="mega-group" key={group.id}>
                  <h2>{t(`groups.${group.id}.heading`)}</h2>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item}>
                        <span>{t(`groups.${group.id}.items.${item}`)}</span>
                        <small>{t("catalogueRoutePending")}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </header>
      {menuOpen ? (
        <button
          aria-label={t("closeGroups")}
          className="nav-scrim"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      ) : null}
      <main className="shell-container site-main" id="main-content">
        {children}
      </main>
      <footer className="site-footer">
        <div className="shell-container footer-row">
          <span>KITVERA</span>
          <span>{t("footerFoundation")}</span>
        </div>
      </footer>
    </div>
  );
}
