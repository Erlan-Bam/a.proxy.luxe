import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class AdminLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AdminAudit');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const user = request.user;

    // Only log admin requests
    if (!user || user.type !== 'ADMIN') {
      return next.handle();
    }

    const { method, url } = request;
    const ip =
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.socket?.remoteAddress ||
      'unknown';
    const userId = user.id;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode;
          const duration = Date.now() - now;
          this.logger.log(
            `${new Date().toISOString()} | IP: ${ip} | ${method} ${url} | userId: ${userId} | ${statusCode} | ${duration}ms`,
          );
        },
        error: (error) => {
          const statusCode = error?.status || error?.statusCode || 500;
          const duration = Date.now() - now;
          this.logger.warn(
            `${new Date().toISOString()} | IP: ${ip} | ${method} ${url} | userId: ${userId} | ${statusCode} | ${duration}ms | ERROR: ${error.message}`,
          );
        },
      }),
    );
  }
}
