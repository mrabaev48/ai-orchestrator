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
  ProductionReadinessReviewView,
} from './read-models.js';
import type { ApplicationObservabilityStore, ApplicationStateStore } from './ports.js';
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
} from './read-models.js';

export interface TenantScopeInput {
  orgId?: string;
  projectId?: string;
}

export interface HistoryQueryInput extends TenantScopeInput {
  limit?: number;
  offset?: number;
  runId?: string;
  correlationId?: string;
}

export interface TraceAuditQueryInput extends HistoryQueryInput {
  taskId?: string;
  role?: string;
  toolName?: string;
  status?: 'ok' | 'error';
}

export interface EventHistoryQueryInput extends HistoryQueryInput {
  eventType?: NonNullable<Parameters<ApplicationStateStore['listEvents']>[0]>['eventType'];
}

export interface FailureHistoryQueryInput extends HistoryQueryInput {
  taskId?: string;
}

export interface ArtifactHistoryQueryInput extends HistoryQueryInput {
  type?: string;
}


export interface ReadinessScorecardPolicy {
  id: string;
  passThresholdPercent: number;
  enabledCriteria: Set<string>;
}

export const DEFAULT_READINESS_SCORECARD_POLICY: ReadinessScorecardPolicy = {
  id: 'default',
  passThresholdPercent: 100,
  enabledCriteria: new Set([
    'repo-lint',
    'repo-tests',
    'repo-typecheck',
    'execution-blockers',
    'failure-queue',
    'documentation-artifact',
  ]),
};

export interface ReadinessScorecardAuditContext {
  runId?: string;
  correlationId?: string;
}

export class DashboardQueryService {
  private readonly stateStore: ApplicationStateStore;
  private readonly observabilityStore: ApplicationObservabilityStore | undefined;
  private readonly readinessPolicy: ReadinessScorecardPolicy;

  constructor(
    stateStore: ApplicationStateStore,
    readinessPolicy: ReadinessScorecardPolicy = DEFAULT_READINESS_SCORECARD_POLICY,
    observabilityStore?: ApplicationObservabilityStore,
  ) {
    this.stateStore = stateStore;
    this.observabilityStore = observabilityStore;
    this.readinessPolicy = readinessPolicy;
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
    const failures = [...state.failures]
      .filter((failure) => (query.taskId ? failure.taskId === query.taskId : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const filtered = applyPagination(failures, offset, limit);

    return toFailureHistoryView(filtered, {
      total: failures.length,
      limit,
      offset,
    });
  }

  async getDecisions(query: HistoryQueryInput = {}): Promise<PaginatedView<DecisionHistoryItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const state = await this.stateStore.load();
    const allDecisions = [...state.decisions].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const decisions = applyPagination(allDecisions, offset, limit);

    return toDecisionHistoryView(decisions, {
      total: allDecisions.length,
      limit,
      offset,
    });
  }

  async getArtifacts(
    query: ArtifactHistoryQueryInput = {},
  ): Promise<PaginatedView<ArtifactHistoryItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const state = await this.stateStore.load();
    const allArtifacts = [...state.artifacts]
      .filter((artifact) => (query.type ? artifact.type === query.type : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const artifacts = applyPagination(allArtifacts, offset, limit);

    return toArtifactHistoryView(artifacts, {
      total: allArtifacts.length,
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
    void auditContext;
    return toReadinessScorecardView(state);
  }

  async getApprovals(query: { status?: 'pending' | 'approved' | 'rejected' | 'resumed' | 'completed' } = {}): Promise<ApprovalRequestView[]> {
    const state = await this.stateStore.load();
    const approvals = query.status
      ? state.approvals.filter((entry) => entry.status === query.status)
      : state.approvals;
    return toApprovalRequestView(approvals);
  }

  async getLatestProductionReadinessReview(
    query: TenantScopeInput & { runId?: string } = {},
  ): Promise<ProductionReadinessReviewView | null> {
    const state = await this.stateStore.load();
    assertTenantScope(state, query);

    const releaseArtifacts = [...state.artifacts]
      .filter((artifact) => artifact.type === 'release_assessment')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    for (const artifact of releaseArtifacts) {
      const payload = artifact.metadata.productionReadinessReview;
      if (!payload) {
        continue;
      }

      const parsed = parseProductionReadinessReviewPayload(payload);
      if (!parsed) {
        continue;
      }

      const runId = parsed.runId ?? artifact.metadata.runId;
      if (query.runId && runId !== query.runId) {
        continue;
      }

      return {
        artifactId: artifact.id,
        artifactCreatedAt: artifact.createdAt,
        verdict: parsed.verdict,
        blockers: parsed.blockers,
        warnings: parsed.warnings,
        evidence: parsed.evidence,
        ...(runId ? { runId } : {}),
        ...(parsed.reviewDateIso ? { reviewDateIso: parsed.reviewDateIso } : {}),
      };
    }

    return null;
  }

  async getMetricsAudit(query: HistoryQueryInput = {}): Promise<PaginatedView<MetricRollupItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const metrics = this.observabilityStore
      ? await this.observabilityStore.listMetrics({
        ...(query.runId ? { runId: query.runId } : {}),
        ...(query.correlationId ? { correlationId: query.correlationId } : {}),
      })
      : [];
    const buckets = new Map<string, MetricRollupItemView>();

    for (const metric of metrics) {
      const tags = metric.tags;
      const key = `${metric.metricType}:${metric.name}:${JSON.stringify(tags)}`;
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          name: metric.name,
          metricType: metric.metricType,
          total: metric.value,
          sampleCount: 1,
          lastValue: metric.value,
          lastSeenAt: metric.createdAt,
          tags,
        });
        continue;
      }

      existing.total += metric.value;
      existing.sampleCount += 1;
      existing.lastValue = metric.value;
      existing.lastSeenAt = metric.createdAt;
    }

    const items = applyPagination(
      [...buckets.values()].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt)),
      offset,
      limit,
    );

    return { total: buckets.size, limit, offset, items };
  }

  async getTraceAudit(query: TraceAuditQueryInput = {}): Promise<PaginatedView<SpanAuditItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const spans = this.observabilityStore
      ? await this.observabilityStore.listSpans({
        ...(query.runId ? { runId: query.runId } : {}),
        ...(query.correlationId ? { correlationId: query.correlationId } : {}),
        ...(query.taskId ? { taskId: query.taskId } : {}),
        ...(query.role ? { role: query.role } : {}),
        ...(query.toolName ? { toolName: query.toolName } : {}),
        ...(query.status ? { status: query.status } : {}),
      })
      : [];
    const items = applyPagination(
      spans.map((span) => ({
        spanName: span.spanName,
        ...(span.runId ? { runId: span.runId } : {}),
        ...(span.correlationId ? { correlationId: span.correlationId } : {}),
        ...(span.taskId ? { taskId: span.taskId } : {}),
        ...(span.role ? { role: span.role } : {}),
        ...(span.toolName ? { toolName: span.toolName } : {}),
        status: span.status,
        durationMs: span.durationMs,
        createdAt: span.createdAt,
      })),
      offset,
      limit,
    );
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

