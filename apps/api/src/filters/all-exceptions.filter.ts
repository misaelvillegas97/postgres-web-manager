import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { mapPostgresError } from '../postgres/postgres-error.mapper';
import { ApiErrorResponse } from '@postgres-web-manager/contracts';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      // Let HttpExceptionFilter handle these — this filter is a catch-all fallback
      const status = exception.getStatus();
      response.status(status).json({
        status,
        code: HttpStatus[status] ?? 'HTTP_ERROR',
        message: exception.message,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check if it looks like a PostgreSQL error
    const isPostgresError =
      exception &&
      typeof exception === 'object' &&
      'code' in (exception as Record<string, unknown>) &&
      typeof (exception as Record<string, unknown>)['code'] === 'string' &&
      /^[0-9A-Z]{5}$/.test((exception as Record<string, unknown>)['code'] as string);

    if (isPostgresError) {
      const pgErr = mapPostgresError(exception);
      const body: ApiErrorResponse & Record<string, unknown> = {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: pgErr.code ?? 'POSTGRES_ERROR',
        message: pgErr.message,
        ...(pgErr.detail ? { detail: pgErr.detail } : {}),
        ...(pgErr.hint ? { hint: pgErr.hint } : {}),
        ...(pgErr.severity ? { severity: pgErr.severity } : {}),
        path: request.url,
        timestamp: new Date().toISOString(),
      };
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json(body);
      return;
    }

    // Unknown / unexpected error — log internally, return generic message
    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));

    const body: ApiErrorResponse & Record<string, unknown> = {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
