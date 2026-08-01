import { CartView } from "@/components/cart/cart-view";

/**
 * `/[locale]/cart` — the client-only cart (design §1/§6). All fetching,
 * rendering, and the checkout hand-off live in the client-side `CartView`.
 */
export default function CartPage() {
  return <CartView />;
}
