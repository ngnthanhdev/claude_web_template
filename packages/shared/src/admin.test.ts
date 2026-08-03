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
  adminRevokeRoleRequestSchema,
  adminRoleKeySchema,
  adminUserListResponseSchema,
  approveReviewRequestSchema,
  approveReviewResponseSchema,
  delistProductRequestSchema,
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

const validApproveRequest = {
  productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  version: "1.0.0",
};

const validRejectRequest = {
  ...validApproveRequest,
  reason: "Missing changelog entry for this version.",
};

const validPublishRequest = {
  productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
  version: "1.0.0",
};

const validDelistRequest = {
  productId: "2a80d74e-6f18-48a6-9034-7b79a8af93e9",
};

const validGrantRoleRequest = {
  email: "reviewer@example.com",
  role: "seller",
};

const validUserSummary = {
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
  it("accepts a representative valid request", () => {
    expect(approveReviewRequestSchema.parse(validApproveRequest)).toEqual(
      validApproveRequest,
    );
  });

  it("accepts a representative valid response", () => {
    const response = { ...validApproveRequest, reviewState: "approved" };
    expect(approveReviewResponseSchema.parse(response)).toEqual(response);
  });

  for (const smuggledField of acceptingAdminOrAuditFields) {
    it(`rejects a smuggled acting-admin/audit field: ${Object.keys(smuggledField)[0]}`, () => {
      expect(
        approveReviewRequestSchema.safeParse({
          ...validApproveRequest,
          ...smuggledField,
        }).success,
      ).toBe(false);
    });
  }

  it("rejects a request that tries to free-set reviewState/publicationState directly", () => {
    expect(
      approveReviewRequestSchema.safeParse({
        ...validApproveRequest,
        reviewState: "approved",
      }).success,
    ).toBe(false);
    expect(
      approveReviewRequestSchema.safeParse({
        ...validApproveRequest,
        publicationState: "published",
      }).success,
    ).toBe(false);
  });
});

describe("reject-review request/response contract", () => {
  it("accepts a representative valid request", () => {
    expect(rejectReviewRequestSchema.parse(validRejectRequest)).toEqual(
      validRejectRequest,
    );
  });

  it("accepts a representative valid response", () => {
    const response = { ...validApproveRequest, reviewState: "draft" };
    expect(rejectReviewResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects a reject request missing its reason", () => {
    expect(
      rejectReviewRequestSchema.safeParse(validApproveRequest).success,
    ).toBe(false);
  });

  it("rejects a reject request with an empty/whitespace-only reason", () => {
    expect(
      rejectReviewRequestSchema.safeParse({
        ...validApproveRequest,
        reason: "   ",
      }).success,
    ).toBe(false);
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
    const response = { ...validPublishRequest, publicationState: "published" };
    expect(publishProductResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects a publish request missing its target version", () => {
    const { version: _version, ...withoutVersion } = validPublishRequest;
    expect(publishProductRequestSchema.safeParse(withoutVersion).success).toBe(
      false,
    );
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

describe("delist-product request contract", () => {
  it("accepts a representative valid request naming only the product", () => {
    expect(delistProductRequestSchema.parse(validDelistRequest)).toEqual(
      validDelistRequest,
    );
  });

  it("rejects a delist request carrying a free-set publicationState", () => {
    expect(
      delistProductRequestSchema.safeParse({
        ...validDelistRequest,
        publicationState: "delisted",
      }).success,
    ).toBe(false);
  });

  for (const smuggledField of acceptingAdminOrAuditFields) {
    it(`rejects a smuggled acting-admin/audit field: ${Object.keys(smuggledField)[0]}`, () => {
      expect(
        delistProductRequestSchema.safeParse({
          ...validDelistRequest,
          ...smuggledField,
        }).success,
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

  it("carries only normalized email + role keys (rejects id/session/token/order/PII fields)", () => {
    for (const forbiddenField of [
      { id: "2a80d74e-6f18-48a6-9034-7b79a8af93e9" },
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
  it("accepts a representative valid grant request", () => {
    expect(adminGrantRoleRequestSchema.parse(validGrantRoleRequest)).toEqual(
      validGrantRoleRequest,
    );
  });

  it("accepts a representative valid revoke request", () => {
    expect(adminRevokeRoleRequestSchema.parse(validGrantRoleRequest)).toEqual(
      validGrantRoleRequest,
    );
  });

  it("accepts a representative valid grant response", () => {
    expect(adminGrantRoleResponseSchema.parse(validUserSummary)).toEqual(
      validUserSummary,
    );
  });

  it("rejects a role key outside seller|admin on grant/revoke", () => {
    for (const badRole of ["owner", "buyer", "superadmin"]) {
      expect(
        adminGrantRoleRequestSchema.safeParse({
          ...validGrantRoleRequest,
          role: badRole,
        }).success,
      ).toBe(false);
      expect(
        adminRevokeRoleRequestSchema.safeParse({
          ...validGrantRoleRequest,
          role: badRole,
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

  it("rejects a malformed TOTP code", () => {
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
  it("accepts a representative valid request/response", () => {
    expect(adminMfaVerifyRequestSchema.parse(validMfaVerifyRequest)).toEqual(
      validMfaVerifyRequest,
    );
    expect(adminMfaVerifyResponseSchema.parse(validMfaVerifyResponse)).toEqual(
      validMfaVerifyResponse,
    );
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
