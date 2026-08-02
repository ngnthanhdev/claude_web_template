import { Writable } from "node:stream";

import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { apiErrorSchema } from "@marketplace/shared/api";
import {
  factoryArtifactIngestResponseSchema,
  sellerProductDetailResponseSchema,
  submitForReviewResponseSchema,
} from "@marketplace/shared/seller";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE_NAME } from "../src/auth/core/auth-cookie.js";
import { AuthSessionService } from "../src/auth/core/auth-session.service.js";
import { configureApp } from "../src/bootstrap/configure-app.js";
import { requestLogSerializer } from "../src/common/request-log-serializer.js";
import {
  canonicalFactoryIngestPayload,
  signFactoryIngestPayload,
} from "../src/factory-ingest/factory-signature.guard.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

const integrationDatabaseUrl = process.env.SELLER_FLOW_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

// One of the ten approved top-level category roots the catalogue read-model
// migration seeds ("wordpress") — reused directly the same way the other
// module-level and composed suites do, so this suite owns no category
// fixture of its own.
const APPROVED_ROOT_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";
const APPROVED_ROOT_CATEGORY_SLUG = "wordpress";

function uuid(group: number, ordinal: number): string {
  return `${group.toString().padStart(8, "0")}-0000-4000-8000-${ordinal
    .toString()
    .padStart(12, "0")}`;
}

const ids = {
  sellerAOwner: uuid(80, 1),
  sellerBOwner: uuid(80, 2),
  nonSellerOwner: uuid(80, 3),
  sellerA: uuid(80, 4),
  sellerB: uuid(80, 5),
  sellerRole: uuid(80, 6),
  sellerBProduct: uuid(80, 7),
};

