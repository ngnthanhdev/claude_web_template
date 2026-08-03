import type { SessionRequest } from "../auth/sessions/session-context.js";

const ADMIN_CONTEXT = Symbol("kitvera.admin-context");

export interface AdminPrincipal {
  /** The acting admin's `User.id`, resolved server-side from the session. */
  readonly userId: string;
}

interface InternalAdminContext {
  readonly principal: AdminPrincipal;
}

/**
 * A request that has passed both `SessionAuthGuard` and `AdminRolesGuard`
 * (design §4/§8). The admin context is only ever attached by
 * `AdminRolesGuard` after it has server-side resolved the caller's `admin`
 * role assignment — the acting admin id is never readable from a request
 * body or query string.
 */
export interface AdminRequest extends SessionRequest {
  [ADMIN_CONTEXT]?: InternalAdminContext;
}

export function attachAdminPrincipal(
  request: AdminRequest,
  principal: AdminPrincipal,
): void {
  Object.defineProperty(request, ADMIN_CONTEXT, {
    configurable: false,
    enumerable: false,
    value: { principal } satisfies InternalAdminContext,
    writable: false,
  });
}

export function getAdminPrincipal(request: AdminRequest): AdminPrincipal {
  const context = request[ADMIN_CONTEXT];
  if (context === undefined) {
    throw new Error("Admin principal context is unavailable");
  }
  return context.principal;
}
