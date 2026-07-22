import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { ApiError } from "@marketplace/shared/api";
import type { FastifyReply } from "fastify";
import { ZodValidationException } from "nestjs-zod";

function httpMessage(response: unknown, fallback: string): string {
  if (typeof response === "string") {
    return response;
  }

  if (typeof response === "object" && response !== null && "message" in response) {
    const message = response.message;
    if (typeof message === "string") {
      return message;
    }
  }

  return fallback;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof ZodValidationException) {
      const body = {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: { issues: exception.getZodError() },
        },
      } satisfies ApiError;
      void reply.status(HttpStatus.UNPROCESSABLE_ENTITY).send(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = {
        error: {
          code: HttpStatus[status] ?? "HTTP_ERROR",
          message: httpMessage(exception.getResponse(), exception.message),
        },
      } satisfies ApiError;
      void reply.status(status).send(body);
      return;
    }

    this.logger.error("Unhandled request exception", exception instanceof Error ? exception.stack : undefined);
    const body = {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      },
    } satisfies ApiError;
    void reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send(body);
  }
}
