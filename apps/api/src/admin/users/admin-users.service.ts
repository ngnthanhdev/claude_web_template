import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  adminUserListResponseSchema,
  adminUserSummarySchema,
  type AdminGrantRoleResponse,
  type AdminRevokeRoleResponse,
  type AdminRoleKey,
  type AdminUserListResponse,
  type AdminUserSummary,
} from "@marketplace/shared/admin";
import { ZodValidationException } from "nestjs-zod";
import { z, ZodError } from "zod";

import { PrismaService } from "../../prisma/prisma.service.js";
import { AdminAuditService } from "../admin-audit.service.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

export const adminUserListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(2_048).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_LIMIT)
      .default(DEFAULT_PAGE_LIMIT),
  })
  .strict();
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

const cursorTupleSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();
type CursorTuple = z.infer<typeof cursorTupleSchema>;

function invalidCursor(): never {
  throw new ZodValidationException(
    new ZodError([
      {
        code: "custom",
        path: ["cursor"],
        message: "Invalid admin user cursor",
      },
    ]),
  );
}

function encodeCursor(tuple: CursorTuple): string {
  return Buffer.from(JSON.stringify(tuple), "utf8").toString("base64url");
}

function decodeCursor(raw: string): CursorTuple {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    invalidCursor();
  }
  const result = cursorTupleSchema.safeParse(parsed);
  if (!result.success) invalidCursor();
  return result.data;
}

/**
 * A user's local-part-derived slug base, lowercased and reduced to the
 * `slugSchema` alphabet (`[a-z0-9]` runs joined by single hyphens). Falls
 * back to a fixed base when the local part yields nothing usable (e.g. an
 * all-symbol local part), and is capped well under the `SellerProfile.slug`
 * `VarChar(100)` column so a numeric-suffix disambiguator below always fits.
 */
const FALLBACK_SLUG_BASE = "seller";
const MAX_SLUG_LENGTH = 100;
const MAX_SLUG_SUFFIX_ATTEMPTS = 1_000;

function slugBaseFromEmail(normalizedEmail: string): string {
  const localPart = normalizedEmail.split("@")[0] ?? "";
  const normalized = localPart
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = normalized.length > 0 ? normalized : FALLBACK_SLUG_BASE;
  return base.slice(0, MAX_SLUG_LENGTH);
}

const roleAssignmentsSelect = {
  id: true,
  normalizedEmail: true,
  roleAssignments: { select: { role: { select: { key: true } } } },
} satisfies Prisma.UserSelect;

function toSummary(
  row: Prisma.UserGetPayload<{ select: typeof roleAssignmentsSelect }>,
): AdminUserSummary {
  return adminUserSummarySchema.parse({
    id: row.id,
    email: row.normalizedEmail,
    roles: row.roleAssignments.map((assignment) => assignment.role.key),
  });
}

