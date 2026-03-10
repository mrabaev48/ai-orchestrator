import { Controller, Get, Query } from '@nestjs/common';

import type {
  BacklogExportView,
} from '../../../../packages/application/src/read-models.ts';
import {
  ArtifactHistoryQueryDto,
  BacklogExportQueryDto,
  EventHistoryQueryDto,
  FailureHistoryQueryDto,
  HistoryQueryDto,
} from './dashboard-query.dto.ts';
import { DashboardReadApiService } from './dashboard-query.service.ts';

@Controller('api')
export class DashboardQueryController {
  private readonly dashboardReadApiService: DashboardReadApiService;

  constructor(dashboardReadApiService: DashboardReadApiService) {
    this.dashboardReadApiService = dashboardReadApiService;
  }

  @Get('state')
  async getStateSummary() {
    return await this.dashboardReadApiService.getStateSummary();
  }

  @Get('milestones')
  async getMilestones() {
    return await this.dashboardReadApiService.getMilestones();
  }

  @Get('backlog')
  async getBacklog() {
    return await this.dashboardReadApiService.getBacklog();
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

  @Get('events')
  async getEvents(@Query() query: EventHistoryQueryDto) {
    return await this.dashboardReadApiService.getEvents(query.limit, query.offset, query.eventType);
  }

  @Get('failures')
  async getFailures(@Query() query: FailureHistoryQueryDto) {
    return await this.dashboardReadApiService.getFailures(query.limit, query.offset, query.taskId);
  }

  @Get('decisions')
  async getDecisions(@Query() query: HistoryQueryDto) {
    return await this.dashboardReadApiService.getDecisions(query.limit, query.offset);
  }

  @Get('artifacts')
  async getArtifacts(@Query() query: ArtifactHistoryQueryDto) {
    return await this.dashboardReadApiService.getArtifacts(query.limit, query.offset, query.type);
  }

  @Get('runs/latest')
  async getLatestRunSummary() {
    return await this.dashboardReadApiService.getLatestRunSummary();
  }
}

function selectBacklogContent(view: BacklogExportView, format: 'json' | 'md'): string {
  return format === 'md' ? view.markdown : view.json;
}
