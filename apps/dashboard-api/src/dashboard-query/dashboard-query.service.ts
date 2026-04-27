import { Inject, Injectable } from '@nestjs/common';

import {
  ApprovalGateService,
  DashboardQueryService as ApplicationDashboardQueryService,
} from '../../../../packages/application/src/index.ts';
import type { DomainEventType } from '../../../../packages/core/src/index.ts';

@Injectable()
export class DashboardReadApiService {
  private readonly dashboardQueryService: ApplicationDashboardQueryService;
  private readonly approvalGateService: ApprovalGateService;

  constructor(
    @Inject(ApplicationDashboardQueryService)
    dashboardQueryService: ApplicationDashboardQueryService,
    @Inject(ApprovalGateService)
    approvalGateService: ApprovalGateService,
  ) {
    this.dashboardQueryService = dashboardQueryService;
    this.approvalGateService = approvalGateService;
  }

  async getStateSummary() {
    return await this.dashboardQueryService.getStateSummary();
  }

  async getMilestones() {
    return await this.dashboardQueryService.getMilestones();
  }

  async getBacklog() {
    return await this.dashboardQueryService.getBacklog();
  }

  async getBacklogExport() {
    return await this.dashboardQueryService.getBacklogExport();
  }

  async getEvents(limit?: number, offset?: number, eventType?: DomainEventType) {
    return await this.dashboardQueryService.getEvents({
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
      ...(eventType ? { eventType } : {}),
    });
  }

  async getFailures(limit?: number, offset?: number, taskId?: string) {
    return await this.dashboardQueryService.getFailures({
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
      ...(taskId ? { taskId } : {}),
    });
  }

  async getDecisions(limit?: number, offset?: number) {
    return await this.dashboardQueryService.getDecisions({
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
    });
  }

  async getArtifacts(limit?: number, offset?: number, type?: string) {
    return await this.dashboardQueryService.getArtifacts({
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
      ...(type ? { type } : {}),
    });
  }

  async getLatestRunSummary() {
    return await this.dashboardQueryService.getLatestRunSummary();
  }

  async getApprovals(status?: 'pending' | 'approved' | 'rejected' | 'resumed' | 'completed') {
    return await this.dashboardQueryService.getApprovals(status ? { status } : {});
  }

  async approve(requestId: string, actor: string) {
    return await this.approvalGateService.approve(requestId, actor);
  }

  async reject(requestId: string, actor: string, reason: string) {
    return await this.approvalGateService.reject(requestId, actor, reason);
  }

  async resume(requestId: string, actor: string) {
    return await this.approvalGateService.resume(requestId, actor);
  }
}
