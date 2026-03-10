import {
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';

import type { Logger } from '../../../../packages/shared/src/index.ts';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.withContext({
      stage: 'dashboard_api',
    });
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.error('HTTP request failed', {
      event: 'dashboard_api_request_failed',
      result: 'fail',
      reason: status.toString(),
      data: {
        method: request.method,
        path: request.url,
        exception,
      },
    });

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      error: exception instanceof HttpException ? exception.message : 'Internal server error',
    });
  }
}
