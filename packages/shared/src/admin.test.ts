import { describe, expect, it } from "vitest";

import {
  adminGrantRoleRequestSchema,
  adminGrantRoleResponseSchema,
  adminMfaEnrollConfirmRequestSchema,
  adminMfaEnrollConfirmResponseSchema,
  adminMfaEnrollStartRequestSchema,
  adminMfaEnrollStartResponseSchema,
  adminMfaRecoveryRegenerateResponseSchema,
  adminMfaVerifyRequestSchema,
  adminMfaVerifyResponseSchema,
  adminReviewQueueItemDetailResponseSchema,
  adminReviewQueueListResponseSchema,
  adminRevokeRoleResponseSchema,
  adminRoleKeySchema,
  adminUserListResponseSchema,
  approveReviewRequestSchema,
  approveReviewResponseSchema,
  delistProductRequestSchema,
  delistProductResponseSchema,
  publishProductRequestSchema,
  publishProductResponseSchema,
  rejectReviewRequestSchema,
  rejectReviewResponseSchema,
} from "./index.js";

const validArtifact = {
  id: "3b6e1c2a-4f5d-4e6f-8a9b-0c1d2e3f4a5b",
  storageId: "s3://factory-artifacts/lotus-commerce/1.0.0.zip",
  checksum: "a".repeat(64),
  sizeBytes: 1_048_576,
  producedAt: "2026-08-01T00:00:00.000Z",
  factoryRunId: "run-2026-08-01-001",
};

const validBuildRun = {
  id: "6d4b8a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b",
  status: "succeeded",
  startedAt: "2026-08-01T00:00:00.000Z",
  finishedAt: "2026-08-01T00:05:00.000Z",
  qaVerdict: "passed",
  scanVerdict: "passed",
  artifact: validArtifact,
};

const validReviewQueueItem = {
  productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  productSlug: "lotus-commerce-theme",
  category: "ecommerce",
  thumbnailUrl: "https://cdn.example.com/thumbs/lotus-commerce.png",
  sellerId: "9d2e1c2a-4f5d-4e6f-8a9b-0c1d2e3f4a5c",
  version: "1.0.0",
  releasedAt: "2026-08-01T00:00:00.000Z",
  reviewState: "in_review",
  submittedAt: "2026-08-01T00:00:00.000Z",
  latestBuildRun: validBuildRun,
};

const validReviewQueueItemDetail = {
  ...validReviewQueueItem,
  documentationUrl: "https://docs.example.com/lotus-commerce",
  isolatedPreviewUrl: "https://preview.example.com/lotus-commerce",
  translations: [
    {
      locale: "en",
      title: "Lotus Commerce",
      summary: "A storefront theme.",
      description: "A full-featured storefront theme for Shopify.",
    },
  ],
};

/**
 * The product+version a transition addresses. In the wire protocol these come
 * from the route path (`/admin/products/:productId/versions/:version/...`),
 * so they appear on the *response* DTOs (server echoes them) but never on a
 * request body — the request-body fixtures below deliberately omit them.
 */
const transitionTarget = {
  productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  version: "1.0.0",
};

const validApproveRequest = {};

const validRejectRequest = {
  reason: "Missing changelog entry for this version.",
};

const validPublishRequest = {
  version: "1.0.0",
};

const validDelistRequest = {};

const validGrantRoleRequest = {
  role: "seller",
};

const validUserSummary = {
  id: "7c1f9a3e-2b4d-4c6f-8a9b-0c1d2e3f4a5d",
  email: "reviewer@example.com",
  roles: ["seller"],
};

const validMfaEnrollStartResponse = {
  factorId: "3b6e1c2a-4f5d-4e6f-8a9b-0c1d2e3f4a5b",
  type: "totp",
  otpauthUri: "otpauth://totp/Marketplace:admin@example.com?secret=ABC",
  secret: "JBSWY3DPEHPK3PXP",
};

const validMfaEnrollConfirmRequest = {
  factorId: "3b6e1c2a-4f5d-4e6f-8a9b-0c1d2e3f4a5b",
  code: "123456",
};

const validMfaEnrollConfirmResponse = {
  factorId: "3b6e1c2a-4f5d-4e6f-8a9b-0c1d2e3f4a5b",
  confirmedAt: "2026-08-03T00:00:00.000Z",
  recoveryCodes: Array.from(
    { length: 10 },
    (_, index) => `recovery-code-${index}`,
  ),
};

const validMfaVerifyRequest = { code: "123456" };

const validMfaVerifyResponse = { verifiedAt: "2026-08-03T00:00:00.000Z" };

