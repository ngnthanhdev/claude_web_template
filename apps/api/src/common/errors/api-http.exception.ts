import { HttpException, type HttpStatus } from "@nestjs/common";

const publicErrorMessages = {
  MAGIC_LINK_INVALID_OR_EXPIRED: "Magic link is invalid or expired",
  SESSION_UNAUTHENTICATED: "Authentication is required",
  CSRF_INVALID: "CSRF token is invalid",
} as const;

export type PublicApiErrorCode = keyof typeof publicErrorMessages;

function isPublicApiErrorCode(value: string): value is PublicApiErrorCode {
  return Object.hasOwn(publicErrorMessages, value);
}

export class ApiHttpException extends HttpException {
  readonly publicCode: PublicApiErrorCode;

  constructor(
    status: HttpStatus,
    publicCode: PublicApiErrorCode,
    cause?: Error,
  ) {
    if (!isPublicApiErrorCode(publicCode)) {
      throw new Error("Unsupported public API error code");
    }
    super(publicErrorMessages[publicCode], status, cause === undefined ? undefined : { cause });
    this.publicCode = publicCode;
  }
}
