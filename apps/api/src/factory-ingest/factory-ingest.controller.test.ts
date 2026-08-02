import { ConfigService } from "@nestjs/config";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { apiErrorSchema } from "@marketplace/shared/api";
import { factoryArtifactIngestResponseSchema } from "@marketplace/shared/seller";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { configureApp } from "../bootstrap/configure-app.js";
import type { Env } from "../config/env.js";
import { FactoryIngestController } from "./factory-ingest.controller.js";
import { FactoryIngestService } from "./factory-ingest.service.js";
import {
  canonicalFactoryIngestPayload,
  FactorySignatureGuard,
  signFactoryIngestPayload,
} from "./factory-signature.guard.js";

const secret = Buffer.alloc(32, 7).toString("base64url");
const secretBytes = Buffer.from(secret, "base64url");

const validBody = {
  productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  version: "1.0.0",
  storageId: "s3://factory-artifacts/lotus-commerce/1.0.0.zip",
  checksum: "a".repeat(64),
  sizeBytes: 1_048_576,
  producedAt: "2026-08-01T00:00:00.000Z",
  factoryRunId: "run-2026-08-01-001",
  qaVerdict: "passed" as const,
  scanVerdict: "passed" as const,
};

function sign(body: Record<string, unknown>): string {
  const canonical = canonicalFactoryIngestPayload(body);
  if (canonical === null) throw new Error("incomplete canonical payload");
  return signFactoryIngestPayload(secretBytes, canonical);
}

function signedBody(): typeof validBody & { signature: string } {
  return { ...validBody, signature: sign(validBody) };
}

function withoutSignature(
  body: typeof validBody & { signature: string },
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...body };
  delete clone.signature;
  return clone;
}

describe("FactoryIngestController", () => {
  let app: NestFastifyApplication;
  const ingest = { ingest: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FactoryIngestController],
      providers: [
        FactorySignatureGuard,
        { provide: FactoryIngestService, useValue: ingest },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: vi.fn((name: keyof Env) =>
              name === "FACTORY_INGEST_HMAC_SECRET" ? secret : undefined,
            ),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts a validly signed payload and forwards it to the service", async () => {
    const response = {
      artifactId: "3b6e1c2a-4f5d-4e6f-8a9b-0c1d2e3f4a5b",
      buildRunId: "6d4b8a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b",
      productId: validBody.productId,
      version: validBody.version,
      recordedAt: "2026-08-01T00:05:00.000Z",
    };
    ingest.ingest.mockResolvedValue(response);

    const body = signedBody();
    const httpResponse = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send(body)
      .expect(201);

    expect(
      factoryArtifactIngestResponseSchema.parse(httpResponse.body),
    ).toEqual(response);
    expect(ingest.ingest).toHaveBeenCalledWith(body);
  });

  it("rejects a missing signature with 401 and never calls the service", async () => {
    const httpResponse = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send(withoutSignature(signedBody()))
      .expect(401);

    expect(apiErrorSchema.parse(httpResponse.body)).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(ingest.ingest).not.toHaveBeenCalled();
  });

  it("rejects a tampered payload signed for a different checksum with 401", async () => {
    const body = signedBody();

    const httpResponse = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send({ ...body, checksum: "b".repeat(64) })
      .expect(401);

    expect(apiErrorSchema.parse(httpResponse.body)).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(ingest.ingest).not.toHaveBeenCalled();
  });

  it("rejects a signature computed with the wrong secret", async () => {
    const wrongSecretBytes = Buffer.alloc(32, 9);
    const canonical = canonicalFactoryIngestPayload(validBody);
    if (canonical === null) throw new Error("incomplete canonical payload");
    const badSignature = signFactoryIngestPayload(wrongSecretBytes, canonical);

    const httpResponse = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send({ ...validBody, signature: badSignature })
      .expect(401);

    expect(apiErrorSchema.parse(httpResponse.body)).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(ingest.ingest).not.toHaveBeenCalled();
  });

  it("returns the shared 422 envelope for a signed but schema-invalid payload", async () => {
    const invalidBody = { ...validBody, version: "not-a-version" };
    const httpResponse = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send({ ...invalidBody, signature: sign(invalidBody) })
      .expect(422);

    expect(apiErrorSchema.parse(httpResponse.body)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(ingest.ingest).not.toHaveBeenCalled();
  });

  it("never includes the secret or the signature in a thrown error's message", async () => {
    const httpResponse = await request(app.getHttpServer())
      .post("/v1/factory/artifacts")
      .send(withoutSignature(signedBody()))
      .expect(401);

    expect(httpResponse.text).not.toContain(secret);
    const validSignature = sign(validBody);
    expect(httpResponse.text).not.toContain(validSignature);
  });
});
