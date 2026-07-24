import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { DemoViewer } from "@/components/product-detail/demo-viewer";
import { DetailHeader } from "@/components/product-detail/detail-header";
import { LicenceComparison } from "@/components/product-detail/licence-comparison";
import { SpecList } from "@/components/product-detail/spec-list";
import { getProductBySlugServer } from "@/lib/catalogue-server";
import { slugSchema } from "@shared/catalogue";

interface ProductDetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

/**
 * `/[locale]/templates/[slug]` — the public product detail screen. Fetched
 * server-side (directly from the API origin via `catalogue-server.ts`) so
 * an unknown, draft, delisted — or malformed — slug is a real HTTP 404
 * (crawlable, no client-only loading flash) instead of a client-rendered
 * empty state. The interactive/currency-dependent pieces stay in the
 * existing "use client" child components, which receive the validated
 * product as props.
 */
export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug: rawSlug } = await params;

  const parsedSlug = slugSchema.safeParse(rawSlug);
  if (!parsedSlug.success) notFound();

  const product = await getProductBySlugServer(parsedSlug.data);
  if (product === null) notFound();

  const t = await getTranslations("Product");

  return (
    <article className="flex w-full flex-col gap-[var(--space-2xl)]">
      <DetailHeader product={product} />
      <DemoViewer
        demoPages={product.demoPages}
        isolatedPreviewUrl={product.isolatedPreviewUrl}
      />
      <SpecList
        changelog={product.changelog}
        compatibility={product.compatibility}
        documentationUrl={product.documentationUrl}
        specifications={product.specifications}
      />
      <LicenceComparison licenceOptions={product.licenceOptions} />
      <section
        aria-labelledby="reviews-heading"
        className="flex flex-col gap-2"
      >
        <h2
          className="text-xl font-semibold text-foreground"
          id="reviews-heading"
        >
          {t("reviews.heading")}
        </h2>
        <p className="text-sm text-muted-foreground" role="status">
          {t("reviews.empty")}
        </p>
      </section>
    </article>
  );
}
