import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { createDashboardApiRootModule } from './dashboard-api.module.ts';
import { HttpExceptionFilter } from './common/http-exception.filter.ts';
import { NestStructuredLogger } from './common/nest-logger.ts';
import type { DashboardRuntimeContext } from './config/dashboard-config.ts';

export async function createDashboardApiApp(runtimeContext: DashboardRuntimeContext) {
  const app = await NestFactory.create(createDashboardApiRootModule(runtimeContext.config), {
    bufferLogs: true,
  });

  app.useLogger(new NestStructuredLogger(runtimeContext.logger));
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.useGlobalFilters(new HttpExceptionFilter(runtimeContext.logger));

  return app;
}
