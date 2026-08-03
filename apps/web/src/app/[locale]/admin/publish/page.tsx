import { PublicationPanel } from "@/components/admin/publication-panel";

/**
 * `/[locale]/admin/publish` — the guarded publish/delist transitions. All
 * data-fetching, the unauthenticated redirect, and the honest error/
 * not-authorised states live in the client-side `PublicationPanel`.
 */
export default function AdminPublishPage() {
  return <PublicationPanel />;
}
