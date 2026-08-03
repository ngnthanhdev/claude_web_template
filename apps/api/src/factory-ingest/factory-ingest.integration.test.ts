import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { apiErrorSchema } from "@marketplace/shared/api";
import { factoryArtifactIngestResponseSchema } from "@marketplace/shared/seller";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApp } from "../bootstrap/configure-app.js";
import type { Env } from "../config/env.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { FactoryIngestModule } from "./factory-ingest.module.js";
import {
  canonicalFactoryIngestPayload,
  signFactoryIngestPayload,
} from "./factory-signature.guard.js";

const integrationDatabaseUrl =
  process.env.FACTORY_INGEST_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

const secret = (byte: number): string =>
  Buffer.alloc(32, byte).toString("base64url");

const factorySecret = secret(7);
const factorySecretBytes = Buffer.from(factorySecret, "base64url");

function testEnvironment(): Env {
  return {
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL:
      integrationDatabaseUrl ?? "postgresql://database.invalid/factory_test",
    CORS_ORIGIN: "https://app.kitvera.test",
    PUBLIC_WEB_ORIGIN: "https://app.kitvera.test",
    CATALOGUE_CURSOR_SIGNING_SECRET: secret(1),
    AUTH_MAGIC_LINK_HASH_SECRET: secret(2),
    AUTH_SESSION_HASH_SECRET: secret(3),
    AUTH_CSRF_HASH_SECRET: secret(4),
    AUTH_SOURCE_IP_HASH_SECRET: secret(5),
    DOWNLOAD_TOKEN_HMAC_SECRET: secret(6),
    FACTORY_INGEST_HMAC_SECRET: factorySecret,
    LOCAL_ARTIFACT_STORAGE_DIR: "/tmp/kitvera-factory-ingest-test-artifacts",
    ADMIN_MFA_SECRET_ENCRYPTION_KEY: secret(8),
  } satisfies Env;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [testEnvironment],
    }),
    PrismaModule,
    FactoryIngestModule,
  ],
})
class FactoryIngestIntegrationModule {}

const ids = {
  sellerOwner: "e1000000-0000-4000-8000-000000000001",
  seller: "e1000000-0000-4000-8000-000000000002",
  category: "00000000-0000-4000-8000-000000000001",
  product: "e1000000-0000-4000-8000-000000000003",
};

function signedIngestBody(overrides: Record<string, unknown> = {}) {
  const body = {
    productId: ids.product,
    version: "1.0.0",
    storageId: "s3://factory-artifacts/aurora/1.0.0.zip",
    checksum: "a".repeat(64),
    sizeBytes: 1_048_576,
    producedAt: "2026-08-01T00:00:00.000Z",
    factoryRunId: "run-2026-08-01-001",
    qaVerdict: "passed" as const,
    scanVerdict: "passed" as const,
    ...overrides,
  };
  const canonical = canonicalFactoryIngestPayload(body);
  if (canonical === null) throw new Error("incomplete canonical payload");
  return {
    ...body,
    signature: signFactoryIngestPayload(factorySecretBytes, canonical),
  };
}

async function seedFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.user.create({
    data: {
      id: ids.sellerOwner,
      normalizedEmail: "factory-seller@example.com",
    },
  });
  await prisma.sellerProfile.create({
    data: { id: ids.seller, ownerId: ids.sellerOwner, slug: "kitvera-factory" },
  });
  await prisma.product.create({
    data: {
      id: ids.product,
      sellerId: ids.seller,
      categoryId: ids.category,
      slug: "aurora-factory-ingest",
      thumbnailUrl: "https://assets.example.com/aurora-factory/thumbnail.webp",
      documentationUrl: "https://docs.example.com/aurora-factory",
      isolatedPreviewUrl: "https://preview.example.com/aurora-factory",
    },
  });
  // `Artifact` is 1:1 with `ProductVersion` (schema §4/§6) — every scenario
  // below that ends up writing a record needs its own dedicated version so
  // one test's artifact can never collide with another's.
  await prisma.productVersion.createMany({
    data: ["1.0.0", "1.0.1", "1.0.2", "1.0.3", "1.0.4"].map((version) => ({
      productId: ids.product,
      version,
      releasedAt: new Date("2026-08-01T00:00:00.000Z"),
    })),
  });
}

