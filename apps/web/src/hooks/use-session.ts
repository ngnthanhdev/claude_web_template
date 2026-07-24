"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { ApiClientError } from "@/lib/api-client";
import {
  getCurrentSession,
  logoutAllSessions,
  logoutCurrentSession,
} from "@/lib/auth-client";
import type { SafeSession, SessionUser } from "@shared/auth";

/**
 * The single query key every `useSession` caller shares, so the
 * current-session read and both revocation mutations always agree on one
 * cached truth instead of each component tracking its own copy.
 */
export const sessionQueryKey = ["session", "current"] as const;

function isUnauthenticatedError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

interface SessionActionsState {
  /** Revokes only this device's session. A no-op until the session has loaded. */
  signOut: () => void;
  /** Revokes every session owned by the account. A no-op until the session has loaded. */
  signOutAll: () => void;
  isSigningOutCurrent: boolean;
  isSigningOutAll: boolean;
  signOutError: Error | null;
  refetch: () => void;
}

export type UseSessionResult = SessionActionsState &
  (
    | {
        status: "loading";
        user: undefined;
        session: undefined;
        csrfToken: undefined;
      }
    | {
        status: "unauthenticated";
        user: undefined;
        session: undefined;
        csrfToken: undefined;
      }
    | {
        status: "error";
        user: undefined;
        session: undefined;
        csrfToken: undefined;
      }
    | {
        status: "authenticated";
        user: SessionUser;
        session: SafeSession;
        csrfToken: string;
      }
  );

/**
 * Centralizes the current-session read (`GET /v1/sessions/current`) and
 * both revocation actions behind one TanStack Query cache entry, so every
 * account surface that calls this hook (the account panel, the sign-out
 * controls) reads and mutates the exact same in-memory session/CSRF state
 * instead of each issuing its own fetch. That state lives only in this
 * query's cache for as long as the tab is open — it is never written to
 * `localStorage`, `sessionStorage`, or a URL.
 */
export function useSession(): UseSessionResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: getCurrentSession,
    // A 401 here means "not signed in", not a transient failure — retrying
    // it would just repeat the same answer.
    retry: false,
  });

  // Both revocation endpoints clear the session cookie server-side.
  // Re-checking afterward re-validates that truth (flipping `status` to
  // `"unauthenticated"`) instead of this hook guessing at the outcome.
  const invalidateSession = useCallback(
    () => queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
    [queryClient],
  );

  const signOutMutation = useMutation({
    mutationFn: (csrfToken: string) => logoutCurrentSession(csrfToken),
    onSuccess: invalidateSession,
  });

  const signOutAllMutation = useMutation({
    mutationFn: (csrfToken: string) => logoutAllSessions(csrfToken),
    onSuccess: invalidateSession,
  });

  const csrfToken = query.data?.csrfToken;
  const actions: SessionActionsState = {
    signOut: () => {
      if (csrfToken) signOutMutation.mutate(csrfToken);
    },
    signOutAll: () => {
      if (csrfToken) signOutAllMutation.mutate(csrfToken);
    },
    isSigningOutCurrent: signOutMutation.isPending,
    isSigningOutAll: signOutAllMutation.isPending,
    signOutError: signOutMutation.error ?? signOutAllMutation.error,
    refetch: () => void query.refetch(),
  };

  if (query.status === "pending") {
    return {
      ...actions,
      status: "loading",
      user: undefined,
      session: undefined,
      csrfToken: undefined,
    };
  }

  if (query.status === "error") {
    return {
      ...actions,
      status: isUnauthenticatedError(query.error) ? "unauthenticated" : "error",
      user: undefined,
      session: undefined,
      csrfToken: undefined,
    };
  }

  return {
    ...actions,
    status: "authenticated",
    user: query.data.user,
    session: query.data.session,
    csrfToken: query.data.csrfToken,
  };
}
