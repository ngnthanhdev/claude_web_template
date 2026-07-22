import type { FastifyRequest } from "fastify";

import type { ResolvedSession } from "../core/auth-session.service.js";

const SESSION_CONTEXT = Symbol("kitvera.session-context");

interface SessionAuthenticationProof {
  readonly rawSessionToken: string;
  readonly csrfHash: string;
}

interface InternalSessionContext {
  readonly resolved: ResolvedSession;
  readonly proof?: SessionAuthenticationProof;
}

export interface SessionRequest extends FastifyRequest {
  [SESSION_CONTEXT]?: InternalSessionContext;
}

export function attachSessionContext(
  request: SessionRequest,
  resolved: ResolvedSession,
  proof?: SessionAuthenticationProof,
): void {
  Object.defineProperty(request, SESSION_CONTEXT, {
    configurable: false,
    enumerable: false,
    value: { resolved, proof } satisfies InternalSessionContext,
    writable: false,
  });
}

export function getResolvedSession(request: SessionRequest): ResolvedSession {
  const context = request[SESSION_CONTEXT];
  if (context === undefined) {
    throw new Error("Authenticated session context is unavailable");
  }
  return context.resolved;
}

export function getSessionAuthenticationProof(
  request: SessionRequest,
): SessionAuthenticationProof {
  const context = request[SESSION_CONTEXT];
  if (context?.proof === undefined) {
    throw new Error("Authenticated session proof is unavailable");
  }
  return context.proof;
}
