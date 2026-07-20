import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorLogService } from './error-log.service';

@Catch()
export class HttpErrorLoggingFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorLoggingFilter.name);

  constructor(private readonly errorLogService: ErrorLogService) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { user?: { id?: string } }>();
    const response = context.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode, message: 'Internal server error' };
    const responseBody =
      typeof exceptionResponse === 'string'
        ? { statusCode, message: exceptionResponse }
        : exceptionResponse;
    const message = this.getMessage(responseBody);
    const error = exception instanceof Error ? exception : undefined;

    await this.errorLogService.record({
      userId: request.user?.id,
      method: request.method,
      path: request.originalUrl || request.url,
      ip:
        request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
        request.socket.remoteAddress,
      statusCode,
      message,
      stack: error?.stack,
    });

    this.logger.error(`${request.method} ${request.originalUrl} ${statusCode}: ${message}`);
    response.status(statusCode).json(responseBody);
  }

  private getMessage(responseBody: unknown): string {
    if (typeof responseBody === 'string') return responseBody;
    if (typeof responseBody === 'object' && responseBody !== null) {
      const message = (responseBody as { message?: unknown }).message;
      return Array.isArray(message) ? message.join('; ') : String(message ?? 'Unknown error');
    }

    return 'Unknown error';
  }
}
