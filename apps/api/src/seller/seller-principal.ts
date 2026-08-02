import type { SessionRequest } from "../auth/sessions/session-context.js";

const SELLER_CONTEXT = Symbol("kitvera.seller-context");

export interface SellerPrincipal {
  readonly sellerId: string;
}

interface InternalSellerContext {
  readonly principal: SellerPrincipal;
}

/**
 * A request that has passed both `SessionAuthGuard` and `SellerGuard`. The
 * seller context is only ever attached by `SellerGuard` after it has
 * server-side resolved the caller's own `SellerProfile` — `sellerId` is never
 * readable from a request body or query string (design §5/§8).
 */
export interface SellerRequest extends SessionRequest {
  [SELLER_CONTEXT]?: InternalSellerContext;
}

export function attachSellerPrincipal(
  request: SellerRequest,
  principal: SellerPrincipal,
): void {
  Object.defineProperty(request, SELLER_CONTEXT, {
    configurable: false,
    enumerable: false,
    value: { principal } satisfies InternalSellerContext,
    writable: false,
  });
}

export function getSellerPrincipal(request: SellerRequest): SellerPrincipal {
  const context = request[SELLER_CONTEXT];
  if (context === undefined) {
    throw new Error("Seller principal context is unavailable");
  }
  return context.principal;
}