const validMfaRecoveryRegenerateResponse = {
  recoveryCodes: Array.from(
    { length: 10 },
    (_, index) => `recovery-code-${index}`,
  ),
  regeneratedAt: "2026-08-03T00:00:00.000Z",
};

const acceptingAdminOrAuditFields = [
  { actingAdminId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9" },
  { adminId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9" },
  { auditReason: "smuggled" },
  { requestId: "smuggled" },
];

describe("adminRoleKeySchema", () => {
  it("is exactly seller|admin", () => {
    expect(adminRoleKeySchema.options).toEqual(["seller", "admin"]);
  });

  it("rejects a role key outside seller|admin", () => {
    for (const badRole of ["owner", "buyer", "superadmin", ""]) {
      expect(adminRoleKeySchema.safeParse(badRole).success).toBe(false);
    }
  });
});

describe("admin review-queue list/detail response contracts", () => {
  it("accepts a representative valid list page", () => {
    const response = {
      data: [validReviewQueueItem],
      meta: { nextCursor: null, hasMore: false },
    };
    expect(adminReviewQueueListResponseSchema.parse(response)).toEqual(
      response,
    );
  });

  it("accepts a representative valid detail item", () => {
    expect(
      adminReviewQueueItemDetailResponseSchema.parse(
        validReviewQueueItemDetail,
      ),
    ).toEqual(validReviewQueueItemDetail);
  });

  for (const buyerOrOrderField of [
    "buyerId",
    "buyerEmail",
    "orderId",
    "revenueMinor",
    "totalSalesMinor",
    "payoutAmountMinor",
  ]) {
    it(`rejects a buyer/order/revenue field on a queue item: ${buyerOrOrderField}`, () => {
      expect(
        adminReviewQueueListResponseSchema.safeParse({
          data: [{ ...validReviewQueueItem, [buyerOrOrderField]: "x" }],
          meta: { nextCursor: null, hasMore: false },
        }).success,
      ).toBe(false);
    });
  }

  it("rejects the artifact signature on the linked build metadata", () => {
    expect(
      adminReviewQueueItemDetailResponseSchema.safeParse({
        ...validReviewQueueItemDetail,
        latestBuildRun: {
          ...validBuildRun,
          artifact: { ...validArtifact, signature: "b".repeat(88) },
        },
      }).success,
    ).toBe(false);
  });
});

describe("approve-review request/response contract", () => {
  it("accepts an empty request (target is in the route path)", () => {
    expect(approveReviewRequestSchema.parse(validApproveRequest)).toEqual(
      validApproveRequest,
    );
  });

  it("accepts a representative valid response", () => {
    const response = { ...transitionTarget, reviewState: "approved" };
    expect(approveReviewResponseSchema.parse(response)).toEqual(response);
  });

  for (const smuggledField of acceptingAdminOrAuditFields) {
    it(`rejects a smuggled acting-admin/audit field: ${Object.keys(smuggledField)[0]}`, () => {
      expect(
        approveReviewRequestSchema.safeParse({ ...smuggledField }).success,
      ).toBe(false);
    });
  }

  it("rejects a request that tries to free-set reviewState/publicationState directly", () => {
    expect(
      approveReviewRequestSchema.safeParse({
        reviewState: "approved",
      }).success,
    ).toBe(false);
    expect(
      approveReviewRequestSchema.safeParse({
        publicationState: "published",
      }).success,
    ).toBe(false);
  });

  it("rejects a request that re-carries the path-owned productId/version", () => {
    expect(approveReviewRequestSchema.safeParse(transitionTarget).success).toBe(
      false,
    );
  });
});

describe("reject-review request/response contract", () => {
  it("accepts a representative valid request", () => {
    expect(rejectReviewRequestSchema.parse(validRejectRequest)).toEqual(
      validRejectRequest,
    );
  });

  it("accepts a representative valid response", () => {
    const response = { ...transitionTarget, reviewState: "draft" };
    expect(rejectReviewResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects a reject request missing its reason", () => {
    expect(rejectReviewRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a reject request with an empty/whitespace-only reason", () => {
    expect(rejectReviewRequestSchema.safeParse({ reason: "   " }).success).toBe(
      false,
    );
  });

  for (const smuggledField of acceptingAdminOrAuditFields) {
    it(`rejects a smuggled acting-admin/audit field: ${Object.keys(smuggledField)[0]}`, () => {
      expect(
        rejectReviewRequestSchema.safeParse({
          ...validRejectRequest,
          ...smuggledField,
        }).success,
      ).toBe(false);
    });
  }
});

describe("publish-product request/response contract", () => {
  it("accepts a representative valid request", () => {
    expect(publishProductRequestSchema.parse(validPublishRequest)).toEqual(
      validPublishRequest,
    );
  });

  it("accepts a representative valid response", () => {
    const response = {
      ...transitionTarget,
      publicationState: "published",
    };
    expect(publishProductResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects a publish request missing its target version", () => {
    expect(publishProductRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a publish request re-carrying the path-owned productId", () => {
    expect(
      publishProductRequestSchema.safeParse({
        ...validPublishRequest,
        productId: transitionTarget.productId,
      }).success,
    ).toBe(false);
  });

  for (const smuggledField of acceptingAdminOrAuditFields) {
    it(`rejects a smuggled acting-admin/audit field: ${Object.keys(smuggledField)[0]}`, () => {
      expect(
        publishProductRequestSchema.safeParse({
          ...validPublishRequest,
          ...smuggledField,
        }).success,
      ).toBe(false);
    });
  }
});

describe("delist-product request/response contract", () => {
  it("accepts an empty request (target is in the route path)", () => {
    expect(delistProductRequestSchema.parse(validDelistRequest)).toEqual(
      validDelistRequest,
    );
  });

  it("accepts a representative valid response", () => {
    const response = {
      productId: transitionTarget.productId,
      publicationState: "delisted",
    };
    expect(delistProductResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects a delist request carrying a free-set publicationState", () => {
    expect(
      delistProductRequestSchema.safeParse({
        publicationState: "delisted",
      }).success,
    ).toBe(false);
  });

  for (const smuggledField of acceptingAdminOrAuditFields) {
    it(`rejects a smuggled acting-admin/audit field: ${Object.keys(smuggledField)[0]}`, () => {
      expect(
        delistProductRequestSchema.safeParse({ ...smuggledField }).success,
      ).toBe(false);
    });
  }
});

describe("admin user-list response contract", () => {
  it("accepts a representative valid page", () => {
    const response = {
      data: [validUserSummary],
      meta: { nextCursor: null, hasMore: false },
    };
    expect(adminUserListResponseSchema.parse(response)).toEqual(response);
  });

  it("carries only opaque id + normalized email + role keys (rejects session/token/order/PII fields)", () => {
    for (const forbiddenField of [
      { userId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9" },
      { sessionId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9" },
      { token: "leaked-token" },
      { orderId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9" },
      { name: "Reviewer Name" },
      { phone: "+15555550100" },
    ]) {
      expect(
        adminUserListResponseSchema.safeParse({
          data: [{ ...validUserSummary, ...forbiddenField }],
          meta: { nextCursor: null, hasMore: false },
        }).success,
      ).toBe(false);
    }
  });
});

describe("grant-role / revoke-role request/response contract", () => {
  it("accepts a representative valid grant request (role only; user is path-addressed)", () => {
    expect(adminGrantRoleRequestSchema.parse(validGrantRoleRequest)).toEqual(
      validGrantRoleRequest,
    );
  });

  it("accepts a representative valid grant response", () => {
    expect(adminGrantRoleResponseSchema.parse(validUserSummary)).toEqual(
      validUserSummary,
    );
  });

  it("accepts a representative valid revoke response", () => {
    expect(adminRevokeRoleResponseSchema.parse(validUserSummary)).toEqual(
      validUserSummary,
    );
  });

  it("rejects a role key outside seller|admin on grant", () => {
    for (const badRole of ["owner", "buyer", "superadmin"]) {
      expect(
        adminGrantRoleRequestSchema.safeParse({ role: badRole }).success,
      ).toBe(false);
    }
  });

  it("rejects a user identifier smuggled into the grant body (user is server/path-owned)", () => {
    for (const smuggledUser of [
      { userId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9" },
      { email: "reviewer@example.com" },
    ]) {
      expect(
        adminGrantRoleRequestSchema.safeParse({
          ...validGrantRoleRequest,
          ...smuggledUser,
        }).success,
      ).toBe(false);
    }
  });

  for (const smuggledField of acceptingAdminOrAuditFields) {
    it(`rejects a smuggled acting-admin/audit field: ${Object.keys(smuggledField)[0]}`, () => {
      expect(
        adminGrantRoleRequestSchema.safeParse({
          ...validGrantRoleRequest,
          ...smuggledField,
        }).success,
      ).toBe(false);
    });
  }
});

describe("MFA enroll-start request/response contract", () => {
  it("accepts an empty enroll-start request", () => {
    expect(adminMfaEnrollStartRequestSchema.parse({})).toEqual({});
  });

  it("accepts a representative valid enroll-start response", () => {
    expect(
      adminMfaEnrollStartResponseSchema.parse(validMfaEnrollStartResponse),
    ).toEqual(validMfaEnrollStartResponse);
  });

  it("rejects the one-time provisioning payload (otpauthUri/secret) on any request schema", () => {
    expect(
      adminMfaEnrollStartRequestSchema.safeParse({
        otpauthUri: validMfaEnrollStartResponse.otpauthUri,
      }).success,
    ).toBe(false);
    expect(
      adminMfaEnrollStartRequestSchema.safeParse({
        secret: validMfaEnrollStartResponse.secret,
      }).success,
    ).toBe(false);
    expect(
      adminMfaEnrollConfirmRequestSchema.safeParse({
        ...validMfaEnrollConfirmRequest,
        secret: validMfaEnrollStartResponse.secret,
      }).success,
    ).toBe(false);
    expect(
      adminMfaVerifyRequestSchema.safeParse({
        ...validMfaVerifyRequest,
        secret: validMfaEnrollStartResponse.secret,
      }).success,
    ).toBe(false);
  });

  for (const smuggledField of acceptingAdminOrAuditFields) {
    it(`rejects a smuggled acting-admin/audit field: ${Object.keys(smuggledField)[0]}`, () => {
      expect(
        adminMfaEnrollStartRequestSchema.safeParse(smuggledField).success,
      ).toBe(false);
    });
  }
});

describe("MFA enroll-confirm request/response contract", () => {
  it("accepts a representative valid confirm request", () => {
    expect(
      adminMfaEnrollConfirmRequestSchema.parse(validMfaEnrollConfirmRequest),
    ).toEqual(validMfaEnrollConfirmRequest);
  });

  it("accepts a representative valid confirm response (recovery codes shown once)", () => {
    expect(
      adminMfaEnrollConfirmResponseSchema.parse(validMfaEnrollConfirmResponse),
    ).toEqual(validMfaEnrollConfirmResponse);
  });

  it("rejects a malformed TOTP code (confirm is TOTP-only)", () => {
    for (const badCode of ["12345", "abcdef", "1234567"]) {
      expect(
        adminMfaEnrollConfirmRequestSchema.safeParse({
          ...validMfaEnrollConfirmRequest,
          code: badCode,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a secret field on the confirm response beyond the dedicated recovery codes", () => {
    expect(
      adminMfaEnrollConfirmResponseSchema.safeParse({
        ...validMfaEnrollConfirmResponse,
        secret: validMfaEnrollStartResponse.secret,
      }).success,
    ).toBe(false);
  });
});

describe("MFA verify request/response contract", () => {
  it("accepts a valid TOTP code", () => {
    expect(adminMfaVerifyRequestSchema.parse(validMfaVerifyRequest)).toEqual(
      validMfaVerifyRequest,
    );
    expect(adminMfaVerifyResponseSchema.parse(validMfaVerifyResponse)).toEqual(
      validMfaVerifyResponse,
    );
  });

  it("accepts a recovery code in place of a TOTP code", () => {
    const recoveryRequest = { code: "recovery-code-1" };
    expect(adminMfaVerifyRequestSchema.parse(recoveryRequest)).toEqual(
      recoveryRequest,
    );
  });

  it("rejects a code that is neither a 6-digit TOTP nor a bounded recovery code", () => {
    for (const badCode of ["", "12", "abc"]) {
      expect(
        adminMfaVerifyRequestSchema.safeParse({ code: badCode }).success,
      ).toBe(false);
    }
  });

  it("rejects a TOTP secret smuggled onto the verify response", () => {
    expect(
      adminMfaVerifyResponseSchema.safeParse({
        ...validMfaVerifyResponse,
        secret: validMfaEnrollStartResponse.secret,
      }).success,
    ).toBe(false);
  });
});

describe("MFA recovery-code regeneration response contract", () => {
  it("accepts a representative valid response (codes shown once)", () => {
    expect(
      adminMfaRecoveryRegenerateResponseSchema.parse(
        validMfaRecoveryRegenerateResponse,
      ),
    ).toEqual(validMfaRecoveryRegenerateResponse);
  });

  it("rejects a TOTP secret smuggled onto the recovery-regeneration response", () => {
    expect(
      adminMfaRecoveryRegenerateResponseSchema.safeParse({
        ...validMfaRecoveryRegenerateResponse,
        secret: validMfaEnrollStartResponse.secret,
      }).success,
    ).toBe(false);
  });
});
