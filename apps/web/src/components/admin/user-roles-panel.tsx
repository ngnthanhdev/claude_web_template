"use client";

import type {
  AdminRoleKey,
  AdminUserListResponse,
  AdminUserSummary,
} from "@shared/admin";
import { adminRoleKeySchema } from "@shared/admin";
import { localeSchema } from "@shared/localization";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import {
  grantAdminRole,
  listAdminUsers,
  revokeAdminRole,
} from "@/lib/admin-client";

import { isAdminForbiddenError } from "./admin-nav-entry";

const ADMIN_USERS_PAGE_SIZE = 20;
const ALL_ROLE_KEYS = adminRoleKeySchema.options;
const ADMIN_USERS_QUERY_KEY = ["admin", "users"] as const;

function grantableRoles(user: AdminUserSummary): AdminRoleKey[] {
  return ALL_ROLE_KEYS.filter((role) => !user.roles.includes(role));
}

function GrantRoleControl({
  user,
  csrfToken,
  onGranted,
}: {
  user: AdminUserSummary;
  csrfToken: string;
  onGranted: (updated: AdminUserSummary) => void;
}) {
  const t = useTranslations("Admin.users");
  const tRoles = useTranslations("Admin.roles");
  const selectId = useId();
  const options = grantableRoles(user);
  const [selectedRole, setSelectedRole] = useState<AdminRoleKey | "">(
    options[0] ?? "",
  );

  const grantMutation = useMutation({
    mutationFn: (role: AdminRoleKey) =>
      grantAdminRole(user.id, { role }, csrfToken),
    onSuccess: onGranted,
  });

  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={selectId}>
        {t("grantLabel")}
      </label>
      <select
        className="h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        id={selectId}
        onChange={(event) =>
          setSelectedRole(event.target.value as AdminRoleKey)
        }
        value={selectedRole}
      >
        {options.map((role) => (
          <option key={role} value={role}>
            {tRoles(role)}
          </option>
        ))}
      </select>
      <Button
        disabled={grantMutation.isPending || selectedRole === ""}
        onClick={() => {
          if (selectedRole === "") return;
          grantMutation.mutate(selectedRole);
        }}
        type="button"
        variant="outline"
      >
        {grantMutation.isPending ? t("granting") : t("grantAction")}
      </Button>
      {grantMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("grantError")}
        </p>
      ) : null}
    </div>
  );
}

function RoleChip({
  user,
  role,
  csrfToken,
  onRevoked,
}: {
  user: AdminUserSummary;
  role: AdminRoleKey;
  csrfToken: string;
  onRevoked: (updated: AdminUserSummary) => void;
}) {
  const t = useTranslations("Admin.users");
  const tRoles = useTranslations("Admin.roles");

  const revokeMutation = useMutation({
    mutationFn: () => revokeAdminRole(user.id, role, csrfToken),
    onSuccess: onRevoked,
  });

  return (
    <li className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground">
        <span>{tRoles(role)}</span>
        <Button
          disabled={revokeMutation.isPending}
          onClick={() => revokeMutation.mutate()}
          type="button"
          variant="ghost"
        >
          {revokeMutation.isPending ? t("revoking") : t("revokeAction")}
        </Button>
      </div>
      {revokeMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("revokeError")}
        </p>
      ) : null}
    </li>
  );
}

function UserRow({
  user,
  csrfToken,
  onUpdated,
}: {
  user: AdminUserSummary;
  csrfToken: string;
  onUpdated: (updated: AdminUserSummary) => void;
}) {
  const t = useTranslations("Admin.users");

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-background p-4">
      <span className="font-medium text-foreground">{user.email}</span>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">{t("rolesLabel")}</span>
        {user.roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noRoles")}</p>
        ) : (
          <ul className="flex flex-wrap items-center gap-2">
            {user.roles.map((role) => (
              <RoleChip
                csrfToken={csrfToken}
                key={role}
                onRevoked={onUpdated}
                role={role}
                user={user}
              />
            ))}
          </ul>
        )}
      </div>
      <GrantRoleControl
        csrfToken={csrfToken}
        onGranted={onUpdated}
        user={user}
      />
    </li>
  );
}

/**
 * `/[locale]/admin/users`: the PII-minimized user directory (normalized
 * email + assigned role keys only, design §4/§8) with grant/revoke controls
 * for the `seller`/`admin` role allowlist. This client-side gate is
 * cosmetic only — the `admin` role guard on the server is the real
 * authority, so a non-admin who reaches this page never sees fabricated
 * data, only the honest `403` state below.
 */
export function UserRolesPanel() {
  const locale = localeSchema.parse(useLocale());
  const router = useRouter();
  const t = useTranslations("Admin.users");
  const session = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/${locale}/auth/sign-in`);
    }
  }, [session.status, locale, router]);

  const usersQuery = useInfiniteQuery({
    queryKey: ADMIN_USERS_QUERY_KEY,
    queryFn: ({ pageParam }) =>
      listAdminUsers({ cursor: pageParam, limit: ADMIN_USERS_PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore
        ? (lastPage.meta.nextCursor ?? undefined)
        : undefined,
    enabled: session.status === "authenticated",
    retry: false,
  });

  if (session.status === "loading" || session.status === "unauthenticated") {
    return (
      <p role="status">
        {t(session.status === "loading" ? "loading" : "redirecting")}
      </p>
    );
  }

  if (session.status === "error") {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)]"
        role="alert"
      >
        <p className="text-base font-semibold text-foreground">
          {t("error.heading")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("error.description")}
        </p>
        <Button onClick={session.refetch} type="button" variant="outline">
          {t("error.action")}
        </Button>
      </div>
    );
  }

  if (usersQuery.isLoading) {
    return <p role="status">{t("loading")}</p>;
  }

  if (usersQuery.isError) {
    if (isAdminForbiddenError(usersQuery.error)) {
      return (
        <div
          className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)]"
          role="alert"
        >
          <p className="text-base font-semibold text-foreground">
            {t("forbidden.heading")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("forbidden.description")}
          </p>
        </div>
      );
    }

    return (
      <div
        className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-border p-[var(--space-2xl)]"
        role="alert"
      >
        <p className="text-base font-semibold text-foreground">
          {t("error.heading")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("error.description")}
        </p>
        <Button
          onClick={() => usersQuery.refetch()}
          type="button"
          variant="outline"
        >
          {t("error.action")}
        </Button>
      </div>
    );
  }

  const users = usersQuery.data?.pages.flatMap((page) => page.data) ?? [];

  function updateUserCache(updated: AdminUserSummary) {
    queryClient.setQueryData<InfiniteData<AdminUserListResponse>>(
      ADMIN_USERS_QUERY_KEY,
      (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            data: page.data.map((user) =>
              user.id === updated.id ? updated : user,
            ),
          })),
        };
      },
    );
  }

  return (
    <section
      aria-labelledby="admin-users-heading"
      className="flex flex-col gap-6"
    >
      <h1
        className="text-2xl font-semibold text-foreground"
        id="admin-users-heading"
      >
        {t("heading")}
      </h1>
      {users.length === 0 ? (
        <p role="status">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {users.map((user) => (
            <UserRow
              csrfToken={session.csrfToken}
              key={user.id}
              onUpdated={updateUserCache}
              user={user}
            />
          ))}
        </ul>
      )}
      {usersQuery.hasNextPage ? (
        <Button
          disabled={usersQuery.isFetchingNextPage}
          onClick={() => void usersQuery.fetchNextPage()}
          type="button"
          variant="outline"
        >
          {t("loadMore")}
        </Button>
      ) : null}
    </section>
  );
}