interface ProductionReadinessReviewPayload {
  runId?: string;
  reviewDateIso?: string;
  verdict: 'ready' | 'not_ready';
  blockers: { checkId: string; title: string; details: string }[];
  warnings: { checkId: string; title: string; details: string }[];
  evidence: {
    blockerCount: number;
    warningCount: number;
    totalChecks?: number;
    passedChecks?: number;
    failedChecks?: number;
  };
}

function parseProductionReadinessReviewPayload(payload: string): ProductionReadinessReviewPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.verdict !== 'ready' && candidate.verdict !== 'not_ready') {
    return null;
  }
  const evidence = candidate.evidence;
  if (typeof evidence !== 'object' || evidence === null) {
    return null;
  }
  const evidenceRecord = evidence as Record<string, unknown>;
  if (typeof evidenceRecord.blockerCount !== 'number' || typeof evidenceRecord.warningCount !== 'number') {
    return null;
  }
  const blockers = parseIssueList(candidate.blockers);
  const warnings = parseIssueList(candidate.warnings);
  if (!blockers || !warnings) {
    return null;
  }
  const runId = typeof candidate.runId === 'string' ? candidate.runId : undefined;
  const reviewDateIso = typeof candidate.reviewDateIso === 'string' ? candidate.reviewDateIso : undefined;
  return {
    ...(runId ? { runId } : {}),
    ...(reviewDateIso ? { reviewDateIso } : {}),
    verdict: candidate.verdict,
    blockers,
    warnings,
    evidence: {
      blockerCount: evidenceRecord.blockerCount,
      warningCount: evidenceRecord.warningCount,
      ...(typeof evidenceRecord.totalChecks === 'number' ? { totalChecks: evidenceRecord.totalChecks } : {}),
      ...(typeof evidenceRecord.passedChecks === 'number' ? { passedChecks: evidenceRecord.passedChecks } : {}),
      ...(typeof evidenceRecord.failedChecks === 'number' ? { failedChecks: evidenceRecord.failedChecks } : {}),
    },
  };
}

function parseIssueList(value: unknown): { checkId: string; title: string; details: string }[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items: { checkId: string; title: string; details: string }[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      return null;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.checkId !== 'string' || typeof record.title !== 'string' || typeof record.details !== 'string') {
      return null;
    }
    items.push({ checkId: record.checkId, title: record.title, details: record.details });
  }
  return items;
}

function applyPagination<TItem>(items: TItem[], offset: number, limit: number): TItem[] {
  return items.slice(offset, offset + limit);
}

function assertTenantScope(state: { orgId: string; projectId: string }, scope: TenantScopeInput): void {
  if (scope.orgId && scope.orgId !== state.orgId) { throw new Error(`Tenant org mismatch: requested ${scope.orgId}`); }
  if (scope.projectId && scope.projectId !== state.projectId) { throw new Error(`Tenant project mismatch: requested ${scope.projectId}`); }
}
