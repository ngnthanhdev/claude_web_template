import { HttpStatus } from "@nestjs/common";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host.js";
import { describe, expect, it, vi } from "vitest";

import { ApiHttpException } from "../errors/api-http.exception.js";
import { ApiExceptionFilter } from "./api-exception.filter.js";

function captureException(exception: unknown) {
  const send = vi.fn();
  const status = vi.fn(() => ({ send }));
  const host = new ExecutionContextHost([undefined, { status }]);

  new ApiExceptionFilter().catch(exception, host);
  return { send, status };
}

describe("ApiExceptionFilter public exceptions", () => {
  it("serializes an allowlisted public code and safe message", () => {
    const exception = new ApiHttpException(
      HttpStatus.UNAUTHORIZED,
      "MAGIC_LINK_INVALID_OR_EXPIRED",
      new Error("database token hash leaked here"),
    );
    const { send, status } = captureException(exception);

    expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(send).toHaveBeenCalledWith({
      error: {
        code: "MAGIC_LINK_INVALID_OR_EXPIRED",
        message: "Magic link is invalid or expired",
      },
    });
    expect(JSON.stringify(send.mock.calls)).not.toContain("database token hash");
  });

  it("never accepts an arbitrary public error code", () => {
    expect(
      () =>
        new ApiHttpException(
          HttpStatus.BAD_REQUEST,
          // @ts-expect-error The public code allowlist is deliberately closed.
          "RAW_DATABASE_MESSAGE",
        ),
    ).toThrow();
  });
});
