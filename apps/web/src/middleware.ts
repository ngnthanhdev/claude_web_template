import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import {
  localeCookieName,
  resolvePreferredLocale,
  routing,
} from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

/**
 * Parses a configured URL down to a bare origin (scheme://host[:port]) for
 * safe interpolation into a CSP directive, rejecting anything that isn't a
 * well-formed http(s) URL. This also strips any path/query so a
 * misconfigured value can't inject extra CSP tokens.
 */
function resolveConfiguredOrigin(
  configuredUrl: string | undefined,
): string | undefined {
  if (!configuredUrl) return undefined;

  try {
    const url = new URL(configuredUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `connect-src` is unconditionally `'self'`: the browser only ever calls
 * this app's own same-origin proxy (`/api/v1/*`), never the real API origin
 * directly, so there is nothing else to allowlist here.
 *
 * `frame-src` is scoped to a single configured preview origin
 * (`PREVIEW_ORIGIN`, server-only — never hard-coded, never `NEXT_PUBLIC_`).
 * Product preview URLs are validated only as "some public HTTP(S) URL"
 * (packages/shared/src/catalogue.ts), so per-product preview origins can't
 * be enumerated here; this allows exactly one preview host application-wide
 * and blocks all framing when it isn't configured. A future per-product
 * allowlist would need a registry of vetted preview origins, not a single
 * static one.
 */
export function createContentSecurityPolicy(
  nonce: string,
  previewOrigin: string | undefined,
) {
  const configuredPreviewOrigin = resolveConfiguredOrigin(previewOrigin);

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    `frame-src ${configuredPreviewOrigin ?? "'none'"}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export default function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = createContentSecurityPolicy(
    nonce,
    process.env.PREVIEW_ORIGIN,
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);
  requestHeaders.set("x-nonce", nonce);

  const response =
    request.nextUrl.pathname === "/"
      ? NextResponse.redirect(
          new URL(
            `/${resolvePreferredLocale(
              request.cookies.get(localeCookieName)?.value,
              request.headers.get("accept-language"),
            )}${request.nextUrl.search}`,
            request.url,
          ),
        )
      : handleI18nRouting(
          new NextRequest(request, { headers: requestHeaders }),
        );
  response.headers.set("content-security-policy", contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
