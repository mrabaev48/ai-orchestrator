import { Inject, Injectable } from '@nestjs/common';

import { STATE_STORE } from '../dashboard-api.tokens.ts';

import {
  ApprovalGateService,
  DashboardQueryService as ApplicationDashboardQueryService,
} from '../../../../packages/application/src/index.ts';
import type { DomainEventType } from '../../../../packages/core/src/index.ts';
import { buildImmutableAuditLog, type StateStore } from '../../../../packages/state/src/index.ts';

interface TraceAuditQueryInput {
  limit?: number;
  offset?: number;
  runId?: string;
  correlationId?: string;
  taskId?: string;
  role?: string;
  toolName?: string;
  status?: 'ok' | 'error';
}

@Injectable()
export class DashboardReadApiService {
  private readonly dashboardQueryService: ApplicationDashboardQueryService;
  private readonly approvalGateService: ApprovalGateService;
  private readonly stateStore: StateStore;

  constructor(
    @Inject(ApplicationDashboardQueryService)
    dashboardQueryService: ApplicationDashboardQueryService,
    @Inject(ApprovalGateService)
    approvalGateService: ApprovalGateService,
    @Inject(STATE_STORE)
    stateStore: StateStore,
  ) {
    this.dashboardQueryService = dashboardQueryService;
    this.approvalGateService = approvalGateService;
    this.stateStore = stateStore;
  }

  async getStateSummary(orgId?: string, projectId?: string) {
    return await this.dashboardQueryService.getStateSummary({ ...(orgId ? { orgId } : {}), ...(projectId ? { projectId } : {}) });
  }

  async getMilestones(orgId?: string, projectId?: string) {
    return await this.dashboardQueryService.getMilestones({ ...(orgId ? { orgId } : {}), ...(projectId ? { projectId } : {}) });
  }

  async getBacklog(orgId?: string, projectId?: string) {
    return await this.dashboardQueryService.getBacklog({ ...(orgId ? { orgId } : {}), ...(projectId ? { projectId } : {}) });
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

  async getLatestRunSummary(orgId?: string, projectId?: string) {
    return await this.dashboardQueryService.getLatestRunSummary({ ...(orgId ? { orgId } : {}), ...(projectId ? { projectId } : {}) });
  }

  async getReadinessScorecard(orgId?: string, projectId?: string, runId?: string, correlationId?: string) {
    return await this.dashboardQueryService.getReadinessScorecard(
      { ...(orgId ? { orgId } : {}), ...(projectId ? { projectId } : {}) },
      { ...(runId ? { runId } : {}), ...(correlationId ? { correlationId } : {}) },
    );
  }

  async getApprovals(status?: 'pending' | 'approved' | 'rejected' | 'resumed' | 'completed') {
    return await this.dashboardQueryService.getApprovals(status ? { status } : {});
  }

  async getMetricsAudit(limit?: number, offset?: number) {
    return await this.dashboardQueryService.getMetricsAudit({
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
    });
  }

  async getTraceAudit(query: TraceAuditQueryInput = {}) {
    const normalized: TraceAuditQueryInput = {
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.offset === undefined ? {} : { offset: query.offset }),
      ...(query.runId === undefined ? {} : { runId: query.runId }),
      ...(query.correlationId === undefined ? {} : { correlationId: query.correlationId }),
      ...(query.taskId === undefined ? {} : { taskId: query.taskId }),
      ...(query.role === undefined ? {} : { role: query.role }),
      ...(query.toolName === undefined ? {} : { toolName: query.toolName }),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    return await this.dashboardQueryService.getTraceAudit(normalized);
  }


  async getImmutableAuditExport(runId?: string) {
    const events = await this.stateStore.listEvents();
    const filtered = runId ? events.filter((event) => event.runId === runId) : events;
    return buildImmutableAuditLog(filtered);
  }

  async getReviewBundle(runId?: string) {
    return await this.dashboardQueryService.getReviewBundle(runId);
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
  async getRunStepEvidence(runId?: string, taskId?: string, limit?: number, offset?: number) {
    return await this.stateStore.listRunSteps({
      ...(runId ? { runId } : {}),
      ...(taskId ? { taskId } : {}),
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
    });
  }
}
