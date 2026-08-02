"use client";

import { localeSchema } from "@shared/localization";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ProductAuthoringForm } from "@/components/seller/product-authoring-form";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

/**
 * `/[locale]/seller/products/new` — creates a draft `Product` from the base
 * authoring fields only (design §5/§6: `createDraftProductRequestSchema`
 * has no translations/media/compatibility/specs/demo-page field). On
 * success this navigates straight to the new product's own edit page, where
 * that richer content is authored.
 */
export default function NewSellerProductPage() {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Seller.newProduct");
  const session = useSession();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/${locale}/auth/sign-in`);
    }
  }, [session.status, locale, router]);

  if (session.status === "loading" || session.status === "unauthenticated") {
    return (
      <p role="status">
        {t(session.status === "loading" ? "loading" : "redirecting")}
      </p>
    );
  }

  if (session.status === "error") {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)]"
        role="alert"
      >
        <p className="text-base font-semibold text-foreground">
          {t("error.heading")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("error.description")}
        </p>
        <Button onClick={session.refetch} type="button" variant="outline">
          {t("error.action")}
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="seller-new-product-heading"
      className="flex flex-col gap-6"
    >
      <h1
        className="text-2xl font-semibold text-foreground"
        id="seller-new-product-heading"
      >
        {t("heading")}
      </h1>
      <ProductAuthoringForm
        csrfToken={session.csrfToken}
        mode="create"
        onSuccess={(product) =>
          router.push(`/${locale}/seller/products/${product.id}`)
        }
      />
    </section>
  );
}
