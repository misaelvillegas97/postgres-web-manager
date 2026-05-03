import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '@postgres-web-manager/contracts';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string;
    let detail: string | undefined;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as Record<string, unknown>;
      message = (resp['message'] as string | string[]) instanceof Array
        ? (resp['message'] as string[]).join(', ')
        : (resp['message'] as string) ?? exception.message;
      detail = resp['error'] as string | undefined;
    } else {
      message = exception.message;
    }

    const body: ApiErrorResponse = {
      status,
      code: HttpStatus[status] ?? 'HTTP_ERROR',
      message,
      ...(detail ? { detail } : {}),
    };

    response.status(status).json({
      ...body,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
