import { getTranslations } from "next-intl/server";

import { SignInForm } from "@/components/auth/sign-in-form";

type SignInPageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

/**
 * The one `returnTo` value this route ever forwards to `SignInForm` is
 * whatever a caller put on the URL's query string — never trusted here.
 * `SignInForm` independently re-validates it against the shared KITVERA
 * allowlist before it can ever reach a request or a redirect.
 */
function firstReturnTo(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = await searchParams;
  const t = await getTranslations("Auth.signIn");

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1>{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <SignInForm
        initialReturnTo={firstReturnTo(resolvedSearchParams.returnTo)}
      />
    </section>
  );
}
