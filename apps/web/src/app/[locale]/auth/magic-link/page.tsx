import { RedemptionStatus } from "@/components/auth/redemption-status";

/**
 * The magic-link token only ever lives in this URL's `#token=` fragment,
 * which browsers never send to a server — so this page needs no
 * `searchParams`/request handling at all. `RedemptionStatus` reads the
 * fragment client-side and owns the page's single heading, since its text
 * depends on the in-flight redemption state.
 */
export default function MagicLinkPage() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6">
      <RedemptionStatus />
    </section>
  );
}
