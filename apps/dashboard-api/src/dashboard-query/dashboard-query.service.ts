import { Inject, Injectable } from '@nestjs/common';

import {
  DashboardQueryService as ApplicationDashboardQueryService,
} from '../../../../packages/application/src/index.ts';

@Injectable()
export class DashboardReadApiService {
  private readonly dashboardQueryService: ApplicationDashboardQueryService;

  constructor(
    @Inject(ApplicationDashboardQueryService)
    dashboardQueryService: ApplicationDashboardQueryService,
  ) {
    this.dashboardQueryService = dashboardQueryService;
  }

  async getStateSummary() {
    return await this.dashboardQueryService.getStateSummary();
  }

  async getBacklogExport() {
    return await this.dashboardQueryService.getBacklogExport();
  }
}
