---
name: web-i18n-theme
description: Use when adding internationalization or a light/dark theme to apps/web — message catalogs and locale routing (next-intl for Next.js, i18next/react-i18next for Vite, forked by framework), plus theme tokens and a ThemeProvider that writes class/data-theme on <html>, persists the choice, and respects prefers-color-scheme. Load web-styling for the token layer the theme drives.
---

# web-i18n-theme

Two cross-cutting concerns for `apps/web`: translating UI text out of
hard-coded strings into locale message catalogs, and a light/dark theme that
flips a single attribute on `<html>` which every design token reads from.
Both are app-wide providers set up once, near the root.

## Goal

No user-facing string is a literal in a component — every one is a key into a
catalog, so adding a locale is adding a JSON file, not editing components.
Theme is one source of truth (`data-theme`/`class` on `<html>`) that
`web-styling`'s tokens key off, chosen in this precedence: explicit user
choice → persisted previous choice → the OS `prefers-color-scheme`.

## Internationalization — framework fork

**Next.js (App Router) — `next-intl`.** Locale is a route segment
(`/[locale]/…`) so each language is a real, linkable, server-rendered URL:

```ts
// apps/web/src/i18n/request.ts
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`../../messages/${locale}.json`)).default,
}));
```

```tsx
// apps/web/src/app/[locale]/layout.tsx
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

```tsx
// any component
import { useTranslations } from "next-intl";
export function Greeting() {
  const t = useTranslations("home");
  return <h1>{t("welcome", { name: "Ada" })}</h1>;
}
```

A `middleware.ts` from `next-intl/middleware` negotiates the locale (from the
path, then `Accept-Language`) and redirects `/` to `/{defaultLocale}`. Server
components read messages on the server; only interactive subtrees need the
client provider.

**Vite + React — `i18next` + `react-i18next`.** A SPA has no server segment,
so the locale lives in app state (and optionally a path prefix via the
router):

```ts
// apps/web/src/i18n/index.ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../messages/en.json";
import vi from "../../messages/vi.json";

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, vi: { translation: vi } },
  lng: localStorage.getItem("locale") ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React already escapes
});
export default i18n;
```

```tsx
// any component
import { useTranslation } from "react-i18next";
export function Greeting() {
  const { t } = useTranslation();
  return <h1>{t("home.welcome", { name: "Ada" })}</h1>;
}
```

## Message catalogs

One JSON file per locale under `apps/web/messages/` (`en.json`, `vi.json`),
namespaced by feature so keys stay findable:

```json
// apps/web/messages/en.json
{
  "home": { "welcome": "Welcome, {name}" },
  "auth": { "signIn": "Sign in", "signOut": "Sign out" }
}
```

Every locale file has the **same key set** — a missing key should be a
lint/CI failure, not a silent fallback that ships an English string inside a
Vietnamese page. Keep interpolation to named placeholders (`{name}`), never
string-concatenate a translated fragment with a variable, because word order
differs across languages.

## Theme — tokens, provider, `<html>` attribute

The theme system flips one attribute; `web-styling` defines the tokens that
respond to it. In a Tailwind setup that means the `dark:` variant keys off a
`class` on `<html>`; with CSS variables it's a `[data-theme]` selector. Same
idea either way — one attribute, tokens downstream.

```ts
// apps/web/src/theme/apply-theme.ts
export type Theme = "light" | "dark" | "system";

export function resolveTheme(choice: Theme): "light" | "dark" {
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(choice: Theme) {
  const resolved = resolveTheme(choice);
  const root = document.documentElement;
  root.dataset.theme = resolved; // [data-theme="dark"] for CSS-variable tokens
  root.classList.toggle("dark", resolved === "dark"); // dark: variant for Tailwind
  localStorage.setItem("theme", choice); // persist the *choice*, incl. "system"
}
```

```tsx
// apps/web/src/theme/ThemeProvider.tsx
import { createContext, useContext, useEffect, useState } from "react";
import { applyTheme, type Theme } from "./apply-theme";

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) ?? "system",
  );

  const setTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
  };

  useEffect(() => {
    applyTheme(theme);
    // Follow OS changes live while the user is on "system".
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => theme === "system" && applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
};
```

Persist the **choice** (`"system"` included), not just the resolved value —
so a user who picked "follow the OS" keeps following it across reloads
instead of being pinned to whatever the OS happened to be last time.

## Avoiding the theme flash (FOUC)

If the first paint uses the default theme and JS corrects it a beat later,
dark-mode users see a white flash. Prevent it by setting the attribute
**before** the app renders, from a tiny inline script (Next.js: in the
`<head>` of the root layout; Vite: at the top of `index.html`) that reads
`localStorage` and applies `data-theme`/`.dark` synchronously — the provider
above then picks up the already-correct value on mount:

```html
<script>
  (function () {
    var c = localStorage.getItem("theme") || "system";
    var dark = c === "dark" || (c === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
    var r = document.documentElement;
    r.dataset.theme = dark ? "dark" : "light";
    r.classList.toggle("dark", dark);
  })();
</script>
```

## Do

- Route locale as a path segment with `next-intl` (Next.js) or manage it via
  `i18next` state (Vite); keep every locale file's key set identical.
- Use named interpolation placeholders (`{name}`) — never concatenate a
  translated fragment with a variable.
- Drive theme from one attribute on `<html>` (`data-theme` and/or `.dark`)
  that `web-styling`'s tokens read; persist the user's *choice*.
- Apply the persisted theme in a synchronous inline script before first
  paint to avoid the dark-mode flash.

## Don't

- Don't hard-code user-facing strings in components — every one is a catalog
  key, or a new locale means editing every component.
- Don't persist only the resolved light/dark value — persist `"system"` too,
  or "follow the OS" silently degrades to a fixed theme.
- Don't scatter `matchMedia`/`localStorage` theme reads across components —
  the `ThemeProvider` and the pre-paint script are the only two places that
  touch them.
- Don't define color values here — this skill flips the switch;
  `web-styling` owns the tokens the switch selects between.
