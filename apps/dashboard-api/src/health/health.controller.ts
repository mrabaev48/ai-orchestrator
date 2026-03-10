import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

import { DashboardReadinessService } from './health.service.ts';

@Controller('health')
export class HealthController {
  private readonly healthCheckService: HealthCheckService;
  private readonly dashboardReadinessService: DashboardReadinessService;

  constructor(
    healthCheckService: HealthCheckService,
    dashboardReadinessService: DashboardReadinessService,
  ) {
    this.healthCheckService = healthCheckService;
    this.dashboardReadinessService = dashboardReadinessService;
  }

  @Get('live')
  getLiveness(): { status: 'ok'; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HealthCheck()
  async getReadiness() {
    return await this.healthCheckService.check([
      async () => this.dashboardReadinessService.checkStateStore(),
    ]);
  }
}