/**
 * Admin-scoped user directory + role provisioning (design §4/§8). Every read
 * is PII-minimized (id + normalized email + role keys only). Grants/revokes
 * are idempotent, take the acting admin from the caller only (never a
 * request body), and write exactly one `AdminAuditLog` row per actual state
 * change in the same transaction as that change.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async list(query: AdminUserListQuery): Promise<AdminUserListResponse> {
    const cursorTuple =
      query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    const cursorFilter: Prisma.UserWhereInput | undefined =
      cursorTuple === undefined
        ? undefined
        : {
            OR: [
              { createdAt: { lt: new Date(cursorTuple.createdAt) } },
              {
                createdAt: new Date(cursorTuple.createdAt),
                id: { lt: cursorTuple.id },
              },
            ],
          };

    const rows = await this.prisma.user.findMany({
      where: cursorFilter,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: { ...roleAssignmentsSelect, createdAt: true },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last !== undefined
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null;

    return adminUserListResponseSchema.parse({
      data: page.map(toSummary),
      meta: { nextCursor, hasMore },
    });
  }

  async grantRole(
    actingAdminId: string,
    targetUserId: string,
    role: AdminRoleKey,
  ): Promise<AdminGrantRoleResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (user === null) throw new NotFoundException("User not found");

    const roleRow = await this.findSeededRole(role);

    return this.prisma.$transaction(async (tx) => {
      const existingAssignment = await tx.userRole.findUnique({
        where: { userId_roleId: { userId: targetUserId, roleId: roleRow.id } },
        select: { id: true },
      });

      if (existingAssignment === null) {
        await tx.userRole.create({
          data: { userId: targetUserId, roleId: roleRow.id },
        });
        await this.audit.record(tx, {
          actingAdminId,
          action: "roleGranted",
          targetType: "userRole",
          targetId: targetUserId,
          afterState: { role, userId: targetUserId },
        });
      }

      if (role === "seller") {
        await this.ensureSellerProfile(tx, targetUserId);
      }

      return this.readSummary(tx, targetUserId);
    });
  }

  async revokeRole(
    actingAdminId: string,
    targetUserId: string,
    roleKey: AdminRoleKey,
  ): Promise<AdminRevokeRoleResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (user === null) throw new NotFoundException("User not found");

    const roleRow = await this.findSeededRole(roleKey);

    return this.prisma.$transaction(async (tx) => {
      const existingAssignment = await tx.userRole.findUnique({
        where: { userId_roleId: { userId: targetUserId, roleId: roleRow.id } },
        select: { id: true },
      });

      if (existingAssignment !== null) {
        if (roleKey === "admin" && targetUserId === actingAdminId) {
          const adminAssignmentCount = await tx.userRole.count({
            where: { roleId: roleRow.id },
          });
          if (adminAssignmentCount <= 1) {
            throw new UnprocessableEntityException(
              "Cannot revoke your own last admin role",
            );
          }
        }

        await tx.userRole.delete({ where: { id: existingAssignment.id } });
        // `SellerProfile` (and its products) is intentionally preserved on
        // seller-role revocation — only the `UserRole` grant is removed.
        await this.audit.record(tx, {
          actingAdminId,
          action: "roleRevoked",
          targetType: "userRole",
          targetId: targetUserId,
          beforeState: { roleKey, userId: targetUserId },
        });
      }

      return this.readSummary(tx, targetUserId);
    });
  }

  private async findSeededRole(roleKey: AdminRoleKey): Promise<{ id: string }> {
    const roleRow = await this.prisma.role.findUnique({
      where: { key: roleKey },
      select: { id: true },
    });
    if (roleRow === null) {
      throw new Error(`Missing seeded role for key ${roleKey}`);
    }
    return roleRow;
  }

  private async ensureSellerProfile(
    tx: Prisma.TransactionClient,
    ownerId: string,
  ): Promise<void> {
    const existingProfile = await tx.sellerProfile.findUnique({
      where: { ownerId },
      select: { id: true },
    });
    if (existingProfile !== null) return;

    const owner = await tx.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { normalizedEmail: true },
    });
    const slug = await this.generateUniqueSellerSlug(tx, owner.normalizedEmail);
    await tx.sellerProfile.create({ data: { ownerId, slug } });
  }

  private async generateUniqueSellerSlug(
    tx: Prisma.TransactionClient,
    normalizedEmail: string,
  ): Promise<string> {
    const base = slugBaseFromEmail(normalizedEmail);
    let candidate = base;
    for (let suffix = 2; suffix <= MAX_SLUG_SUFFIX_ATTEMPTS; suffix += 1) {
      const existing = await tx.sellerProfile.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (existing === null) return candidate;

      const suffixText = `-${suffix}`;
      candidate = `${base.slice(0, MAX_SLUG_LENGTH - suffixText.length)}${suffixText}`;
    }
    throw new Error("Unable to generate a unique seller profile slug");
  }

  private async readSummary(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<AdminUserSummary> {
    const row = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: roleAssignmentsSelect,
    });
    return toSummary(row);
  }
}