describeWithPostgres("Factory ingest PostgreSQL integration", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (integrationDatabaseUrl === undefined) {
      throw new Error("FACTORY_INGEST_INTEGRATION_DATABASE_URL is required");
    }
    prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
    await prisma.$connect();
    await seedFixtures(prisma);

    const moduleRef = await Test.createTestingModule({
      imports: [FactoryIngestIntegrationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("creates exactly one Artifact and BuildRun for a validly signed ingest", async () => {
    const body = signedIngestBody({ factoryRunId: "run-create-001" });

    const response = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send(body)
      .expect(201);

    const parsed = factoryArtifactIngestResponseSchema.parse(response.body);
    expect(parsed.productId).toBe(ids.product);
    expect(parsed.version).toBe("1.0.0");

    const productVersion = await prisma.productVersion.findUniqueOrThrow({
      where: {
        productId_version: { productId: ids.product, version: "1.0.0" },
      },
    });
    const artifactCount = await prisma.artifact.count({
      where: { productVersionId: productVersion.id },
    });
    expect(artifactCount).toBe(1);
    const buildRunCount = await prisma.buildRun.count({
      where: {
        productVersionId: productVersion.id,
        factoryRunId: "run-create-001",
      },
    });
    expect(buildRunCount).toBe(1);

    const artifact = await prisma.artifact.findUniqueOrThrow({
      where: { id: parsed.artifactId },
    });
    expect(artifact.checksum).toBe(body.checksum);
    expect(artifact.factoryRunId).toBe("run-create-001");

    const buildRun = await prisma.buildRun.findUniqueOrThrow({
      where: { id: parsed.buildRunId },
    });
    expect(buildRun.qaVerdict).toBe("passed");
    expect(buildRun.scanVerdict).toBe("passed");
    expect(buildRun.artifactId).toBe(parsed.artifactId);
  });

  it("rejects an absent signature with 401 and writes nothing", async () => {
    const body: Record<string, unknown> = signedIngestBody({
      factoryRunId: "run-no-signature-001",
    });
    delete body.signature;

    const response = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send(body)
      .expect(401);

    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    const buildRunCount = await prisma.buildRun.count({
      where: { factoryRunId: "run-no-signature-001" },
    });
    expect(buildRunCount).toBe(0);
  });

  it("rejects an invalid signature with 401 and writes nothing", async () => {
    const body = signedIngestBody({ factoryRunId: "run-bad-signature-001" });

    const response = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send({ ...body, signature: `${body.signature.slice(0, -1)}x` })
      .expect(401);

    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    const buildRunCount = await prisma.buildRun.count({
      where: { factoryRunId: "run-bad-signature-001" },
    });
    expect(buildRunCount).toBe(0);
  });

  it("replays an identical ingest idempotently without creating a duplicate", async () => {
    const body = signedIngestBody({
      version: "1.0.1",
      factoryRunId: "run-replay-001",
    });

    const first = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send(body)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send(body)
      .expect(201);

    expect(factoryArtifactIngestResponseSchema.parse(second.body)).toEqual(
      factoryArtifactIngestResponseSchema.parse(first.body),
    );

    const buildRunCount = await prisma.buildRun.count({
      where: { factoryRunId: "run-replay-001" },
    });
    expect(buildRunCount).toBe(1);
    const artifactCount = await prisma.artifact.count({
      where: { factoryRunId: "run-replay-001" },
    });
    expect(artifactCount).toBe(1);
  });

  it("rejects a replay whose checksum disagrees with the recorded artifact and never mutates it", async () => {
    const original = signedIngestBody({
      version: "1.0.2",
      factoryRunId: "run-tamper-001",
    });
    await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send(original)
      .expect(201);

    const tampered = signedIngestBody({
      version: "1.0.2",
      factoryRunId: "run-tamper-001",
      checksum: "c".repeat(64),
    });
    const response = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send(tampered)
      .expect(422);
    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "UNPROCESSABLE_ENTITY" },
    });

    const artifact = await prisma.artifact.findFirstOrThrow({
      where: { factoryRunId: "run-tamper-001" },
    });
    expect(artifact.checksum).toBe(original.checksum);
    const artifactCount = await prisma.artifact.count({
      where: { factoryRunId: "run-tamper-001" },
    });
    expect(artifactCount).toBe(1);
  });

  it("returns 404 for an unknown product version and writes nothing", async () => {
    const body = signedIngestBody({
      version: "9.9.9",
      factoryRunId: "run-unknown-version-001",
    });

    const response = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send(body)
      .expect(404);
    expect(apiErrorSchema.parse(response.body)).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    const buildRunCount = await prisma.buildRun.count({
      where: { factoryRunId: "run-unknown-version-001" },
    });
    expect(buildRunCount).toBe(0);
  });

  it("never leaks the HMAC secret or the submitted signature in a response, and never touches review/publication state", async () => {
    const body = signedIngestBody({
      version: "1.0.3",
      factoryRunId: "run-no-leak-001",
    });

    const response = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send(body)
      .expect(201);

    expect(response.text).not.toContain(factorySecret);
    expect(response.text).not.toContain(body.signature);

    const productVersion = await prisma.productVersion.findUniqueOrThrow({
      where: {
        productId_version: { productId: ids.product, version: "1.0.3" },
      },
    });
    expect(productVersion.reviewState).toBe("draft");
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: ids.product },
    });
    expect(product.publicationState).toBe("draft");
  });
});
