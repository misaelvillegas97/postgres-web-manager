import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { requestId?: string }>();
    const res = http.getResponse<Response>();

    const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const { method, url } = req;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startedAt;
          this.logger.log(
            JSON.stringify({
              requestId,
              method,
              url,
              statusCode: res.statusCode,
              durationMs,
            }),
          );
        },
        error: (err: unknown) => {
          const durationMs = Date.now() - startedAt;
          const statusCode =
            err && typeof err === 'object' && 'status' in err
              ? (err as { status: number }).status
              : 500;
          this.logger.warn(
            JSON.stringify({
              requestId,
              method,
              url,
              statusCode,
              durationMs,
              error:
                err instanceof Error ? err.message : String(err),
            }),
          );
        },
      }),
    );
  }
}
