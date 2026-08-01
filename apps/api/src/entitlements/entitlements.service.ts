import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  downloadIssueResponseSchema,
  entitlementSchema,
  libraryResponseSchema,
  type DownloadIssueResponse,
  type LibraryResponse,
} from "@marketplace/shared/commerce";
import { ZodValidationException } from "nestjs-zod";
import { z, ZodError } from "zod";

import { PrismaService } from "../prisma/prisma.service.js";
import { DownloadAuditService } from "./downloads/download-audit.service.js";
import { STORAGE_PORT, type StoragePort } from "./downloads/storage.port.js";

const libraryCursorSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();

export interface LibraryQuery {
  readonly cursor?: string;
  readonly limit: number;
}

export interface DownloadIssueRequestBody {
  readonly productId: string;
  readonly version: string;
}

function invalidCursor(): never {
  throw new ZodValidationException(
    new ZodError([
      { code: "custom", path: ["cursor"], message: "Invalid library cursor" },
    ]),
  );
}

function decodeLibraryCursor(cursor: string): { createdAt: Date; id: string } {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    invalidCursor();
  }
  const parsed = libraryCursorSchema.safeParse(decoded);
  if (!parsed.success) invalidCursor();
  return { createdAt: new Date(parsed.data.createdAt), id: parsed.data.id };
}

function encodeLibraryCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

@Injectable()
export class EntitlementsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(DownloadAuditService)
    private readonly downloadAudit: DownloadAuditService,
  ) {}

  async listLibrary(
    userId: string,
    query: LibraryQuery,
  ): Promise<LibraryResponse> {
    const cursorTuple =
      query.cursor === undefined
        ? undefined
        : decodeLibraryCursor(query.cursor);

    const rows = await this.prisma.entitlement.findMany({
      where: {
        userId,
        ...(cursorTuple === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursorTuple.createdAt } },
                {
                  createdAt: cursorTuple.createdAt,
                  id: { lt: cursorTuple.id },
                },
              ],
            }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: { id: true, productId: true, version: true, createdAt: true },
    });

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const data = pageRows.map((row) =>
      entitlementSchema.parse({
        id: row.id,
        productId: row.productId,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
      }),
    );
    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last !== undefined
        ? encodeLibraryCursor(last.createdAt, last.id)
        : null;

    return libraryResponseSchema.parse({ data, meta: { nextCursor, hasMore } });
  }

  async issueDownload(
    userId: string,
    entitlementId: string,
    body: DownloadIssueRequestBody,
    request: { readonly ip: string },
  ): Promise<DownloadIssueResponse> {
    const entitlement = await this.prisma.entitlement.findFirst({
      where: { id: entitlementId, userId },
      select: { id: true, userId: true, productId: true, version: true },
    });
    if (
      entitlement === null ||
      entitlement.productId !== body.productId ||
      entitlement.version !== body.version
    ) {
      throw new NotFoundException("Entitlement not found");
    }

    // Re-verify the exact (product, version) still resolves to a real,
    // published artifact version before signing — design §9 "Download issue
    // / Elevation (BOLA/IDOR)".
    const grantedVersion = await this.prisma.productVersion.findUnique({
      where: {
        productId_version: {
          productId: entitlement.productId,
          version: entitlement.version,
        },
      },
      select: { productId: true },
    });
    if (grantedVersion === null) {
      throw new NotFoundException("Entitlement not found");
    }

    const decision = await this.downloadAudit.recordIssuance({
      userId,
      entitlementId: entitlement.id,
      productId: entitlement.productId,
      version: entitlement.version,
      ip: request.ip,
    });
    if (!decision.allowed) {
      throw new HttpException(
        "Too many download attempts",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const issued = await this.storage.issueDownload(
      { id: entitlement.id, userId: entitlement.userId },
      { id: entitlement.productId },
      entitlement.version,
    );

    return downloadIssueResponseSchema.parse({
      url: issued.url,
      expiresAt: issued.expiresAt.toISOString(),
    });
  }
}
