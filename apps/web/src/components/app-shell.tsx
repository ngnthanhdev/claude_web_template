"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

const templateGroups = [
  { heading: "Build", items: ["WordPress", "Elementor", "HTML", "Jamstack"] },
  { heading: "Commerce", items: ["Shopify", "eCommerce", "Plugins"] },
  { heading: "Design", items: ["Marketing", "CMS", "UI Templates"] },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

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
        Skip to content
      </a>
      <header className="site-header">
        <div className="shell-container header-row">
          <Link className="wordmark" href="/" aria-label="KITVERA home">
            KITVERA
          </Link>
          <nav aria-label="Primary">
            <Button
              aria-controls={menuId}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label="Browse template groups"
              onClick={() => setMenuOpen((current) => !current)}
              type="button"
              variant="ghost"
            >
              Browse <span aria-hidden="true">⌄</span>
            </Button>
          </nav>
        </div>
        {menuOpen ? (
          <section aria-label="Template groups" className="mega-panel" id={menuId}>
            <div className="shell-container mega-grid">
              {templateGroups.map((group) => (
                <div className="mega-group" key={group.heading}>
                  <h2>{group.heading}</h2>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item}>
                        <span>{item}</span>
                        <small>Catalogue route coming in a later layer</small>
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
          aria-label="Close template groups"
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
          <span>Vietnamese and English marketplace foundation</span>
        </div>
      </footer>
    </div>
  );
}