function cookieHeader(rawSessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

/**
 * Captures every byte written to a Fastify/pino access log so the suite can
 * assert on the exact JSON emitted for a real request, instead of only on
 * the HTTP response body — mirrors the composed commerce-flow suite.
 */
class CapturingLogStream extends Writable {
  private readonly chunks: Buffer[] = [];

  override _write(
    chunk: Buffer | string,
    _encoding: string,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

async function seedFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.user.createMany({
    data: [
      {
        id: ids.sellerAOwner,
        normalizedEmail: "seller-authoring-a@example.com",
      },
      {
        id: ids.sellerBOwner,
        normalizedEmail: "seller-authoring-b@example.com",
      },
      {
        id: ids.nonSellerOwner,
        normalizedEmail: "seller-authoring-non-seller@example.com",
      },
    ],
  });
  await prisma.role.create({ data: { id: ids.sellerRole, key: "seller" } });
  await prisma.userRole.createMany({
    data: [
      { userId: ids.sellerAOwner, roleId: ids.sellerRole },
      { userId: ids.sellerBOwner, roleId: ids.sellerRole },
    ],
  });
  await prisma.sellerProfile.createMany({
    data: [
      {
        id: ids.sellerA,
        ownerId: ids.sellerAOwner,
        slug: "seller-authoring-a",
      },
      {
        id: ids.sellerB,
        ownerId: ids.sellerBOwner,
        slug: "seller-authoring-b",
      },
    ],
  });
  await prisma.product.create({
    data: {
      id: ids.sellerBProduct,
      sellerId: ids.sellerB,
      categoryId: APPROVED_ROOT_CATEGORY_ID,
      slug: "seller-authoring-b-draft-product",
      thumbnailUrl: "https://assets.example.com/seller-authoring-b/thumb.webp",
      documentationUrl: "https://docs.example.com/seller-authoring-b",
      isolatedPreviewUrl: "https://preview.example.com/seller-authoring-b",
      versions: {
        create: {
          version: "1.0.0",
          releasedAt: new Date(),
          translations: { create: { locale: "en", notes: "Initial" } },
        },
      },
    },
  });
}

describeWithPostgres(
  "Composed seller authoring flow (draft -> version -> factory ingest -> submit for review)",
  () => {
    let app: NestFastifyApplication;
    let prisma: PrismaClient;
    let sessions: AuthSessionService;
    let logStream: CapturingLogStream;
    let factorySecretBytes: Buffer;

    beforeAll(async () => {
      if (integrationDatabaseUrl === undefined) return;

      // AppModule validates process.env through validateEnv on boot (see
      // public-resources.integration.test.ts); this suite supplies the
      // database/CORS values the shared test-script secrets don't.
      process.env.DATABASE_URL = integrationDatabaseUrl;
      process.env.CORS_ORIGIN ??= "https://app.kitvera.test";

      const rawFactorySecret = process.env.FACTORY_INGEST_HMAC_SECRET;
      if (rawFactorySecret === undefined) {
        throw new Error("FACTORY_INGEST_HMAC_SECRET is required");
      }
      factorySecretBytes = Buffer.from(rawFactorySecret, "base64url");

      prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
      await prisma.$connect();
      await seedFixtures(prisma);

      logStream = new CapturingLogStream();
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      app = moduleRef.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter({
          logger: {
            level: "info",
            stream: logStream,
            serializers: { req: requestLogSerializer },
          },
        }),
      );
      await configureApp(app);
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      sessions = app.get(AuthSessionService);
    }, 30_000);

    afterAll(async () => {
      if (integrationDatabaseUrl === undefined) return;
      await app.close();
      await prisma.$disconnect();
    });

    async function issueSession(userId: string) {
      const issued = await sessions.createSession(userId);
      return {
        cookie: cookieHeader(issued.sessionToken),
        csrfToken: issued.csrfToken,
      };
    }

    function signedIngestBody(overrides: Record<string, unknown> = {}) {
      const body = {
        productId: "",
        version: "1.0.0",
        storageId: "s3://factory-artifacts/seller-authoring/1.0.0.zip",
        checksum: "b".repeat(64),
        sizeBytes: 2_097_152,
        producedAt: "2026-08-01T00:00:00.000Z",
        factoryRunId: "run-seller-authoring-001",
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

    it(
      "authors a draft product through version, factory-signed ingest, and " +
        "submit-for-review, reflected end to end in the seller detail read",
      async () => {
        const sellerA = await issueSession(ids.sellerAOwner);

        const created = await request(app.getHttpServer())
          .post("/v1/seller/products")
          .set("Cookie", sellerA.cookie)
          .set("X-CSRF-Token", sellerA.csrfToken)
          .send({
            slug: "seller-authoring-flow-product",
            category: APPROVED_ROOT_CATEGORY_SLUG,
            thumbnailUrl:
              "https://assets.example.com/seller-authoring-flow/thumb.webp",
            documentationUrl: "https://docs.example.com/seller-authoring-flow",
            isolatedPreviewUrl:
              "https://preview.example.com/seller-authoring-flow",
          })
          .expect(201);
        const draft = sellerProductDetailResponseSchema.parse(created.body);
        expect(draft.publicationState).toBe("draft");
        expect(draft.versions).toEqual([]);

        const versioned = await request(app.getHttpServer())
          .post(`/v1/seller/products/${draft.id}/versions`)
          .set("Cookie", sellerA.cookie)
          .set("X-CSRF-Token", sellerA.csrfToken)
          .send({
            version: "1.0.0",
            releasedAt: new Date().toISOString(),
            translations: [{ locale: "en", notes: "Initial release" }],
          })
          .expect(201);
        const withVersion = sellerProductDetailResponseSchema.parse(
          versioned.body,
        );
        const draftVersion = withVersion.versions.find(
          (entry) => entry.version === "1.0.0",
        );
        expect(draftVersion?.reviewState).toBe("draft");
        expect(draftVersion?.latestBuildRun).toBeNull();

        const ingestBody = signedIngestBody({ productId: draft.id });
        const ingested = await request(app.getHttpServer())
          .post("/v1/factory/artifacts")
          .send(ingestBody)
          .expect(201);
        const ingestResponse = factoryArtifactIngestResponseSchema.parse(
          ingested.body,
        );
        expect(ingestResponse.productId).toBe(draft.id);
        expect(ingestResponse.version).toBe("1.0.0");

        const afterIngest = await request(app.getHttpServer())
          .get(`/v1/seller/products/${draft.id}`)
          .set("Cookie", sellerA.cookie)
          .expect(200);
        const detailAfterIngest = sellerProductDetailResponseSchema.parse(
          afterIngest.body,
        );
        const versionAfterIngest = detailAfterIngest.versions.find(
          (entry) => entry.version === "1.0.0",
        );
        expect(versionAfterIngest?.reviewState).toBe("draft");
        expect(versionAfterIngest?.latestBuildRun?.artifact).toMatchObject({
          id: ingestResponse.artifactId,
          checksum: ingestBody.checksum,
        });

        const submitted = await request(app.getHttpServer())
          .post(`/v1/seller/products/${draft.id}/submit-for-review`)
          .set("Cookie", sellerA.cookie)
          .set("X-CSRF-Token", sellerA.csrfToken)
          .send({ version: "1.0.0" })
          .expect(200);
        expect(submitForReviewResponseSchema.parse(submitted.body)).toEqual({
          productId: draft.id,
          version: "1.0.0",
          reviewState: "in_review",
        });

        const afterSubmit = await request(app.getHttpServer())
          .get(`/v1/seller/products/${draft.id}`)
          .set("Cookie", sellerA.cookie)
          .expect(200);
        const detailAfterSubmit = sellerProductDetailResponseSchema.parse(
          afterSubmit.body,
        );
        expect(
          detailAfterSubmit.versions.find((entry) => entry.version === "1.0.0")
            ?.reviewState,
        ).toBe("in_review");
      },
    );

    it("rejects a non-seller session with 403 on every authoring endpoint", async () => {
      const nonSeller = await issueSession(ids.nonSellerOwner);

      const list = await request(app.getHttpServer())
        .get("/v1/seller/products")
        .set("Cookie", nonSeller.cookie)
        .expect(403);
      expect(apiErrorSchema.parse(list.body).error.code).toBe("FORBIDDEN");

      await request(app.getHttpServer())
        .get(`/v1/seller/products/${ids.sellerBProduct}`)
        .set("Cookie", nonSeller.cookie)
        .expect(403);

      await request(app.getHttpServer())
        .post("/v1/seller/products")
        .set("Cookie", nonSeller.cookie)
        .set("X-CSRF-Token", nonSeller.csrfToken)
        .send({
          slug: "non-seller-attempt",
          category: APPROVED_ROOT_CATEGORY_SLUG,
          thumbnailUrl: "https://assets.example.com/non-seller/thumb.webp",
          documentationUrl: "https://docs.example.com/non-seller",
          isolatedPreviewUrl: "https://preview.example.com/non-seller",
        })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/v1/seller/products/${ids.sellerBProduct}`)
        .set("Cookie", nonSeller.cookie)
        .set("X-CSRF-Token", nonSeller.csrfToken)
        .send({ tags: [] })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/v1/seller/products/${ids.sellerBProduct}/versions`)
        .set("Cookie", nonSeller.cookie)
        .set("X-CSRF-Token", nonSeller.csrfToken)
        .send({
          version: "2.0.0",
          releasedAt: new Date().toISOString(),
          translations: [{ locale: "en", notes: "Second release" }],
        })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/v1/seller/products/${ids.sellerBProduct}/submit-for-review`)
        .set("Cookie", nonSeller.cookie)
        .set("X-CSRF-Token", nonSeller.csrfToken)
        .send({ version: "1.0.0" })
        .expect(403);

      const profile = await prisma.sellerProfile.findUnique({
        where: { ownerId: ids.nonSellerOwner },
      });
      expect(profile).toBeNull();
    });

    it("hides seller B's product/version behind 404 for seller A on read, edit, version, and submit-for-review", async () => {
      const sellerA = await issueSession(ids.sellerAOwner);

      const readResponse = await request(app.getHttpServer())
        .get(`/v1/seller/products/${ids.sellerBProduct}`)
        .set("Cookie", sellerA.cookie)
        .expect(404);
      expect(apiErrorSchema.parse(readResponse.body)).toMatchObject({
        error: { code: "NOT_FOUND" },
      });

      await request(app.getHttpServer())
        .patch(`/v1/seller/products/${ids.sellerBProduct}`)
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({ tags: [] })
        .expect(404);

      await request(app.getHttpServer())
        .post(`/v1/seller/products/${ids.sellerBProduct}/versions`)
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({
          version: "2.0.0",
          releasedAt: new Date().toISOString(),
          translations: [{ locale: "en", notes: "Second release" }],
        })
        .expect(404);

      await request(app.getHttpServer())
        .post(`/v1/seller/products/${ids.sellerBProduct}/submit-for-review`)
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({ version: "1.0.0" })
        .expect(404);
    });

    it("never lets a seller smuggle publicationState/isFeatured, and submit-for-review never reaches approved/published", async () => {
      const sellerA = await issueSession(ids.sellerAOwner);

      const rejectedCreate = await request(app.getHttpServer())
        .post("/v1/seller/products")
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({
          slug: "seller-authoring-self-publish-attempt",
          category: APPROVED_ROOT_CATEGORY_SLUG,
          thumbnailUrl:
            "https://assets.example.com/seller-authoring-self-publish/thumb.webp",
          documentationUrl:
            "https://docs.example.com/seller-authoring-self-publish",
          isolatedPreviewUrl:
            "https://preview.example.com/seller-authoring-self-publish",
          publicationState: "published",
          isFeatured: true,
        })
        .expect(422);
      expect(apiErrorSchema.parse(rejectedCreate.body)).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });

      const created = await request(app.getHttpServer())
        .post("/v1/seller/products")
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({
          slug: "seller-authoring-self-publish-product",
          category: APPROVED_ROOT_CATEGORY_SLUG,
          thumbnailUrl:
            "https://assets.example.com/seller-authoring-self-publish/thumb.webp",
          documentationUrl:
            "https://docs.example.com/seller-authoring-self-publish",
          isolatedPreviewUrl:
            "https://preview.example.com/seller-authoring-self-publish",
        })
        .expect(201);
      const productId = sellerProductDetailResponseSchema.parse(
        created.body,
      ).id;

      const rejectedEdit = await request(app.getHttpServer())
        .patch(`/v1/seller/products/${productId}`)
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({ publicationState: "published", isFeatured: true })
        .expect(422);
      expect(apiErrorSchema.parse(rejectedEdit.body)).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });

      const rejectedVersion = await request(app.getHttpServer())
        .post(`/v1/seller/products/${productId}/versions`)
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({
          version: "1.0.0",
          releasedAt: new Date().toISOString(),
          translations: [{ locale: "en", notes: "Initial" }],
          reviewState: "approved",
        })
        .expect(422);
      expect(apiErrorSchema.parse(rejectedVersion.body)).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });

      await request(app.getHttpServer())
        .post(`/v1/seller/products/${productId}/versions`)
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({
          version: "1.0.0",
          releasedAt: new Date().toISOString(),
          translations: [{ locale: "en", notes: "Initial" }],
        })
        .expect(201);

      const rejectedSubmit = await request(app.getHttpServer())
        .post(`/v1/seller/products/${productId}/submit-for-review`)
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({ version: "1.0.0", reviewState: "approved" })
        .expect(422);
      expect(apiErrorSchema.parse(rejectedSubmit.body)).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
      });
      expect(product.publicationState).toBe("draft");
    });

    it("rejects an unsigned or tampered factory ingest with 401, independent of any session or CSRF header", async () => {
      const unsigned: Record<string, unknown> = signedIngestBody({
        productId: ids.sellerBProduct,
        factoryRunId: "run-seller-authoring-unsigned",
      });
      delete unsigned.signature;

      const unsignedResponse = await request(app.getHttpServer())
        .post("/v1/factory/artifacts")
        .send(unsigned)
        .expect(401);
      expect(apiErrorSchema.parse(unsignedResponse.body)).toMatchObject({
        error: { code: "UNAUTHORIZED" },
      });

      const tampered = signedIngestBody({
        productId: ids.sellerBProduct,
        factoryRunId: "run-seller-authoring-tampered",
      });
      const tamperedResponse = await request(app.getHttpServer())
        .post("/v1/factory/artifacts")
        .send({ ...tampered, signature: `${tampered.signature.slice(0, -1)}x` })
        .expect(401);
      expect(apiErrorSchema.parse(tamperedResponse.body)).toMatchObject({
        error: { code: "UNAUTHORIZED" },
      });

      // No `Cookie`/`X-CSRF-Token` header on either request above proves the
      // route is reachable purely on the HMAC signature — never behind
      // `SessionAuthGuard`/`SessionCsrfGuard`/`SellerGuard`.
      const buildRunCount = await prisma.buildRun.count({
        where: {
          factoryRunId: {
            in: [
              "run-seller-authoring-unsigned",
              "run-seller-authoring-tampered",
            ],
          },
        },
      });
      expect(buildRunCount).toBe(0);
    });

    it("never leaks the ingest secret, an artifact signature, or buyer/order data in a response or the access log", async () => {
      const sellerA = await issueSession(ids.sellerAOwner);
      const created = await request(app.getHttpServer())
        .post("/v1/seller/products")
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({
          slug: "seller-authoring-no-leak-product",
          category: APPROVED_ROOT_CATEGORY_SLUG,
          thumbnailUrl:
            "https://assets.example.com/seller-authoring-no-leak/thumb.webp",
          documentationUrl: "https://docs.example.com/seller-authoring-no-leak",
          isolatedPreviewUrl:
            "https://preview.example.com/seller-authoring-no-leak",
        })
        .expect(201);
      const productId = sellerProductDetailResponseSchema.parse(
        created.body,
      ).id;
      await request(app.getHttpServer())
        .post(`/v1/seller/products/${productId}/versions`)
        .set("Cookie", sellerA.cookie)
        .set("X-CSRF-Token", sellerA.csrfToken)
        .send({
          version: "1.0.0",
          releasedAt: new Date().toISOString(),
          translations: [{ locale: "en", notes: "Initial" }],
        })
        .expect(201);

      const ingestBody = signedIngestBody({
        productId,
        factoryRunId: "run-seller-authoring-no-leak",
      });
      const ingested = await request(app.getHttpServer())
        .post("/v1/factory/artifacts")
        .send(ingestBody)
        .expect(201);
      expect(ingested.text).not.toContain(
        process.env.FACTORY_INGEST_HMAC_SECRET,
      );
      expect(ingested.text).not.toContain(ingestBody.signature);

      const detail = await request(app.getHttpServer())
        .get(`/v1/seller/products/${productId}`)
        .set("Cookie", sellerA.cookie)
        .expect(200);
      expect(detail.text).not.toContain(process.env.FACTORY_INGEST_HMAC_SECRET);
      expect(detail.text).not.toContain(ingestBody.signature);
      expect(detail.text).not.toContain("buyerId");
      expect(detail.text).not.toContain("orderId");
      expect(detail.text).not.toContain("entitlement");

      const logText = logStream.text();
      expect(logText).not.toContain(process.env.FACTORY_INGEST_HMAC_SECRET);
      expect(logText).not.toContain(ingestBody.signature);
    });
  },
);
