import { LibraryList } from "@/components/account/library-list";

/**
 * `/[locale]/account/library` — the caller's owned entitlements, each with a
 * Download action. All data-fetching, the unauthenticated redirect, and the
 * section heading live in the client-side `LibraryList`.
 */
export default function AccountLibraryPage() {
  return <LibraryList />;
}
