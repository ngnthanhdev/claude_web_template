import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { localeCookieName, resolvePreferredLocale, routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

function createContentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export default function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = createContentSecurityPolicy(nonce);
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
      : handleI18nRouting(new NextRequest(request, { headers: requestHeaders }));
  response.headers.set("content-security-policy", contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
