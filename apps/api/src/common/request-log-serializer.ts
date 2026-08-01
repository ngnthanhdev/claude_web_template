import type { FastifyRequest } from "fastify";

/**
 * Matches only the single-use download token segment of
 * `GET /v1/downloads/token/:token` (design §9 "Signed download URL / Info
 * disclosure"). Exported so callers that need to mask the same segment
 * elsewhere (or assert on it in a test) share this one pattern instead of
 * keeping their own copy that could drift from what the serializer below
 * actually masks.
 */
export const DOWNLOAD_TOKEN_URL_PATTERN = /(\/v1\/downloads\/token\/)[^/?#]+/;

// `extends Record<string, unknown>` gives this interface the index
// signature Fastify's own `FastifyServerOptions["logger"]["serializers"]["req"]`
// return type declares (so a value of this type can flow back through it) —
// each named field below still keeps its own precise type.
export interface RequestLogFields extends Record<string, unknown> {
  method: string;
  url: string;
  hostname: string;
  remoteAddress: string | undefined;
  remotePort: number | undefined;
}

/**
 * The access-log request serializer wired into Fastify's logger at bootstrap
 * (`main.ts`) and reused verbatim by the composed commerce-flow integration
 * suite, so the two can never drift apart. Masks only the download-token
 * path segment; every other request URL logs untouched. Preserves the rest
 * of the fields Fastify's own default `logger: true` request serializer
 * would have logged (`method`, `hostname`, `remoteAddress`, `remotePort`) —
 * this replaces that default only to add the token mask, not to drop
 * observability fields an operator would otherwise rely on.
 */
export function requestLogSerializer(
  request: FastifyRequest,
): RequestLogFields {
  return {
    method: request.method,
    url: request.url.replace(DOWNLOAD_TOKEN_URL_PATTERN, "$1[redacted]"),
    hostname: request.hostname,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  };
}
