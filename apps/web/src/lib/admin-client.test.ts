import type { AdminGrantRoleRequest, AdminRoleKey } from "@shared/admin";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  approveReviewVersion,
  confirmMfaEnrollment,
  delistProduct,
  grantAdminRole,
  listAdminUsers,
  listReviewQueue,
  publishProduct,
  regenerateMfaRecoveryCodes,
  rejectReviewVersion,
  revokeAdminRole,
  startMfaEnrollment,
  verifyMfa,
} from "./admin-client";

const PRODUCT_ID = "2a80d74e-6f18-48a6-9034-7b79a8af93e9";
const SELLER_ID = "9c1c6d9a-3f0e-4a2a-8f0e-8f1a6c2b7d4e";
const USER_ID = "5b3f9c1e-2d4a-4b6a-9c8e-1a2b3c4d5e6f";
const VERSION = "1.4.0";
const CSRF_TOKEN = "csrf-token-value";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetchOnce(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function calledInit(fetchMock: ReturnType<typeof stubFetchOnce>): RequestInit {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return init;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const reviewQueueItem = {
  productId: PRODUCT_ID,
  productSlug: "lotus-commerce",
  category: "wordpress" as const,
  thumbnailUrl: "https://cdn.kitvera.example/thumb.png",
  sellerId: SELLER_ID,
  version: VERSION,
  releasedAt: "2026-08-01T00:00:00.000Z",
  reviewState: "in_review" as const,
  submittedAt: "2026-08-01T12:00:00.000Z",
  latestBuildRun: null,
};

const adminUserSummary = {
  id: USER_ID,
  email: "seller@kitvera.example",
  roles: ["seller"] as const,
};

describe("listReviewQueue", () => {
  it("validates the cursor-paginated review queue response", async () => {
    const responseBody = {
      data: [reviewQueueItem],
      meta: { nextCursor: null, hasMore: false },
    };
    const fetchMock = stubFetchOnce(jsonResponse(responseBody));

    await expect(listReviewQueue()).resolves.toEqual(responseBody);
    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/admin/review?");
  });

  it("forwards cursor and limit as query parameters", async () => {
    const responseBody = {
      data: [reviewQueueItem],
      meta: { nextCursor: "next-cursor", hasMore: true },
    };
    const fetchMock = stubFetchOnce(jsonResponse(responseBody));

    await listReviewQueue({ cursor: "abc", limit: 10 });

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/admin/review?cursor=abc&limit=10");
  });

  it("rejects a malformed review queue response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ data: [reviewQueueItem] }));

    await expect(listReviewQueue()).rejects.toBeInstanceOf(ZodError);
  });
});

describe("approveReviewVersion", () => {
  const approveResponse = {
    productId: PRODUCT_ID,
    version: VERSION,
    reviewState: "approved" as const,
  };

  it("posts an empty body to the dedicated approve transition and validates the response", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(approveResponse));

    await expect(
      approveReviewVersion(PRODUCT_ID, VERSION, CSRF_TOKEN),
    ).resolves.toEqual(approveResponse);

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(
      `/api/v1/admin/products/${PRODUCT_ID}/versions/${VERSION}/approve`,
    );
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("sends the session CSRF token on the approve mutation", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(approveResponse));

    await approveReviewVersion(PRODUCT_ID, VERSION, CSRF_TOKEN);

    expect(new Headers(calledInit(fetchMock).headers).get("x-csrf-token")).toBe(
      CSRF_TOKEN,
    );
  });

  it("rejects a malformed approve response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ productId: PRODUCT_ID }));

    await expect(
      approveReviewVersion(PRODUCT_ID, VERSION, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("rejectReviewVersion", () => {
  const rejectInput = { reason: "Fails automated QA verdict" };
  const rejectResponse = {
    productId: PRODUCT_ID,
    version: VERSION,
    reviewState: "draft" as const,
  };

  it("posts a request built only from the shared reject schema and validates the response", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(rejectResponse));

    await expect(
      rejectReviewVersion(PRODUCT_ID, VERSION, rejectInput, CSRF_TOKEN),
    ).resolves.toEqual(rejectResponse);

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(
      `/api/v1/admin/products/${PRODUCT_ID}/versions/${VERSION}/reject`,
    );
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(rejectInput);
  });

  it("sends the session CSRF token on the reject mutation", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(rejectResponse));

    await rejectReviewVersion(PRODUCT_ID, VERSION, rejectInput, CSRF_TOKEN);

    expect(new Headers(calledInit(fetchMock).headers).get("x-csrf-token")).toBe(
      CSRF_TOKEN,
    );
  });

  it("rejects a request carrying an elevated reviewState field the shared schema does not allow", async () => {
    // Deliberately smuggling server-owned authority: the shared reject
    // request schema carries nothing but `reason`, so this must be rejected
    // before any request is sent.
    const tamperedInput = { ...rejectInput, reviewState: "approved" };

    await expect(
      rejectReviewVersion(PRODUCT_ID, VERSION, tamperedInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects a malformed reject response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ productId: PRODUCT_ID }));

    await expect(
      rejectReviewVersion(PRODUCT_ID, VERSION, rejectInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("publishProduct", () => {
  const publishInput = { version: VERSION };
  const publishResponse = {
    productId: PRODUCT_ID,
    version: VERSION,
    publicationState: "published" as const,
  };

  it("posts a request built only from the shared publish schema and validates the response", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(publishResponse));

    await expect(
      publishProduct(PRODUCT_ID, publishInput, CSRF_TOKEN),
    ).resolves.toEqual(publishResponse);

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(`/api/v1/admin/products/${PRODUCT_ID}/publish`);
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(publishInput);
  });

  it("sends the session CSRF token on the publish mutation", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(publishResponse));

    await publishProduct(PRODUCT_ID, publishInput, CSRF_TOKEN);

    expect(new Headers(calledInit(fetchMock).headers).get("x-csrf-token")).toBe(
      CSRF_TOKEN,
    );
  });

  it("rejects a request carrying server-owned fields the shared schema does not allow", async () => {
    const tamperedInput = { ...publishInput, publicationState: "published" };

    await expect(
      publishProduct(PRODUCT_ID, tamperedInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects a malformed publish response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ productId: PRODUCT_ID }));

    await expect(
      publishProduct(PRODUCT_ID, publishInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("delistProduct", () => {
  const delistResponse = {
    productId: PRODUCT_ID,
    publicationState: "delisted" as const,
  };

  it("posts an empty body to the dedicated delist transition and validates the response", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(delistResponse));

    await expect(delistProduct(PRODUCT_ID, CSRF_TOKEN)).resolves.toEqual(
      delistResponse,
    );

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(`/api/v1/admin/products/${PRODUCT_ID}/delist`);
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("sends the session CSRF token on the delist mutation", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(delistResponse));

    await delistProduct(PRODUCT_ID, CSRF_TOKEN);

    expect(new Headers(calledInit(fetchMock).headers).get("x-csrf-token")).toBe(
      CSRF_TOKEN,
    );
  });

  it("rejects a malformed delist response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ productId: PRODUCT_ID }));

    await expect(delistProduct(PRODUCT_ID, CSRF_TOKEN)).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});

describe("listAdminUsers", () => {
  it("validates the PII-minimized, cursor-paginated user list response", async () => {
    const responseBody = {
      data: [adminUserSummary],
      meta: { nextCursor: null, hasMore: false },
    };
    const fetchMock = stubFetchOnce(jsonResponse(responseBody));

    await expect(listAdminUsers()).resolves.toEqual(responseBody);
    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/admin/users?");
  });

  it("forwards cursor and limit as query parameters", async () => {
    const responseBody = {
      data: [adminUserSummary],
      meta: { nextCursor: "next-cursor", hasMore: true },
    };
    const fetchMock = stubFetchOnce(jsonResponse(responseBody));

    await listAdminUsers({ cursor: "abc", limit: 10 });

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/admin/users?cursor=abc&limit=10");
  });

  it("rejects a response leaking a PII field the shared schema does not allow", async () => {
    stubFetchOnce(
      jsonResponse({
        data: [{ ...adminUserSummary, name: "Real Name" }],
        meta: { nextCursor: null, hasMore: false },
      }),
    );

    await expect(listAdminUsers()).rejects.toBeInstanceOf(ZodError);
  });
});

describe("grantAdminRole", () => {
  const grantInput = { role: "seller" as const };

  it("posts a request built only from the shared grant-role schema and validates the response", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(adminUserSummary));

    await expect(
      grantAdminRole(USER_ID, grantInput, CSRF_TOKEN),
    ).resolves.toEqual(adminUserSummary);

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(`/api/v1/admin/users/${USER_ID}/roles`);
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(grantInput);
  });

  it("sends the session CSRF token on the grant-role mutation", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(adminUserSummary));

    await grantAdminRole(USER_ID, grantInput, CSRF_TOKEN);

    expect(new Headers(calledInit(fetchMock).headers).get("x-csrf-token")).toBe(
      CSRF_TOKEN,
    );
  });

  it("rejects a request naming a role key outside the seller|admin allowlist", async () => {
    // Deliberately an invalid role key; type-asserted only to exercise the
    // runtime allowlist guard the same way an untyped caller could.
    const tamperedInput = {
      role: "superadmin",
    } as unknown as AdminGrantRoleRequest;

    await expect(
      grantAdminRole(USER_ID, tamperedInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects a malformed grant-role response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ id: USER_ID }));

    await expect(
      grantAdminRole(USER_ID, grantInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("revokeAdminRole", () => {
  it("sends a DELETE addressing the user and role key in the route path", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(adminUserSummary));

    await expect(
      revokeAdminRole(USER_ID, "seller", CSRF_TOKEN),
    ).resolves.toEqual(adminUserSummary);

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(`/api/v1/admin/users/${USER_ID}/roles/seller`);
    const init = calledInit(fetchMock);
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("sends the session CSRF token on the revoke-role mutation", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(adminUserSummary));

    await revokeAdminRole(USER_ID, "seller", CSRF_TOKEN);

    expect(new Headers(calledInit(fetchMock).headers).get("x-csrf-token")).toBe(
      CSRF_TOKEN,
    );
  });

  it("rejects a role key outside the seller|admin allowlist before any request is sent", async () => {
    // Deliberately an invalid role key; type-asserted only to exercise the
    // runtime allowlist guard the same way an untyped caller could.
    const invalidRoleKey = "superadmin" as unknown as AdminRoleKey;

    await expect(
      revokeAdminRole(USER_ID, invalidRoleKey, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects a malformed revoke-role response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ id: USER_ID }));

    await expect(
      revokeAdminRole(USER_ID, "seller", CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("MFA enrollment, verification, and recovery", () => {
  const mfaEnrollStart = {
    factorId: "6f2e9d1a-8b3c-4d5e-9f6a-1b2c3d4e5f6a",
    type: "totp" as const,
    otpauthUri: "otpauth://totp/Kitvera:admin@kitvera.example?secret=ABC",
    secret: "JBSWY3DPEHPK3PXP",
  };
  const mfaConfirmResponse = {
    factorId: mfaEnrollStart.factorId,
    confirmedAt: "2026-08-03T00:00:00.000Z",
    recoveryCodes: Array.from({ length: 10 }, (_, i) => `recovery-code-${i}`),
  };
  const mfaVerifyResponse = { verifiedAt: "2026-08-03T00:00:00.000Z" };
  const mfaRecoveryResponse = {
    recoveryCodes: Array.from({ length: 10 }, (_, i) => `regenerated-${i}`),
    regeneratedAt: "2026-08-03T00:00:00.000Z",
  };

  it("posts an empty body to start MFA enrollment and validates the one-time provisioning payload", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(mfaEnrollStart));

    await expect(startMfaEnrollment(CSRF_TOKEN)).resolves.toEqual(
      mfaEnrollStart,
    );

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/admin/mfa/enroll");
    const init = calledInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({});
    expect(new Headers(init.headers).get("x-csrf-token")).toBe(CSRF_TOKEN);
  });

  it("never logs the one-time MFA secret it returns", async () => {
    stubFetchOnce(jsonResponse(mfaEnrollStart));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await startMfaEnrollment(CSRF_TOKEN);

    expect(result.secret).toBe(mfaEnrollStart.secret);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rejects a malformed enroll-start response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ factorId: mfaEnrollStart.factorId }));

    await expect(startMfaEnrollment(CSRF_TOKEN)).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("posts a request built only from the shared confirm schema and validates the recovery-code payload", async () => {
    const confirmInput = { factorId: mfaEnrollStart.factorId, code: "123456" };
    const fetchMock = stubFetchOnce(jsonResponse(mfaConfirmResponse));

    await expect(
      confirmMfaEnrollment(confirmInput, CSRF_TOKEN),
    ).resolves.toEqual(mfaConfirmResponse);

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/admin/mfa/confirm");
    const init = calledInit(fetchMock);
    expect(JSON.parse(init.body as string)).toEqual(confirmInput);
    expect(new Headers(init.headers).get("x-csrf-token")).toBe(CSRF_TOKEN);
  });

  it("rejects a confirm request smuggling the shared secret as a field", async () => {
    const tamperedInput = {
      factorId: mfaEnrollStart.factorId,
      code: "123456",
      secret: mfaEnrollStart.secret,
    };

    await expect(
      confirmMfaEnrollment(tamperedInput, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("never logs the one-time recovery codes returned by confirm", async () => {
    stubFetchOnce(jsonResponse(mfaConfirmResponse));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await confirmMfaEnrollment(
      { factorId: mfaEnrollStart.factorId, code: "123456" },
      CSRF_TOKEN,
    );

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("posts a request built only from the shared verify schema and validates the response", async () => {
    const verifyInput = { code: "654321" };
    const fetchMock = stubFetchOnce(jsonResponse(mfaVerifyResponse));

    await expect(verifyMfa(verifyInput, CSRF_TOKEN)).resolves.toEqual(
      mfaVerifyResponse,
    );

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/admin/mfa/verify");
    const init = calledInit(fetchMock);
    expect(JSON.parse(init.body as string)).toEqual(verifyInput);
    expect(new Headers(init.headers).get("x-csrf-token")).toBe(CSRF_TOKEN);
  });

  it("rejects a verify request carrying an unrecognized field", async () => {
    const tamperedInput = { code: "654321", factorId: mfaEnrollStart.factorId };

    await expect(verifyMfa(tamperedInput, CSRF_TOKEN)).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("rejects a malformed verify response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({}));

    await expect(
      verifyMfa({ code: "654321" }, CSRF_TOKEN),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("posts an empty body to regenerate recovery codes and validates the response", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(mfaRecoveryResponse));

    await expect(regenerateMfaRecoveryCodes(CSRF_TOKEN)).resolves.toEqual(
      mfaRecoveryResponse,
    );

    const [calledPath] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/v1/admin/mfa/recovery-codes");
    const init = calledInit(fetchMock);
    expect(JSON.parse(init.body as string)).toEqual({});
    expect(new Headers(init.headers).get("x-csrf-token")).toBe(CSRF_TOKEN);
  });

  it("never logs the regenerated recovery codes it returns", async () => {
    stubFetchOnce(jsonResponse(mfaRecoveryResponse));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await regenerateMfaRecoveryCodes(CSRF_TOKEN);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("rejects a malformed recovery-codes response instead of returning it", async () => {
    stubFetchOnce(jsonResponse({ recoveryCodes: [] }));

    await expect(regenerateMfaRecoveryCodes(CSRF_TOKEN)).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});
