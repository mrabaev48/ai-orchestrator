import type { StateStore } from '../../state/src/index.ts';
import type {
  ArtifactHistoryItemView,
  BacklogExportView,
  BacklogView,
  DashboardStateView,
  DecisionHistoryItemView,
  EventHistoryItemView,
  FailureHistoryItemView,
  LatestRunSummaryView,
  MilestoneListItemView,
  PaginatedView,
  ApprovalRequestView,
  MetricRollupItemView,
  SpanAuditItemView,
  ReviewBundleView,
  ReadinessScorecardView,
} from './read-models.ts';
import {
  toArtifactHistoryView,
  toBacklogExportView,
  toBacklogView,
  toDashboardStateView,
  toDecisionHistoryView,
  toEventHistoryView,
  toFailureHistoryView,
  toLatestRunSummaryView,
  toMilestoneListView,
  toApprovalRequestView,
  toReadinessScorecardView,
} from './read-models.ts';

export interface TenantScopeInput {
  orgId?: string;
  projectId?: string;
}

export interface HistoryQueryInput extends TenantScopeInput {
  limit?: number;
  offset?: number;
}

export interface EventHistoryQueryInput extends HistoryQueryInput {
  eventType?: NonNullable<Parameters<StateStore['listEvents']>[0]>['eventType'];
}

export interface FailureHistoryQueryInput extends HistoryQueryInput {
  taskId?: string;
}

export interface ArtifactHistoryQueryInput extends HistoryQueryInput {
  type?: string;
}

export interface ReadinessScorecardAuditContext {
  runId?: string;
  correlationId?: string;
}

export class DashboardQueryService {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  async getStateSummary(query: TenantScopeInput = {}): Promise<DashboardStateView> {
    const state = await this.stateStore.load();
    assertTenantScope(state, query);
    return toDashboardStateView(state);
  }

  async getMilestones(query: TenantScopeInput = {}): Promise<MilestoneListItemView[]> {
    const state = await this.stateStore.load();
    assertTenantScope(state, query);
    return toMilestoneListView(state);
  }

  async getBacklog(query: TenantScopeInput = {}): Promise<BacklogView> {
    const state = await this.stateStore.load();
    assertTenantScope(state, query);
    return toBacklogView(state.backlog);
  }

  async getBacklogExport(query: TenantScopeInput = {}): Promise<BacklogExportView> {
    const state = await this.stateStore.load();
    assertTenantScope(state, query);
    return toBacklogExportView(state);
  }

  async getEvents(query: EventHistoryQueryInput = {}): Promise<PaginatedView<EventHistoryItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const events = await this.stateStore.listEvents({
      limit,
      offset,
      ...(query.eventType ? { eventType: query.eventType } : {}),
    });

