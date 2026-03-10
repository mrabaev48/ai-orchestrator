import { ConsoleLogger, Injectable, type LoggerService } from '@nestjs/common';

import type { Logger } from '../../../../packages/shared/src/index.ts';

@Injectable()
export class NestStructuredLogger implements LoggerService {
  private readonly logger: Logger;
  private readonly fallbackLogger: ConsoleLogger;

  constructor(logger: Logger) {
    this.logger = logger.withContext({
      stage: 'dashboard_api',
    });
    this.fallbackLogger = new ConsoleLogger('DashboardApi');
  }

  log(message: string): void {
    this.logger.info(message, {
      event: 'nest_log',
    });
  }

  error(message: string, trace?: string): void {
    this.logger.error(message, {
      event: 'nest_error',
      data: trace,
    });
    this.fallbackLogger.error(message, trace);
  }

  warn(message: string): void {
    this.logger.warn(message, {
      event: 'nest_warn',
    });
  }

  debug(message: string): void {
    this.logger.debug(message, {
      event: 'nest_debug',
    });
  }

  verbose(message: string): void {
    this.logger.debug(message, {
      event: 'nest_verbose',
    });
  }
}
