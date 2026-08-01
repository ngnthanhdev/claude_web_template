import { OrdersList } from "@/components/account/orders-list";

/**
 * `/[locale]/account/orders` — the caller's own order history. All
 * data-fetching, the unauthenticated redirect, and the section heading live
 * in the client-side `OrdersList` (mirroring `/[locale]/account`'s
 * `AccountPanel` split).
 */
export default function AccountOrdersPage() {
  return <OrdersList />;
}
