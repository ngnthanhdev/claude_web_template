import { UserRolesPanel } from "@/components/admin/user-roles-panel";

/**
 * `/[locale]/admin/users` — the PII-minimized user directory with
 * grant/revoke role controls. All data-fetching, the unauthenticated
 * redirect, and the honest empty/error/not-authorised states live in the
 * client-side `UserRolesPanel`.
 */
export default function AdminUsersPage() {
  return <UserRolesPanel />;
}
