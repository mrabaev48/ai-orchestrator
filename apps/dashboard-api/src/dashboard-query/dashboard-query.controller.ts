import { Controller, Get, Query } from '@nestjs/common';

import type {
  BacklogExportView,
  StateSummaryView,
} from '../../../../packages/application/src/read-models.ts';
import { BacklogExportQueryDto } from './dashboard-query.dto.ts';
import { DashboardReadApiService } from './dashboard-query.service.ts';

@Controller('api')
export class DashboardQueryController {
  private readonly dashboardReadApiService: DashboardReadApiService;

  constructor(dashboardReadApiService: DashboardReadApiService) {
    this.dashboardReadApiService = dashboardReadApiService;
  }

  @Get('state/summary')
  async getStateSummary(): Promise<StateSummaryView> {
    return await this.dashboardReadApiService.getStateSummary();
  }

  @Get('backlog/export')
  async getBacklogExport(
    @Query() query: BacklogExportQueryDto,
  ): Promise<{ format: 'json' | 'md'; content: string }> {
    const format = query.format ?? 'json';
    const exportView = await this.dashboardReadApiService.getBacklogExport();

    return {
      format,
      content: selectBacklogContent(exportView, format),
    };
  }
}

function selectBacklogContent(view: BacklogExportView, format: 'json' | 'md'): string {
  return format === 'md' ? view.markdown : view.json;
}
