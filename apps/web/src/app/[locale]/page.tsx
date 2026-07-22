import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("Home");

  return (
    <section aria-labelledby="marketplace-title" className="placeholder-grid">
      <div>
        <p className="context-line">{t("context")}</p>
        <h1 id="marketplace-title">{t("title")}</h1>
      </div>
      <div className="placeholder-copy">
        <p>{t("introduction")}</p>
        <p className="status-line" role="status">
          {t("status")}
        </p>
      </div>
    </section>
  );
}
