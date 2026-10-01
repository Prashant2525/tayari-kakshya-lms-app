import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ErrorCode, type ApiErrorBody } from '@tk/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from './app-error.js';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

/** Renders every error as `{ error: { code, message, details?, requestId } }`; never leaks stack traces. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const { status, body, headers } = this.toResponse(exception);
    body.error.requestId = String(request.id);

    if (status >= 500) {
      this.logger.error(
        { err: exception, requestId: request.id, url: request.url },
        'Unhandled error while processing request',
      );
    }
    if (headers) void reply.headers(headers);
    void reply.status(status).send(body);
  }

  private toResponse(exception: unknown): {
    status: number;
    body: ApiErrorBody;
    headers?: Record<string, string>;
  } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: { error: { code: exception.code, message: exception.message, details: exception.details } },
        headers: exception.headers,
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: 409,
          body: { error: { code: ErrorCode.CONFLICT, message: 'Resource already exists' } },
        };
      }
      if (exception.code === 'P2025') {
        return { status: 404, body: { error: { code: ErrorCode.NOT_FOUND, message: 'Resource not found' } } };
      }
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          error: {
            code:
              STATUS_CODES[status] ??
              (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED),
            message: status >= 500 ? 'Internal server error' : exception.message,
          },
        },
      };
    }
    // Fastify-level errors (malformed JSON, payload too large, unsupported media type).
    const statusCode = (exception as { statusCode?: unknown })?.statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return {
        status: statusCode,
        body: {
          error: {
            code: STATUS_CODES[statusCode] ?? ErrorCode.VALIDATION_FAILED,
            message: (exception as Error).message,
          },
        },
      };
    }
    return {
      status: 500,
      body: { error: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' } },
    };
  }
}
