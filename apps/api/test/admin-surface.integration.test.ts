import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";

import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import {
  adminGrantRoleResponseSchema,
  adminMfaEnrollConfirmResponseSchema,
  adminMfaEnrollStartResponseSchema,
  adminMfaVerifyResponseSchema,
  adminReviewQueueListResponseSchema,
  adminUserListResponseSchema,
  approveReviewResponseSchema,
  delistProductResponseSchema,
  publishProductResponseSchema,
} from "@marketplace/shared/admin";
import { apiErrorSchema } from "@marketplace/shared/api";
import type { FastifyServerOptions } from "fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthSessionService as AuthSessionServiceType } from "../src/auth/core/auth-session.service.js";
import { base32Decode, generateTotpCode } from "../src/admin/mfa/totp.js";
import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE_NAME } from "../src/auth/core/auth-cookie.js";
import { AuthSessionService } from "../src/auth/core/auth-session.service.js";
import { configureApp } from "../src/bootstrap/configure-app.js";
import { requestLogSerializer } from "../src/common/request-log-serializer.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

const integrationDatabaseUrl = process.env.ADMIN_FLOW_INTEGRATION_DATABASE_URL;
const describeWithPostgres =
  integrationDatabaseUrl === undefined ? describe.skip : describe;

// One of the ten approved top-level category roots the catalogue read-model
// migration seeds ("wordpress") — reused directly the same way the other
// module-level and composed suites do, so this suite owns no category
// fixture of its own.
const APPROVED_ROOT_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";

const PRODUCT_SLUG = "admin-flow-composed-product";
const PRODUCT_VERSION = "1.0.0";

function uuid(group: number, ordinal: number): string {
  return `${group.toString().padStart(8, "0")}-0000-4000-8000-${ordinal
    .toString()
    .padStart(12, "0")}`;
}

const ids = {
  adminOwner: uuid(90, 1),
  secondAdminOwner: uuid(90, 2),
  mfaLeakAdminOwner: uuid(90, 3),
  plainUser: uuid(90, 4),
  nonAdminUser: uuid(90, 5),
  sellerOwner: uuid(90, 6),
  sellerProfile: uuid(90, 7),
  product: uuid(90, 8),
  productVersion: uuid(90, 9),
  blockedProduct: uuid(90, 10),
};

