export const SESSION_COOKIE_NAME = "__Host-kitvera_session";

const sessionCookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: true,
} as const;

export interface SessionCookieReply {
  setCookie(
    name: string,
    value: string,
    options: typeof sessionCookieOptions,
  ): unknown;
  clearCookie(name: string, options: typeof sessionCookieOptions): unknown;
}

export function setSessionCookie(
  reply: SessionCookieReply,
  rawSessionToken: string,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, rawSessionToken, sessionCookieOptions);
}

export function clearSessionCookie(reply: SessionCookieReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
}
