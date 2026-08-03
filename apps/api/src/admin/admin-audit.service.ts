import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AdminAuditAction, AdminAuditTargetType } from "@prisma/client";

/**
 * Field names stripped from `beforeState`/`afterState` at every nesting
 * level before an audit row is written — secrets and PII must never reach
 * the append-only log (design §7/§8), even if a caller forgets to redact
 * before calling `record`.
 */
const REDACTED_FIELD_NAMES = new Set([
  "encryptedSecret",
  "secret",
  "codeHash",
  "recoveryCodes",
  "otpauthUri",
  "email",
  "normalizedEmail",
  "signature",
]);

function toJsonInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return redact(value) as Prisma.InputJsonValue;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value !== null && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (REDACTED_FIELD_NAMES.has(key)) continue;
      redacted[key] = redact(entry);
    }
    return redacted;
  }
  return value;
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
