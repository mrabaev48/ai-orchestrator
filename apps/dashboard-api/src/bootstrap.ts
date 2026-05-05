import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { createDashboardApiRootModule } from './dashboard-api.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { NestStructuredLogger } from './common/nest-logger.js';
import type { DashboardRuntimeContext } from './config/dashboard-config.js';
import { createDashboardAuthMiddleware } from './security/dashboard-auth.middleware.js';

export async function createDashboardApiApp(runtimeContext: DashboardRuntimeContext) {
  const app = await NestFactory.create(createDashboardApiRootModule(runtimeContext.config), {
    bufferLogs: true,
  });

  app.useLogger(new NestStructuredLogger(runtimeContext.logger));
  app.use('/api', createDashboardAuthMiddleware(runtimeContext.config));
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.useGlobalFilters(new HttpExceptionFilter(runtimeContext.logger));

  if (runtimeContext.config.cors.allowedOrigins.length > 0) {
    app.enableCors({
      origin: runtimeContext.config.cors.allowedOrigins,
      methods: ['GET'],
      credentials: false,
      maxAge: 600,
    });
  }

  return app;
}