    return toEventHistoryView(events, {
      total: events.length,
      limit,
      offset,
    });
  }

  async getFailures(query: FailureHistoryQueryInput = {}): Promise<PaginatedView<FailureHistoryItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const state = await this.stateStore.load();
    const filtered = applyPagination(
      [...state.failures]
        .filter((failure) => (query.taskId ? failure.taskId === query.taskId : true))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      offset,
      limit,
    );

    return toFailureHistoryView(filtered, {
      total: filtered.length,
      limit,
      offset,
    });
  }

  async getDecisions(query: HistoryQueryInput = {}): Promise<PaginatedView<DecisionHistoryItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const state = await this.stateStore.load();
    const decisions = applyPagination(
      [...state.decisions].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      offset,
      limit,
    );

    return toDecisionHistoryView(decisions, {
      total: decisions.length,
      limit,
      offset,
    });
  }

  async getArtifacts(
    query: ArtifactHistoryQueryInput = {},
  ): Promise<PaginatedView<ArtifactHistoryItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const state = await this.stateStore.load();
    const artifacts = applyPagination(
      [...state.artifacts]
        .filter((artifact) => (query.type ? artifact.type === query.type : true))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      offset,
      limit,
    );

    return toArtifactHistoryView(artifacts, {
      total: artifacts.length,
      limit,
      offset,
    });
  }

  async getLatestRunSummary(query: TenantScopeInput = {}): Promise<LatestRunSummaryView | null> {
    const state = await this.stateStore.load();
    assertTenantScope(state, query);
    return toLatestRunSummaryView(state);
  }

  async getReadinessScorecard(
    query: TenantScopeInput = {},
    auditContext: ReadinessScorecardAuditContext = {},
  ): Promise<ReadinessScorecardView> {
    const state = await this.stateStore.load();
    assertTenantScope(state, query);
        ...(auditContext.correlationId ? { correlationId: auditContext.correlationId } : {}),
        ...(auditContext.runId ? { runId: auditContext.runId } : {}),
      ...(auditContext.correlationId ? { correlationId: auditContext.correlationId } : {}),
      ...(auditContext.runId ? { runId: auditContext.runId } : {}),
    }, auditContext.runId ? { runId: auditContext.runId } : {}));
  }

  async getApprovals(query: { status?: 'pending' | 'approved' | 'rejected' | 'resumed' | 'completed' } = {}): Promise<ApprovalRequestView[]> {
    const state = await this.stateStore.load();
    const approvals = query.status
      ? state.approvals.filter((entry) => entry.status === query.status)
      : state.approvals;
    return toApprovalRequestView(approvals);
  }

  async getMetricsAudit(query: HistoryQueryInput = {}): Promise<PaginatedView<MetricRollupItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const events = await this.stateStore.listEvents({ eventType: 'METRIC_RECORDED' });
    const buckets = new Map<string, MetricRollupItemView>();
    for (const event of events) {
      const payload = event.payload as {
        metricType?: 'counter' | 'histogram' | 'gauge';
        name?: string;
        value?: number;
        tags?: Record<string, string>;
      };
      if (typeof payload.name !== 'string' || typeof payload.value !== 'number') {
        continue;
      }
      const metricType = payload.metricType ?? 'counter';
      const tags = payload.tags ?? {};
      const key = `${metricType}:${payload.name}:${JSON.stringify(tags)}`;
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          name: payload.name,
          metricType,
          total: payload.value,
          sampleCount: 1,
          lastValue: payload.value,
          lastSeenAt: event.createdAt,
          tags,
        });
        continue;
      }
      existing.total += payload.value;
      existing.sampleCount += 1;
      existing.lastValue = payload.value;
      existing.lastSeenAt = event.createdAt;
    }
    const items = applyPagination(
      [...buckets.values()].sort((l, r) => r.lastSeenAt.localeCompare(l.lastSeenAt)),
      offset,
      limit,
    );
    return { total: buckets.size, limit, offset, items };
  }

  async getTraceAudit(query: HistoryQueryInput = {}): Promise<PaginatedView<SpanAuditItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const events = await this.stateStore.listEvents({ eventType: 'METRIC_RECORDED' });
    const spans = events
      .map((event) => {
        const payload = event.payload;
        const metricName = typeof payload.name === 'string' ? payload.name : null;
        if (payload.metricType !== 'histogram' || !metricName?.startsWith('span_')) {
          return null;
        }
        return {
          spanName: metricName,
          ...(event.runId ? { runId: event.runId } : {}),
          ...(typeof payload.taskId === 'string' ? { taskId: payload.taskId } : {}),
          ...(typeof payload.role === 'string' ? { role: payload.role } : {}),
          ...(typeof payload.toolName === 'string' ? { toolName: payload.toolName } : {}),
          status: payload.status === 'error' ? 'error' : 'ok',
          durationMs: typeof payload.value === 'number' ? payload.value : 0,
          createdAt: event.createdAt,
        };
      })
      .filter((item): item is SpanAuditItemView => item !== null);
    const items = applyPagination(spans, offset, limit);
    return { total: spans.length, limit, offset, items };
  }

  async getReviewBundle(runId?: string): Promise<ReviewBundleView | null> {
    const state = await this.stateStore.load();
    const events = await this.stateStore.listEvents();
    if (events.length === 0) {
      return null;
    }
    const runEvents = runId ? events.filter((event) => event.runId === runId) : events;
    const resolvedRunId = runId ?? runEvents[0]?.runId;
    if (!resolvedRunId) {
      return null;
    }

    const timeline = runEvents
      .sort((l, r) => l.createdAt.localeCompare(r.createdAt))
      .map((event) => ({
        id: event.id,
        type: event.eventType,
        createdAt: event.createdAt,
        summary: typeof event.payload.summary === 'string' ? event.payload.summary : event.eventType,
        ...(typeof event.payload.taskId === 'string' ? { taskId: event.payload.taskId } : {}),
        ...(typeof event.payload.role === 'string' ? { role: event.payload.role } : {}),
      }));

    const runArtifacts = state.artifacts
      .filter((artifact) => artifact.metadata.runId === resolvedRunId)
      .sort((l, r) => r.createdAt.localeCompare(l.createdAt));

    const diffArtifact = runArtifacts.find((artifact) => artifact.type === 'report' || artifact.type === 'integration_export');
    const diffMetadata = diffArtifact?.metadata;
    const diff = {
      summary: diffMetadata?.summary ?? (diffArtifact ? diffArtifact.title : 'No diff artifact captured'),
      ...(typeof diffMetadata?.filesChanged === 'string' ? { filesChanged: Number(diffMetadata.filesChanged) } : {}),
      ...(typeof diffMetadata?.additions === 'string' ? { additions: Number(diffMetadata.additions) } : {}),
      ...(typeof diffMetadata?.deletions === 'string' ? { deletions: Number(diffMetadata.deletions) } : {}),
    };

    const testEvidence = runArtifacts
      .filter((artifact) => artifact.type === 'test_plan' || artifact.type === 'report')
      .map((artifact) => ({
        artifactId: artifact.id,
        title: artifact.title,
        createdAt: artifact.createdAt,
        status: artifact.type === 'test_plan' ? 'unknown' as const : /fail/i.test(artifact.title) ? 'failed' as const : 'passed' as const,
      }));

    return {
      runId: resolvedRunId,
      timeline,
      diff,
      testEvidence,
      prBundle: {
        summary: `Review bundle for run ${resolvedRunId}`,
        artifacts: runArtifacts.map((artifact) => ({
          id: artifact.id,
          type: artifact.type,
          title: artifact.title,
          ...(artifact.location ? { location: artifact.location } : {}),
          ...(artifact.metadata.taskId ? { taskId: artifact.metadata.taskId } : {}),
          ...(artifact.metadata.runId ? { runId: artifact.metadata.runId } : {}),
          ...(artifact.metadata.milestoneId ? { milestoneId: artifact.metadata.milestoneId } : {}),
          ...(artifact.metadata.format ? { format: artifact.metadata.format } : {}),
          createdAt: artifact.createdAt,
        })),
      },
    };
  }
}

function normalizeHistoryQuery(query: HistoryQueryInput): { limit: number; offset: number } {
  return {
    limit: query.limit ?? 25,
    offset: query.offset ?? 0,
  };
}

function applyPagination<TItem>(items: TItem[], offset: number, limit: number): TItem[] {
  return items.slice(offset, offset + limit);
}


function assertTenantScope(state: { orgId: string; projectId: string }, scope: TenantScopeInput): void {
  if (scope.orgId && scope.orgId !== state.orgId) { throw new Error(`Tenant org mismatch: requested ${scope.orgId}`); }
  if (scope.projectId && scope.projectId !== state.projectId) { throw new Error(`Tenant project mismatch: requested ${scope.projectId}`); }
}
