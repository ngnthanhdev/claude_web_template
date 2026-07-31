#!/usr/bin/env node
// Guards that every pnpm audit-ignore exception stays reachable through
// DEV/build tooling only — never through a production dependency of any app.
//
// Why this exists: `pnpm.auditConfig.ignoreGhsas` mutes an advisory across the
// WHOLE dependency graph, not just the dev path it was excepted for. So a GHSA
// we ignore today (because it only affects vitest/vite/eslint/etc.) would keep
// passing the blocking `pnpm audit --audit-level=high` even if a future runtime
// dependency of apps/api or apps/web later pulled in the same vulnerable
// package. This guard re-runs the audit against ONLY the production graph with
// the ignore list temporarily disabled, then fails if any ignored advisory is
// reachable there — the exact case a global-scope ignore would otherwise hide.
//
// Test seam: set AUDIT_IGNORE_GUARD_FIXTURE=<path> to read the audit report
// from a fixture JSON instead of invoking pnpm, so the fail path is verifiable
// without a live vulnerable production dependency.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const packageJsonUrl = new URL("../package.json", import.meta.url);

/** GHSAs currently muted for dev-only reasons (source of truth: package.json). */
function readIgnoredGhsas() {
  const pkg = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
  return new Set(pkg.pnpm?.auditConfig?.ignoreGhsas ?? []);
}

/**
 * Audit report for the PRODUCTION graph with the ignore list disabled. pnpm's
 * `auditConfig.ignoreGhsas` filters muted advisories out of the report even
 * with `--prod`, so temporarily strip it, run the audit, and always restore the
 * exact original bytes.
 */
function prodAuditWithoutIgnores() {
  const fixture = process.env.AUDIT_IGNORE_GUARD_FIXTURE;
  if (fixture) return JSON.parse(readFileSync(fixture, "utf8"));

  const original = readFileSync(packageJsonUrl, "utf8");
  try {
    const pkg = JSON.parse(original);
    if (pkg.pnpm?.auditConfig) delete pkg.pnpm.auditConfig;
    writeFileSync(packageJsonUrl, `${JSON.stringify(pkg, null, 2)}\n`);

    // `pnpm audit` exits non-zero when it finds advisories; capture stdout either way.
    let stdout;
    try {
      stdout = execFileSync("pnpm", ["audit", "--prod", "--json"], { encoding: "utf8" });
    } catch (error) {
      stdout = error.stdout ?? "";
    }
    return JSON.parse(stdout);
  } finally {
    writeFileSync(packageJsonUrl, original);
  }
}

const ignored = readIgnoredGhsas();
if (ignored.size === 0) {
  console.log("audit-ignore guard: no ignoreGhsas entries — nothing to check.");
  process.exit(0);
}

let report;
try {
  report = prodAuditWithoutIgnores();
} catch (error) {
  console.error(`audit-ignore guard: could not obtain the production audit report — ${error.message}`);
  process.exit(2);
}

const advisories = Object.values(report.advisories ?? {});
const masked = advisories.filter((advisory) =>
  ignored.has(advisory.github_advisory_id ?? advisory.id),
);

if (masked.length === 0) {
  console.log(
    `audit-ignore guard: OK — all ${ignored.size} ignoreGhsas exception(s) are dev-only; none is reachable through the production graph.`,
  );
  process.exit(0);
}

console.error(
  "audit-ignore guard: FAIL — an ignoreGhsas exception is reachable through the PRODUCTION dependency graph.",
);
console.error(
  "A global-scope ignore would hide this from the blocking `pnpm audit`. Remove the ignore and upgrade/override the dependency, or narrow the exposure.",
);
for (const advisory of masked) {
  const id = advisory.github_advisory_id ?? advisory.id;
  const paths = [...new Set((advisory.findings ?? []).flatMap((finding) => finding.paths ?? []))];
  console.error(`\n  ${String(advisory.severity).toUpperCase()} ${id} — ${advisory.module_name}`);
  for (const path of paths.slice(0, 5)) console.error(`    ${path}`);
}
process.exit(1);