function cookieHeader(rawSessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

/**
 * Captures every byte written to a Fastify/pino access log so the suite can
 * assert on the exact JSON emitted for a real request, instead of only on
 * the HTTP response body — mirrors the composed seller-authoring/commerce
 * suites.
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

/**
 * Seeds the full end-to-end admin fixture set: three pre-granted `admin`
 * users (the main flow, the MFA-enforcement sub-case, and an isolated
 * MFA-leak check), a plain user with no role yet (grant target), a
 * never-admin user (deny-by-default target), and two products:
 *
 * - `ids.product` — the FULL bilingual/2-licence fixture
 *   `assert_product_publication_ready` requires, carrying an `in_review`
 *   version with a verified `Artifact` + a `succeeded`/passed `BuildRun`, so
 *   the live `approve -> publish -> delist` HTTP calls can actually reach
 *   `published` inside their own later transactions.
 * - `ids.blockedProduct` — a minimal, single-locale `approved` version with
 *   no `Artifact` at all. It never leaves `draft` (the publish attempt
 *   against it is rejected in application code before any write), so the
 *   DB readiness trigger never fires on it — mirrors
 *   `admin-review.integration.test.ts`'s `createProductVersion` fixture.
 */
async function seedAdminFlowFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.user.createMany({
    data: [
      { id: ids.adminOwner, normalizedEmail: "admin-flow-admin@example.com" },
      {
        id: ids.secondAdminOwner,
        normalizedEmail: "admin-flow-mfa-admin@example.com",
      },
      {
        id: ids.mfaLeakAdminOwner,
        normalizedEmail: "admin-flow-mfa-leak-admin@example.com",
      },
      {
        id: ids.plainUser,
        normalizedEmail: "admin-flow-plain-user@example.com",
      },
      {
        id: ids.nonAdminUser,
        normalizedEmail: "admin-flow-non-admin@example.com",
      },
      {
        id: ids.sellerOwner,
        normalizedEmail: "admin-flow-seller-owner@example.com",
      },
    ],
  });

  // Upsert (not create): the admin-surface migration idempotently seeds the
  // `admin`/`seller` role rows, so a fresh CI database already has them.
  const adminRole = await prisma.role.upsert({
    where: { key: "admin" },
    update: {},
    create: { key: "admin" },
    select: { id: true },
  });
  await prisma.role.upsert({
    where: { key: "seller" },
    update: {},
    create: { key: "seller" },
  });
  await prisma.userRole.createMany({
    data: [
      { userId: ids.adminOwner, roleId: adminRole.id },
      { userId: ids.secondAdminOwner, roleId: adminRole.id },
      { userId: ids.mfaLeakAdminOwner, roleId: adminRole.id },
    ],
  });

  await prisma.sellerProfile.create({
    data: {
      id: ids.sellerProfile,
      ownerId: ids.sellerOwner,
      slug: "admin-flow-seller",
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.product.create({
      data: {
        id: ids.product,
        sellerId: ids.sellerProfile,
        categoryId: APPROVED_ROOT_CATEGORY_ID,
        slug: PRODUCT_SLUG,
        thumbnailUrl: `https://assets.example.com/${PRODUCT_SLUG}/thumbnail.webp`,
        documentationUrl: `https://docs.example.com/${PRODUCT_SLUG}`,
        isolatedPreviewUrl: `https://preview.example.com/${PRODUCT_SLUG}`,
        translations: {
          create: [
            {
              locale: "en",
              title: "Admin Flow Product",
              summary: "Summary",
              description: "Description",
            },
            {
              locale: "vi",
              title: "Admin Flow Product",
              summary: "Tóm tắt",
              description: "Mô tả",
            },
          ],
        },
      },
    });
    await tx.productVersion.create({
      data: {
        id: ids.productVersion,
        productId: ids.product,
        version: PRODUCT_VERSION,
        releasedAt: new Date("2026-08-01T00:00:00.000Z"),
        reviewState: "in_review",
        translations: {
          create: [
            { locale: "en", notes: "Initial release." },
            { locale: "vi", notes: "Phát hành đầu tiên." },
          ],
        },
      },
    });
    await tx.productCompatibility.create({
      data: { productId: ids.product, target: "wordpress", constraint: "6.x" },
    });
    await tx.productSpecification.create({
      data: {
        productId: ids.product,
        key: "framework",
        translations: {
          create: [
            { locale: "en", label: "Framework", value: "wordpress" },
            { locale: "vi", label: "Nền tảng", value: "wordpress" },
          ],
        },
      },
    });
    await tx.productMedia.create({
      data: {
        productId: ids.product,
        position: 0,
        kind: "image",
        url: `https://assets.example.com/${PRODUCT_SLUG}/screen.webp`,
        translations: {
          create: [
            { locale: "en", alt: "Screenshot" },
            { locale: "vi", alt: "Ảnh chụp" },
          ],
        },
      },
    });
    await tx.productDemoPage.create({
      data: {
        productId: ids.product,
        position: 0,
        slug: "home",
        previewUrl: `https://preview.example.com/${PRODUCT_SLUG}/home`,
        translations: {
          create: [
            { locale: "en", title: "Home" },
            { locale: "vi", title: "Trang chủ" },
          ],
        },
      },
    });
    await tx.licenceOption.create({
      data: {
        productId: ids.product,
        identifier: "Regular",
        prices: {
          create: [
            { currency: "VND", amount: 500_000 },
            { currency: "USD", amount: 20 },
          ],
        },
      },
    });
    await tx.licenceOption.create({
      data: {
        productId: ids.product,
        identifier: "Extended",
        prices: {
          create: [
            { currency: "VND", amount: 900_000 },
            { currency: "USD", amount: 36 },
          ],
        },
      },
    });
    const artifact = await tx.artifact.create({
      data: {
        productVersionId: ids.productVersion,
        storageId: `local://${PRODUCT_SLUG}/1.0.0.zip`,
        checksum: "a".repeat(64),
        signature: "b".repeat(64),
        sizeBytes: 1_048_576n,
        producedAt: new Date("2026-08-01T00:00:00.000Z"),
        factoryRunId: "run-admin-flow-good",
      },
    });
    await tx.buildRun.create({
      data: {
        productVersionId: ids.productVersion,
        artifactId: artifact.id,
        status: "succeeded",
        startedAt: new Date("2026-08-01T00:00:00.000Z"),
        finishedAt: new Date("2026-08-01T00:05:00.000Z"),
        factoryRunId: "run-admin-flow-good",
        qaVerdict: "passed",
        scanVerdict: "passed",
      },
    });
  });

  await prisma.product.create({
    data: {
      id: ids.blockedProduct,
      sellerId: ids.sellerProfile,
      categoryId: APPROVED_ROOT_CATEGORY_ID,
      slug: `${PRODUCT_SLUG}-blocked`,
      thumbnailUrl: `https://assets.example.com/${PRODUCT_SLUG}-blocked/thumbnail.webp`,
      documentationUrl: `https://docs.example.com/${PRODUCT_SLUG}-blocked`,
      isolatedPreviewUrl: `https://preview.example.com/${PRODUCT_SLUG}-blocked`,
      versions: {
        create: {
          version: PRODUCT_VERSION,
          releasedAt: new Date("2026-08-01T00:00:00.000Z"),
          reviewState: "approved",
          translations: { create: { locale: "en", notes: "No artifact yet." } },
        },
      },
    },
  });
}

describeWithPostgres(
  "Composed admin flow (grant seller -> review -> approve -> publish -> delist)",
  () => {
    let app: NestFastifyApplication;
    let prisma: PrismaClient;
    let sessions: AuthSessionServiceType;
    let logStream: CapturingLogStream;

    let enforcedApp: NestFastifyApplication;
    let enforcedSessions: AuthSessionServiceType;
    let enforcedLogStream: CapturingLogStream;

    beforeAll(async () => {
      if (integrationDatabaseUrl === undefined) return;

      // AppModule validates process.env through validateEnv on boot (see
      // public-resources.integration.test.ts); this suite supplies the
      // database/CORS values the shared test-script secrets don't.
      process.env.DATABASE_URL = integrationDatabaseUrl;
      process.env.CORS_ORIGIN ??= "https://app.kitvera.test";

      prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
      await prisma.$connect();
      await seedAdminFlowFixtures(prisma);

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

      // A second, fully composed app booted with ADMIN_MFA_ENFORCED=true so
      // the enforcement guard is meaningfully exercised end to end, not a
      // guaranteed pass-through (`@nestjs/config` freezes its validated
      // config the moment `AppModule`'s decorator is first evaluated, so a
      // second app needing different env requires `vi.resetModules()` +
      // dynamically re-importing `AppModule` and every class used as a DI
      // lookup token against it — mirrors
      // `test/commerce-flow.integration.test.ts`'s `bootComposedApp`).
      process.env.ADMIN_MFA_ENFORCED = "true";
      vi.resetModules();
      const [
        { AppModule: EnforcedAppModule },
        { PrismaService: EnforcedPrismaService },
        { AuthSessionService: EnforcedAuthSessionService },
      ] = await Promise.all([
        import("../src/app.module.js"),
        import("../src/prisma/prisma.service.js"),
        import("../src/auth/core/auth-session.service.js"),
      ]);

      enforcedLogStream = new CapturingLogStream();
      const enforcedModuleRef = await Test.createTestingModule({
        imports: [EnforcedAppModule],
      })
        .overrideProvider(EnforcedPrismaService)
        .useValue(prisma)
        .compile();
      enforcedApp =
        enforcedModuleRef.createNestApplication<NestFastifyApplication>(
          new FastifyAdapter({
            logger: {
              level: "info",
              stream: enforcedLogStream,
              serializers: { req: requestLogSerializer },
            },
          } satisfies FastifyServerOptions),
        );
      await configureApp(enforcedApp);
      await enforcedApp.init();
      await enforcedApp.getHttpAdapter().getInstance().ready();
      enforcedSessions = enforcedApp.get<AuthSessionServiceType>(
        EnforcedAuthSessionService,
      );
    }, 30_000);

    afterAll(async () => {
      if (integrationDatabaseUrl === undefined) return;
      await app.close();
      await enforcedApp.close();
      await prisma.$disconnect();
    });

    async function issueSession(
      authSessions: AuthSessionServiceType,
      userId: string,
    ) {
      const issued = await authSessions.createSession(userId);
      return {
        cookie: cookieHeader(issued.sessionToken),
        csrfToken: issued.csrfToken,
      };
    }

    it(
      "grants seller, then reviews an in_review version through " +
        "approve -> publish -> delist, each writing exactly one audit row",
      async () => {
        const admin = await issueSession(sessions, ids.adminOwner);

        const granted = await request(app.getHttpServer())
          .post(`/v1/admin/users/${ids.plainUser}/roles`)
          .set("Cookie", admin.cookie)
          .set("X-CSRF-Token", admin.csrfToken)
          .send({ role: "seller" })
          .expect(200);
        const grantedSummary = adminGrantRoleResponseSchema.parse(granted.body);
        expect(grantedSummary.roles).toEqual(["seller"]);

        const grantedProfile = await prisma.sellerProfile.findUnique({
          where: { ownerId: ids.plainUser },
        });
        expect(grantedProfile).not.toBeNull();

        const grantAuditRows = await prisma.adminAuditLog.findMany({
          where: {
            targetType: "userRole",
            targetId: ids.plainUser,
            action: "roleGranted",
          },
        });
        expect(grantAuditRows).toHaveLength(1);
        expect(grantAuditRows[0]?.actingAdminId).toBe(ids.adminOwner);

        const queue = await request(app.getHttpServer())
          .get("/v1/admin/review")
          .set("Cookie", admin.cookie)
          .expect(200);
        const queuePage = adminReviewQueueListResponseSchema.parse(queue.body);
        const queueEntry = queuePage.data.find(
          (entry) =>
            entry.productId === ids.product &&
            entry.version === PRODUCT_VERSION,
        );
        expect(queueEntry?.reviewState).toBe("in_review");
        expect(queueEntry?.latestBuildRun?.qaVerdict).toBe("passed");
        expect(queueEntry?.latestBuildRun?.scanVerdict).toBe("passed");

        const approved = await request(app.getHttpServer())
          .post(
            `/v1/admin/products/${ids.product}/versions/${PRODUCT_VERSION}/approve`,
          )
          .set("Cookie", admin.cookie)
          .set("X-CSRF-Token", admin.csrfToken)
          .send({})
          .expect(200);
        expect(approveReviewResponseSchema.parse(approved.body)).toEqual({
          productId: ids.product,
          version: PRODUCT_VERSION,
          reviewState: "approved",
        });

        const approveAuditRows = await prisma.adminAuditLog.findMany({
          where: {
            targetType: "productVersion",
            targetId: ids.productVersion,
            action: "reviewApproved",
          },
        });
        expect(approveAuditRows).toHaveLength(1);

        const published = await request(app.getHttpServer())
          .post(`/v1/admin/products/${ids.product}/publish`)
          .set("Cookie", admin.cookie)
          .set("X-CSRF-Token", admin.csrfToken)
          .send({ version: PRODUCT_VERSION })
          .expect(200);
        expect(publishProductResponseSchema.parse(published.body)).toEqual({
          productId: ids.product,
          version: PRODUCT_VERSION,
          publicationState: "published",
        });

        const publishedRow = await prisma.product.findUniqueOrThrow({
          where: { id: ids.product },
        });
        expect(publishedRow.publicationState).toBe("published");
        expect(publishedRow.currentVersion).toBe(PRODUCT_VERSION);

        const publishAuditRows = await prisma.adminAuditLog.findMany({
          where: {
            targetType: "product",
            targetId: ids.product,
            action: "productPublished",
          },
        });
        expect(publishAuditRows).toHaveLength(1);

        const delisted = await request(app.getHttpServer())
          .post(`/v1/admin/products/${ids.product}/delist`)
          .set("Cookie", admin.cookie)
          .set("X-CSRF-Token", admin.csrfToken)
          .send({})
          .expect(200);
        expect(delistProductResponseSchema.parse(delisted.body)).toEqual({
          productId: ids.product,
          publicationState: "delisted",
        });

        const delistAuditRows = await prisma.adminAuditLog.findMany({
          where: {
            targetType: "product",
            targetId: ids.product,
            action: "productDelisted",
          },
        });
        expect(delistAuditRows).toHaveLength(1);
      },
    );

    it("blocks publish (422) when the target version is not approved with a verified artifact and passed QA", async () => {
      const admin = await issueSession(sessions, ids.adminOwner);

      const rejected = await request(app.getHttpServer())
        .post(`/v1/admin/products/${ids.blockedProduct}/publish`)
        .set("Cookie", admin.cookie)
        .set("X-CSRF-Token", admin.csrfToken)
        .send({ version: PRODUCT_VERSION })
        .expect(422);
      expect(apiErrorSchema.parse(rejected.body).error.code).toBe(
        "UNPROCESSABLE_ENTITY",
      );

      const untouched = await prisma.product.findUniqueOrThrow({
        where: { id: ids.blockedProduct },
      });
      expect(untouched.publicationState).toBe("draft");
    });

    it("denies a non-admin session with 403 on every admin endpoint (deny-by-default)", async () => {
      const nonAdmin = await issueSession(sessions, ids.nonAdminUser);

      const probes: ReadonlyArray<{
        method: "get" | "post" | "delete";
        path: string;
        csrf?: boolean;
        body?: Record<string, unknown>;
      }> = [
        { method: "get", path: "/v1/admin/review" },
        {
          method: "post",
          path: `/v1/admin/products/${ids.product}/versions/${PRODUCT_VERSION}/approve`,
          csrf: true,
          body: {},
        },
        {
          method: "post",
          path: `/v1/admin/products/${ids.product}/versions/${PRODUCT_VERSION}/reject`,
          csrf: true,
          body: { reason: "non-admin probe" },
        },
        {
          method: "post",
          path: `/v1/admin/products/${ids.product}/publish`,
          csrf: true,
          body: { version: PRODUCT_VERSION },
        },
        {
          method: "post",
          path: `/v1/admin/products/${ids.product}/delist`,
          csrf: true,
          body: {},
        },
        { method: "get", path: "/v1/admin/users" },
        {
          method: "post",
          path: `/v1/admin/users/${ids.plainUser}/roles`,
          csrf: true,
          body: { role: "seller" },
        },
        {
          method: "delete",
          path: `/v1/admin/users/${ids.plainUser}/roles/seller`,
          csrf: true,
        },
        { method: "post", path: "/v1/admin/mfa/enroll", csrf: true, body: {} },
        {
          method: "post",
          path: "/v1/admin/mfa/confirm",
          csrf: true,
          body: { factorId: randomUUID(), code: "000000" },
        },
        {
          method: "post",
          path: "/v1/admin/mfa/verify",
          csrf: true,
          body: { code: "000000" },
        },
        {
          method: "post",
          path: "/v1/admin/mfa/recovery-codes",
          csrf: true,
          body: {},
        },
      ];

      for (const probe of probes) {
        const httpServer = request(app.getHttpServer());
        let pending = httpServer[probe.method](probe.path).set(
          "Cookie",
          nonAdmin.cookie,
        );
        if (probe.csrf === true) {
          pending = pending.set("X-CSRF-Token", nonAdmin.csrfToken);
        }
        if (probe.body !== undefined) {
          pending = pending.send(probe.body);
        }
        const response = await pending.expect(403);
        expect(apiErrorSchema.parse(response.body).error.message).toBeTruthy();
      }
    });

    it("has no admin route reading or writing order/entitlement/discount/review data", async () => {
      for (const path of [
        "/v1/admin/orders",
        "/v1/admin/entitlements",
        "/v1/admin/discounts",
        "/v1/admin/coupons",
        "/v1/admin/reviews",
      ]) {
        await request(app.getHttpServer()).get(path).expect(404);
      }
    });

    it("PII-minimizes the admin user list to id/email/role keys only", async () => {
      const admin = await issueSession(sessions, ids.adminOwner);

      const response = await request(app.getHttpServer())
        .get("/v1/admin/users")
        .set("Cookie", admin.cookie)
        .expect(200);
      // `adminUserSummarySchema` is `.strict()` — any extra field (session,
      // token, order data, name, phone) would fail this parse outright.
      const page = adminUserListResponseSchema.parse(response.body);
      expect(page.data.length).toBeGreaterThan(0);
    });

    it(
      "challenges an unverified admin session (403) on an enforcement-gated " +
        "route once ADMIN_MFA_ENFORCED=true, and passes once a recent " +
        "verified marker exists, without leaking the TOTP secret or a " +
        "recovery code in any response or the access log",
      async () => {
        const enforcedAdmin = await issueSession(
          enforcedSessions,
          ids.secondAdminOwner,
        );

        await request(enforcedApp.getHttpServer())
          .get("/v1/admin/review")
          .set("Cookie", enforcedAdmin.cookie)
          .expect(403);

        const enrolled = await request(enforcedApp.getHttpServer())
          .post("/v1/admin/mfa/enroll")
          .set("Cookie", enforcedAdmin.cookie)
          .set("X-CSRF-Token", enforcedAdmin.csrfToken)
          .send({})
          .expect(200);
        const enrollment = adminMfaEnrollStartResponseSchema.parse(
          enrolled.body,
        );
        const rawSecret = base32Decode(enrollment.secret);

        const confirmed = await request(enforcedApp.getHttpServer())
          .post("/v1/admin/mfa/confirm")
          .set("Cookie", enforcedAdmin.cookie)
          .set("X-CSRF-Token", enforcedAdmin.csrfToken)
          .send({
            factorId: enrollment.factorId,
            code: generateTotpCode(rawSecret),
          })
          .expect(200);
        adminMfaEnrollConfirmResponseSchema.parse(confirmed.body);

        // Confirmed, but no recent step-up verification yet.
        await request(enforcedApp.getHttpServer())
          .get("/v1/admin/review")
          .set("Cookie", enforcedAdmin.cookie)
          .expect(403);

        const verified = await request(enforcedApp.getHttpServer())
          .post("/v1/admin/mfa/verify")
          .set("Cookie", enforcedAdmin.cookie)
          .set("X-CSRF-Token", enforcedAdmin.csrfToken)
          .send({ code: generateTotpCode(rawSecret) })
          .expect(200);
        adminMfaVerifyResponseSchema.parse(verified.body);

        await request(enforcedApp.getHttpServer())
          .get("/v1/admin/review")
          .set("Cookie", enforcedAdmin.cookie)
          .expect(200);

        // The enroll response legitimately carries the plaintext secret
        // exactly once (the one-time provisioning payload), and the confirm
        // response legitimately carries the recovery codes exactly once —
        // neither may reappear anywhere else: not in the other response, not
        // in the verify response, and never in the access log.
        const enforcedLogText = enforcedLogStream.text();
        const recoveryCodes = confirmedRecoveryCodesIfAny(confirmed.body);
        expect(confirmed.text).not.toContain(enrollment.secret);
        expect(verified.text).not.toContain(enrollment.secret);
        expect(enforcedLogText).not.toContain(enrollment.secret);
        for (const code of recoveryCodes) {
          expect(enrolled.text).not.toContain(code);
          expect(verified.text).not.toContain(code);
          expect(enforcedLogText).not.toContain(code);
        }
      },
    );

    it("never leaks a TOTP secret or a recovery code in a response or the access log across the full enroll -> confirm -> verify -> regenerate flow", async () => {
      const admin = await issueSession(sessions, ids.mfaLeakAdminOwner);

      const enrolled = await request(app.getHttpServer())
        .post("/v1/admin/mfa/enroll")
        .set("Cookie", admin.cookie)
        .set("X-CSRF-Token", admin.csrfToken)
        .send({})
        .expect(200);
      const enrollment = adminMfaEnrollStartResponseSchema.parse(enrolled.body);
      const rawSecret = base32Decode(enrollment.secret);

      const confirmed = await request(app.getHttpServer())
        .post("/v1/admin/mfa/confirm")
        .set("Cookie", admin.cookie)
        .set("X-CSRF-Token", admin.csrfToken)
        .send({
          factorId: enrollment.factorId,
          code: generateTotpCode(rawSecret),
        })
        .expect(200);
      const confirmedBody = adminMfaEnrollConfirmResponseSchema.parse(
        confirmed.body,
      );
      expect(confirmedBody.recoveryCodes).toHaveLength(10);

      const auditRow = await prisma.adminAuditLog.findFirstOrThrow({
        where: {
          targetType: "adminMfaFactor",
          targetId: enrollment.factorId,
          action: "mfaEnrolled",
        },
      });
      expect(JSON.stringify(auditRow)).not.toContain(rawSecret.toString("hex"));

      // The enroll response legitimately carries the plaintext secret exactly
      // once, and the confirm response legitimately carries the recovery
      // codes exactly once — neither may reappear anywhere else: not in the
      // other response, and never in the access log.
      const logText = logStream.text();
      expect(confirmed.text).not.toContain(enrollment.secret);
      expect(logText).not.toContain(enrollment.secret);
      for (const code of confirmedBody.recoveryCodes) {
        expect(enrolled.text).not.toContain(code);
        expect(logText).not.toContain(code);
      }
    });
  },
);

/**
 * The recovery codes are only present on a successful `confirm` response —
 * pulled out defensively so the MFA-enforcement sub-case's leak-scan list
 * stays correct even if that response shape is ever widened.
 */
function confirmedRecoveryCodesIfAny(body: unknown): readonly string[] {
  if (
    typeof body === "object" &&
    body !== null &&
    "recoveryCodes" in body &&
    Array.isArray((body as { recoveryCodes: unknown }).recoveryCodes)
  ) {
    return (body as { recoveryCodes: string[] }).recoveryCodes;
  }
  return [];
}
