import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
] as const;

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@marketplace/shared"],
  // apps/web/src/i18n/request.ts enumerates locale message namespaces with
  // `fs.readdirSync` (kept deliberately so a later task can drop in a new
  // namespace file without editing that loader) against a directory that
  // Next's output-file tracing can't discover on its own, since the call
  // site never spells the target path as a static string literal.
  // Force-include the raw `messages/` directory in the standalone trace so
  // that read keeps working in the `output: "standalone"` production image
  // (apps/web/Dockerfile also copies it explicitly as a backstop).
  outputFileTracingIncludes: {
    "/**": ["./messages/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
} satisfies NextConfig;

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
