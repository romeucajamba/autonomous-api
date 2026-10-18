import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { method, originalUrl } = req;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;
          this.logger.log(
            `[${method}] ${originalUrl} -> ${statusCode} +${duration}ms [IP: ${ip}]`,
          );
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          const statusCode = err.status || res.statusCode || 500;
          this.logger.warn(
            `[${method}] ${originalUrl} -> ${statusCode} (${err.name || 'Error'}) +${duration}ms [IP: ${ip}]`,
          );
        },
      }),
    );
  }
}
