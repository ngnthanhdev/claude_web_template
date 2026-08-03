import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AdminAuditAction, AdminAuditTargetType } from "@prisma/client";

/**
 * The ONLY field names allowed into an audit row's `beforeState`/`afterState`.
 * This is a fail-closed allowlist, not a deny-list: `AdminAuditLog` is
 * append-only and immutable (design §7), so a secret or PII written by mistake
 * can never be scrubbed — anything not explicitly listed here is dropped
 * rather than trusted. These are the non-sensitive domain fields an admin
 * action legitimately records: state enums, the role key, non-secret
 * identifiers, the reject `reason` recorded per §7, and the verified-artifact
 * `checksum` reference (never the signature). Adding a new audited field is a
 * conscious edit here.
 *
 * Callers MUST pass a curated, flat map of JSON primitives; nested objects and
 * non-primitive values (`Date`/`Decimal`/`Buffer`/etc.) are dropped, so a
 * whole Prisma entity handed in by mistake cannot smuggle a secret through.
 */
const ALLOWED_AUDIT_FIELDS = new Set([
  "reviewState",
  "publicationState",
  "role",
  "roleKey",
  "reason",
  "checksum",
  "confirmedAt",
  "type",
  "version",
  "productId",
  "userId",
  "factorId",
]);

type AuditJsonPrimitive = string | number | boolean | null;

function isJsonPrimitive(value: unknown): value is AuditJsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function toJsonInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;

  const projected: Record<string, AuditJsonPrimitive> = {};
  for (const [key, entry] of Object.entries(value)) {
    // Fail closed: only an allowlisted key carrying a JSON primitive survives.
    // Unlisted keys, nested objects, and non-primitive values are dropped so
    // nothing sensitive can reach the immutable log.
    if (!ALLOWED_AUDIT_FIELDS.has(key)) continue;
    if (!isJsonPrimitive(entry)) continue;
    projected[key] = entry;
  }
  return projected as Prisma.InputJsonValue;
}

export interface AdminAuditEntry {
  readonly actingAdminId: string;
  readonly action: AdminAuditAction;
  readonly targetType: AdminAuditTargetType;
  readonly targetId: string;
  readonly beforeState?: Record<string, unknown> | null;
  readonly afterState?: Record<string, unknown> | null;
  readonly requestId?: string | null;
}

/**
 * Writes exactly one append-only `AdminAuditLog` row per call, always inside
 * a caller-provided Prisma transaction (design §7) so an admin action and
 * its audit row commit or roll back together. Exposes no update/delete
 * method — the log is write-once by construction, not by convention alone.
 */
@Injectable()
export class AdminAuditService {
  record(
    tx: Prisma.TransactionClient,
    entry: AdminAuditEntry,
  ): Promise<{ id: string }> {
    return tx.adminAuditLog.create({
      data: {
        actingAdminId: entry.actingAdminId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        beforeState: toJsonInput(entry.beforeState),
        afterState: toJsonInput(entry.afterState),
        requestId: entry.requestId ?? null,
      },
      select: { id: true },
    });
  }
}
