import { OrderDetail } from "@/components/account/order-detail";

interface AccountOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/[locale]/account/orders/[id]` — a single order's snapshots, status,
 * date, and total. The route param travels straight into the client-side
 * `OrderDetail`, which validates it, scopes the fetch through the Round-2
 * commerce client, and renders the not-found state for a malformed or
 * non-owned id.
 */
export default async function AccountOrderDetailPage({
  params,
}: AccountOrderDetailPageProps) {
  const { id } = await params;

  return <OrderDetail orderId={id} />;
}
