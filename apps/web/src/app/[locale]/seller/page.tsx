import { SellerProductList } from "@/components/seller/seller-product-list";

/**
 * `/[locale]/seller` — the seller's own product/version authoring list. All
 * data-fetching, the unauthenticated redirect, and the honest empty/error/
 * not-authorised states live in the client-side `SellerProductList`.
 */
export default function SellerPage() {
  return <SellerProductList />;
}
