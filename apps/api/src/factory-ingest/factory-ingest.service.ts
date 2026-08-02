import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  FactoryArtifactIngestRequest,
  FactoryArtifactIngestResponse,
} from "@marketplace/shared/seller";

import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Records a factory-signed build artifact against its addressed
 * `ProductVersion` (design §2/§4/§6). Links provenance only — it never
 * executes a build, runs a shell command, or fetches the artifact's bytes.
 * Never mutates `reviewState`/`publicationState` (approval/publish stay an
 * admin-only gate, out of this service's reach entirely).
 */
@Injectable()
export class FactoryIngestService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ingest(
    request: FactoryArtifactIngestRequest,
  ): Promise<FactoryArtifactIngestResponse> {
    const productVersion = await this.prisma.productVersion.findUnique({
      where: {
        productId_version: {
          productId: request.productId,
          version: request.version,
        },
      },
    });
    if (productVersion === null) {
      throw new NotFoundException("Product version not found");
    }

    const existing = await this.prisma.buildRun.findUnique({
      where: {
        productVersionId_factoryRunId: {
          productVersionId: productVersion.id,
          factoryRunId: request.factoryRunId,
        },
      },
      include: { artifact: true },
    });

    if (existing !== null) {
      return this.replay(request, existing);
    }

    return this.create(request, productVersion.id);
  }

  /**
   * A replay of an already-ingested `(productVersionId, factoryRunId)` never
   * writes again — it either returns the exact record already stored
   * (idempotent) or rejects a checksum that disagrees with that immutable
   * record (design §4/§6 tamper rejection). Never overwrites the stored
   * checksum either way.
   */
  private replay(
    request: FactoryArtifactIngestRequest,
    existing: Prisma.BuildRunGetPayload<{ include: { artifact: true } }>,
  ): FactoryArtifactIngestResponse {
    if (
      existing.artifact === null ||
      existing.artifact.checksum !== request.checksum
    ) {
      throw new UnprocessableEntityException(
        "Ingest payload does not match the recorded artifact",
      );
    }

    return {
      artifactId: existing.artifact.id,
      buildRunId: existing.id,
      productId: request.productId,
      version: request.version,
      recordedAt: existing.artifact.producedAt.toISOString(),
    };
  }

  private async create(
    request: FactoryArtifactIngestRequest,
    productVersionId: string,
  ): Promise<FactoryArtifactIngestResponse> {
    const producedAt = new Date(request.producedAt);

    try {
      const { artifact, buildRun } = await this.prisma.$transaction(
        async (tx) => {
          const artifact = await tx.artifact.create({
            data: {
              productVersionId,
              storageId: request.storageId,
              checksum: request.checksum,
              signature: request.signature,
              sizeBytes: BigInt(request.sizeBytes),
              producedAt,
              factoryRunId: request.factoryRunId,
            },
          });
          const buildRun = await tx.buildRun.create({
            data: {
              productVersionId,
              status: "succeeded",
              startedAt: producedAt,
              finishedAt: producedAt,
              factoryRunId: request.factoryRunId,
              artifactId: artifact.id,
              qaVerdict: request.qaVerdict,
              scanVerdict: request.scanVerdict,
            },
          });
          return { artifact, buildRun };
        },
      );

      return {
        artifactId: artifact.id,
        buildRunId: buildRun.id,
        productId: request.productId,
        version: request.version,
        recordedAt: artifact.producedAt.toISOString(),
      };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // Under at-least-once delivery a concurrent retry of the *same*
        // `factoryRunId` can race this create: both pass the pre-check, one
        // commits, and the loser lands here. Re-read the row for this exact
        // run — if it now exists, this is that idempotent replay, so return
        // 200 (or reject a checksum that disagrees with the committed
        // record) rather than the 422 reserved for a *different* run
        // colliding with the version's taken 1:1 artifact slot.
        const raced = await this.prisma.buildRun.findUnique({
          where: {
            productVersionId_factoryRunId: {
              productVersionId,
              factoryRunId: request.factoryRunId,
            },
          },
          include: { artifact: true },
        });
        if (raced !== null) {
          return this.replay(request, raced);
        }
        throw new UnprocessableEntityException(
          "Product version already has a recorded artifact",
        );
      }
      throw error;
    }
  }
}
