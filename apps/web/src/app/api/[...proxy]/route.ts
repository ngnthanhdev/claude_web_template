import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin proxy for the API.
 *
 * The browser only ever calls this app's own origin (`/api/v1/...`); it
 * never learns the real API origin or talks to it directly. This route
 * reads the server-only `API_ORIGIN` env var (never `NEXT_PUBLIC_*`, so it
 * never reaches the client bundle) and forwards allowlisted `/v1/*` calls to
 * it, forwarding `Cookie`/`Set-Cookie` and `X-CSRF-Token` both ways.
 */

export const dynamic = "force-dynamic";

const ALLOWED_PATH_PREFIX = "/v1/";

const FORWARDED_REQUEST_HEADERS = ["cookie", "x-csrf-token", "content-type"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "x-csrf-token"];
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

type RouteContext = { params: Promise<{ proxy: string[] }> };

function jsonError(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function resolveApiOrigin(): URL | null {
  const apiOrigin = process.env.API_ORIGIN;
  if (!apiOrigin) return null;

  try {
    const originUrl = new URL(apiOrigin);
    return originUrl.protocol === "http:" || originUrl.protocol === "https:"
      ? originUrl
      : null;
  } catch {
    return null;
  }
}

function buildTargetUrl(
  apiOrigin: URL,
  segments: readonly string[],
  search: string,
): URL {
  const encodedPath = segments.map(encodeURIComponent).join("/");
  return new URL(`/${encodedPath}${search}`, apiOrigin);
}

function isAllowedTarget(apiOrigin: URL, targetUrl: URL): boolean {
  return (
    targetUrl.origin === apiOrigin.origin &&
    targetUrl.pathname.startsWith(ALLOWED_PATH_PREFIX)
  );
}

/** Reads every `Set-Cookie` value, even across runtimes without `getSetCookie`. */
function readSetCookies(headers: Headers): string[] {
  const headersWithGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headersWithGetSetCookie.getSetCookie === "function") {
    return headersWithGetSetCookie.getSetCookie();
  }

  const singleValue = headers.get("set-cookie");
  return singleValue ? [singleValue] : [];
}

function buildForwardedRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  headers.set("accept", "application/json");

  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(headerName);
    if (value !== null) headers.set(headerName, value);
  }

  return headers;
}

function buildForwardedResponseHeaders(upstreamResponse: Response): Headers {
  const headers = new Headers();

  for (const headerName of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamResponse.headers.get(headerName);
    if (value !== null) headers.set(headerName, value);
  }

  for (const setCookie of readSetCookies(upstreamResponse.headers)) {
    headers.append("set-cookie", setCookie);
  }

  return headers;
}

async function forward(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const apiOrigin = resolveApiOrigin();
  if (!apiOrigin) {
    return jsonError(
      500,
      "PROXY_MISCONFIGURED",
      "The API origin is not configured.",
    );
  }

  const { proxy: segments } = await context.params;
  const targetUrl = buildTargetUrl(apiOrigin, segments, request.nextUrl.search);
  if (!isAllowedTarget(apiOrigin, targetUrl)) {
    return jsonError(404, "NOT_FOUND", "Not found.");
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const rawBody = hasBody ? await request.text() : undefined;

  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers: buildForwardedRequestHeaders(request),
    body: rawBody === "" ? undefined : rawBody,
    redirect: "manual",
  });

  const responseHeaders = buildForwardedResponseHeaders(upstreamResponse);
  if (NULL_BODY_STATUSES.has(upstreamResponse.status)) {
    return new NextResponse(null, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  }

  const responseBody = await upstreamResponse.arrayBuffer();
  return new NextResponse(responseBody, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return forward(request, context);
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return forward(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return forward(request, context);
}
