import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import type {
  BacklogExportView,
} from '../../../../packages/application/src/read-models.ts';
import {
  ArtifactHistoryQueryDto,
  ApprovalDecisionBodyDto,
  ApprovalHistoryQueryDto,
  BacklogExportQueryDto,
  EventHistoryQueryDto,
  FailureHistoryQueryDto,
  HistoryQueryDto,
  RunStepEvidenceQueryDto,
  AuditExportQueryDto,
} from './dashboard-query.dto.ts';
import { DashboardReadApiService } from './dashboard-query.service.ts';

@Controller('api')
export class DashboardQueryController {
  private readonly dashboardReadApiService: DashboardReadApiService;

  constructor(dashboardReadApiService: DashboardReadApiService) {
    this.dashboardReadApiService = dashboardReadApiService;
  }

  @Get('state')
  async getStateSummary(@Query() query: HistoryQueryDto) {
    return await this.dashboardReadApiService.getStateSummary(query.orgId, query.projectId);
  }

  @Get('milestones')
  async getMilestones(@Query() query: HistoryQueryDto) {
    return await this.dashboardReadApiService.getMilestones(query.orgId, query.projectId);
  }

  @Get('backlog')
  async getBacklog(@Query() query: HistoryQueryDto) {
    return await this.dashboardReadApiService.getBacklog(query.orgId, query.projectId);
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


  @Get('evidence/run-steps')
  async getRunStepEvidence(@Query() query: RunStepEvidenceQueryDto) {
    return await this.dashboardReadApiService.getRunStepEvidence(query.runId, query.taskId, query.limit, query.offset);
  }

  @Get('runs/latest')
  async getLatestRunSummary(@Query() query: HistoryQueryDto) {
    return await this.dashboardReadApiService.getLatestRunSummary(query.orgId, query.projectId);
  }

  @Get('readiness/scorecard')
  async getReadinessScorecard(@Query() query: HistoryQueryDto) {
    return await this.dashboardReadApiService.getReadinessScorecard(
      query.orgId,
      query.projectId,
      query.runId,
      query.correlationId,
    );
  }

  @Get('approvals')
  async getApprovals(@Query() query: ApprovalHistoryQueryDto) {
    return await this.dashboardReadApiService.getApprovals(query.status);
  }

  @Get('audit/metrics')
  async getMetricsAudit(@Query() query: HistoryQueryDto) {
    return await this.dashboardReadApiService.getMetricsAudit(query.limit, query.offset);
  }


  @Get('audit/export')
  async getImmutableAuditExport(@Query() query: AuditExportQueryDto) {
    return {
      format: query.format ?? 'json',
      items: await this.dashboardReadApiService.getImmutableAuditExport(query.runId),
    };
  }

  @Get('audit/traces')
  async getTraceAudit(@Query() query: HistoryQueryDto) {
    return await this.dashboardReadApiService.getTraceAudit(query.limit, query.offset);
  }

  @Get('runs/review-bundle')
  async getReviewBundle(@Query('runId') runId?: string) {
    return await this.dashboardReadApiService.getReviewBundle(runId);
  }

  @Post('approvals/:requestId/approve')
  async approve(
    @Param('requestId') requestId: string,
    @Body() body: ApprovalDecisionBodyDto,
  ) {
    return await this.dashboardReadApiService.approve(requestId, body.actor);
  }

  @Post('approvals/:requestId/reject')
  async reject(
    @Param('requestId') requestId: string,
    @Body() body: ApprovalDecisionBodyDto,
  ) {
    return await this.dashboardReadApiService.reject(requestId, body.actor, body.reason ?? 'Rejected by operator');
  }

  @Post('approvals/:requestId/resume')
  async resume(
    @Param('requestId') requestId: string,
    @Body() body: ApprovalDecisionBodyDto,
  ) {
    return await this.dashboardReadApiService.resume(requestId, body.actor);
  }
}

function selectBacklogContent(view: BacklogExportView, format: 'json' | 'md'): string {
  return format === 'md' ? view.markdown : view.json;
}
