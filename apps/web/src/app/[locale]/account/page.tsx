import { useTranslations } from "next-intl";

import { AccountPanel } from "@/components/account/account-panel";

/**
 * The default post-redemption landing (`/[locale]/account`). All
 * data-fetching, the unauthenticated redirect, and the sign-out controls
 * live in the client-side `AccountPanel`; this route only supplies the
 * page's translated heading.
 */
export default function AccountPage() {
  const t = useTranslations("Account.page");

  return (
    <section
      aria-labelledby="account-page-heading"
      className="flex flex-col gap-6"
    >
      <h1 id="account-page-heading">{t("heading")}</h1>
      <AccountPanel />
    </section>
  );
}
