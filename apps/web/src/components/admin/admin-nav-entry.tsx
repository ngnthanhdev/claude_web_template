"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { ApiClientError } from "@/lib/api-client";
import { listAdminUsers } from "@/lib/admin-client";

/**
 * True when the given error is the server's "not authorised" answer — never
 * inferred from anything client-side.
 */
export function isAdminForbiddenError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

export type AdminContextStatus =
  "idle" | "loading" | "admin" | "forbidden" | "error";

/**
 * The shell's only signal for "does this signed-in caller have admin
 * access" — there is no role/claim on the session itself (design §4/§8:
 * the acting principal is only ever resolved server-side), so this issues
 * the same read every admin surface that lacks its own natural data fetch
 * needs anyway (`GET /v1/admin/users`, one row) and treats a successful
 * response as admin context, a `403` as confirmed non-admin, and anything
 * else as a transient error. This never fabricates an "you're an admin"
 * state from client-only data; it only ever reflects what the server guard
 * actually allowed. Customer/seller navigation is entirely unaffected.
 */
export function useAdminContextStatus(): {
  status: AdminContextStatus;
  refetch: () => void;
} {
  const session = useSession();

  const adminContextQuery = useQuery({
    queryKey: ["admin", "nav-context"] as const,
    queryFn: () => listAdminUsers({ limit: 1 }),
    enabled: session.status === "authenticated",
    retry: false,
  });

  const refetch = () => void adminContextQuery.refetch();

  if (session.status !== "authenticated") {
    return { status: "idle", refetch };
  }
  if (adminContextQuery.isSuccess) {
    return { status: "admin", refetch };
  }
  if (adminContextQuery.isError) {
    return {
      status: isAdminForbiddenError(adminContextQuery.error)
        ? "forbidden"
        : "error",
      refetch,
    };
  }
  return { status: "loading", refetch };
}

export function AdminNavEntry() {
  const locale = useLocale();
  const t = useTranslations("Admin.nav");
  const { status } = useAdminContextStatus();

  if (status !== "admin") return null;

  return (
    <Link
      className={buttonVariants({ variant: "ghost" })}
      href={`/${locale}/admin`}
    >
      {t("label")}
    </Link>
  );
}
