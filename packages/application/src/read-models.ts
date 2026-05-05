import type {
  ArtifactRecord,
  Backlog,
  DecisionLogItem,
  DomainEvent,
  FailureRecord,
  ApprovalRequest,
  Milestone,
  ProjectState,
} from '../../core/src/index.ts';
import { redactSecrets } from '../../shared/src/index.ts';

export interface StateSummaryView {
  orgId: string;
  projectId: string;
  projectName: string;
  summary: string;
  currentMilestoneId?: string;
  health: ProjectState['repoHealth'];
  counts: {
    milestones: number;
    tasks: number;
    failures: number;
    architectureFindings: number;
    completedTasks: number;
    blockedTasks: number;
    pendingApprovals: number;
  };
}

export interface BacklogExportView {
  markdown: string;
  json: string;
}

export interface DashboardStateView extends StateSummaryView {
  activeTaskId?: string;
}

export interface MilestoneListItemView {
  id: string;
  title: string;
  goal: string;
  status: Milestone['status'];
  isCurrent: boolean;
  epicCount: number;
  exitCriteriaCount: number;
}

export interface BacklogTaskView {
  id: string;
  featureId: string;
  title: string;
  status: string;
  priority: string;
  acceptanceCriteria: string[];
  dependsOn: string[];
  splitFromTaskId?: string;
}

export interface BacklogFeatureView {
  id: string;
  epicId: string;
  title: string;
  outcome: string;
  taskIds: string[];
}

export interface BacklogEpicView {
  id: string;
  title: string;
  goal: string;
  featureIds: string[];
}

export interface BacklogView {
  epics: BacklogEpicView[];
  features: BacklogFeatureView[];
  tasks: BacklogTaskView[];
}

export interface PaginatedView<TItem> {
  total: number;
  limit: number;
  offset: number;
  items: TItem[];
}

export interface EventHistoryItemView {
  id: string;
  type: DomainEvent['eventType'];
  createdAt: string;
  runId?: string;
  summary: string;
  taskId?: string;
  milestoneId?: string;
  role?: string;
}

export interface FailureHistoryItemView {
  id: string;
  taskId: string;
  role: FailureRecord['role'];
  reason: string;
  retrySuggested: boolean;
  symptoms: string[];
  badPatterns: string[];
  createdAt: string;
}

export interface DecisionHistoryItemView {
  id: string;
  title: string;
  decision: string;
  rationale: string;
  affectedAreas: string[];
  createdAt: string;
}

export interface ArtifactHistoryItemView {
  id: string;
  type: ArtifactRecord['type'];
  title: string;
  location?: string;
  taskId?: string;
  runId?: string;
  milestoneId?: string;
  format?: string;
  createdAt: string;
}

export interface LatestRunSummaryView {
  id: string;
  title: string;
  createdAt: string;
  taskId?: string;
  summary?: string;
}

export interface ApprovalRequestView {
  id: string;
  runId: string;
  taskId: string;
  reason: string;
  requestedAction: ApprovalRequest['requestedAction'];
  riskLevel: ApprovalRequest['riskLevel'];
  status: ApprovalRequest['status'];
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  resumedBy?: string;
  resumedAt?: string;
  completedAt?: string;
}

export interface MetricRollupItemView {
  name: string;
  metricType: 'counter' | 'histogram' | 'gauge';
  total: number;
  sampleCount: number;
  lastValue: number;
  lastSeenAt: string;
  tags: Record<string, string>;
}

export interface SpanAuditItemView {
  spanName: string;
  runId?: string;
  correlationId?: string;
  taskId?: string;
  role?: string;
  toolName?: string;
  status: 'ok' | 'error';
  durationMs: number;
  createdAt: string;
}

export interface RunTimelineItemView {
  id: string;
  type: DomainEvent['eventType'];
  createdAt: string;
  summary: string;
  taskId?: string;
  role?: string;
}

export interface DiffIntelligenceView {
  summary: string;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
}

export interface TestEvidenceItemView {
  artifactId: string;
  title: string;
  createdAt: string;
  status: 'passed' | 'failed' | 'unknown';
}

export interface ReviewBundleView {
  runId: string;
  timeline: RunTimelineItemView[];
  diff: DiffIntelligenceView;
  testEvidence: TestEvidenceItemView[];
  prBundle: {
    summary: string;
    artifacts: ArtifactHistoryItemView[];
  };
}

export interface ReadinessScorecardCriterionView {
  id: string;
  description: string;
  status: 'pass' | 'fail';
  evidence: string;
}

export interface ReadinessScorecardView {
  generatedAt: string;
  verdict: 'ready' | 'blocked';
  score: {
    passed: number;
    total: number;
    percentage: number;
  };
  criteria: ReadinessScorecardCriterionView[];
}

export function toStateSummaryView(state: ProjectState): StateSummaryView {
  return {
    orgId: state.orgId,
    projectId: state.projectId,
    projectName: state.projectName,
    summary: state.summary,
    ...(state.currentMilestoneId ? { currentMilestoneId: state.currentMilestoneId } : {}),
    health: state.repoHealth,
    counts: {
      milestones: Object.keys(state.milestones).length,
      tasks: Object.keys(state.backlog.tasks).length,
      failures: state.failures.length,
      architectureFindings: state.architecture.findings.length,
      completedTasks: state.execution.completedTaskIds.length,
      blockedTasks: state.execution.blockedTaskIds.length,
      pendingApprovals: state.approvals.filter((entry) => entry.status === 'pending').length,
    },
  };
}

export function toDashboardStateView(state: ProjectState): DashboardStateView {
  return {
    ...toStateSummaryView(state),
    ...(state.execution.activeTaskId ? { activeTaskId: state.execution.activeTaskId } : {}),
  };
}

export function toReadinessScorecardView(state: ProjectState): ReadinessScorecardView {
  const criteria: ReadinessScorecardCriterionView[] = [
    {
      id: 'repo-lint',
      description: 'Repository lint status is passing',
      status: state.repoHealth.lint === 'passing' ? 'pass' : 'fail',
      evidence: `repoHealth.lint=${state.repoHealth.lint}`,
    },
    {
      id: 'repo-tests',
      description: 'Repository tests status is passing',
      status: state.repoHealth.tests === 'passing' ? 'pass' : 'fail',
      evidence: `repoHealth.tests=${state.repoHealth.tests}`,
    },
    {
      id: 'repo-typecheck',
      description: 'Repository typecheck status is passing',
      status: state.repoHealth.typecheck === 'passing' ? 'pass' : 'fail',
      evidence: `repoHealth.typecheck=${state.repoHealth.typecheck}`,
    },
    {
      id: 'execution-blockers',
      description: 'No blocked tasks remain',
      status: state.execution.blockedTaskIds.length === 0 ? 'pass' : 'fail',
      evidence: `blockedTaskIds=${state.execution.blockedTaskIds.length}`,
    },
    {
      id: 'failure-queue',
      description: 'No unresolved failures remain',
      status: state.failures.length === 0 ? 'pass' : 'fail',
      evidence: `failures=${state.failures.length}`,
    },
    {
      id: 'documentation-artifact',
      description: 'Documentation artifact is present',
      status: state.artifacts.some((artifact) => artifact.type === 'documentation') ? 'pass' : 'fail',
      evidence: `documentationArtifacts=${state.artifacts.filter((artifact) => artifact.type === 'documentation').length}`,
    },
  ];
  const passed = criteria.filter((item) => item.status === 'pass').length;
  const total = criteria.length;

  return {
    generatedAt: new Date().toISOString(),
    verdict: passed === total ? 'ready' : 'blocked',
    score: {
      passed,
      total,
      percentage: Math.round((passed / total) * 100),
    },
    criteria,
  };
}

export function toBacklogExportView(state: ProjectState): BacklogExportView {
  const lines = ['# Backlog export', ''];

  for (const epic of Object.values(state.backlog.epics)) {
    lines.push(`## ${epic.title}`);
    lines.push(epic.goal);
    lines.push('');

    for (const featureId of epic.featureIds) {
      const feature = state.backlog.features[featureId];
      if (!feature) {
        continue;
      }

      lines.push(`### ${feature.title}`);
      lines.push(feature.outcome);
      lines.push('');

      for (const taskId of feature.taskIds) {
        const task = state.backlog.tasks[taskId];
        if (!task) {
          continue;
        }

        lines.push(`- [${task.status === 'done' ? 'x' : ' '}] ${task.title} (${task.priority})`);
      }

      lines.push('');
    }
  }

  return {
    markdown: `${lines.join('\n').trim()}\n`,
    json: JSON.stringify(state.backlog, null, 2),
  };
}

export function toBacklogView(backlog: Backlog): BacklogView {
  return {
    epics: Object.values(backlog.epics).map((epic) => ({
      id: epic.id,
      title: epic.title,
      goal: epic.goal,
      featureIds: [...epic.featureIds],
    })),
    features: Object.values(backlog.features).map((feature) => ({
      id: feature.id,
      epicId: feature.epicId,
      title: feature.title,
      outcome: feature.outcome,
      taskIds: [...feature.taskIds],
    })),
    tasks: Object.values(backlog.tasks).map((task) => ({
      id: task.id,
      featureId: task.featureId,
      title: task.title,
      status: task.status,
      priority: task.priority,
      acceptanceCriteria: [...task.acceptanceCriteria],
      dependsOn: [...task.dependsOn],
      ...(task.splitFromTaskId ? { splitFromTaskId: task.splitFromTaskId } : {}),
    })),
  };
}

export function toMilestoneListView(state: ProjectState): MilestoneListItemView[] {
  return Object.values(state.milestones)
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      goal: milestone.goal,
      status: milestone.status,
      isCurrent: state.currentMilestoneId === milestone.id,
      epicCount: milestone.epicIds.length,
      exitCriteriaCount: milestone.exitCriteria.length,
    }));
}

export function toEventHistoryView(
  events: DomainEvent[],
  pagination: { total: number; limit: number; offset: number },
): PaginatedView<EventHistoryItemView> {
  return {
    ...pagination,
    items: events.map((event) => {
      const payload = redactSecrets(event.payload);

      return {
        id: event.id,
        type: event.eventType,
        createdAt: event.createdAt,
        ...(event.runId ? { runId: event.runId } : {}),
        ...(typeof payload.taskId === 'string' ? { taskId: payload.taskId } : {}),
        ...(typeof payload.milestoneId === 'string' ? { milestoneId: payload.milestoneId } : {}),
        ...(typeof payload.role === 'string' ? { role: payload.role } : {}),
        summary: summarizePayload(payload),
      };
    }),
  };
}

export function toFailureHistoryView(
  failures: FailureRecord[],
  pagination: { total: number; limit: number; offset: number },
): PaginatedView<FailureHistoryItemView> {
  return {
    ...pagination,
    items: failures.map((failure) => ({
      id: failure.id,
      taskId: failure.taskId,
      role: failure.role,
      reason: failure.reason,
      retrySuggested: failure.retrySuggested,
      symptoms: [...failure.symptoms],
      badPatterns: [...failure.badPatterns],
      createdAt: failure.createdAt,
    })),
  };
}

export function toDecisionHistoryView(
  decisions: DecisionLogItem[],
  pagination: { total: number; limit: number; offset: number },
): PaginatedView<DecisionHistoryItemView> {
  return {
    ...pagination,
    items: decisions.map((decision) => ({
      id: decision.id,
      title: decision.title,
      decision: decision.decision,
      rationale: decision.rationale,
      affectedAreas: [...decision.affectedAreas],
      createdAt: decision.createdAt,
    })),
  };
}

export function toArtifactHistoryView(
  artifacts: ArtifactRecord[],
  pagination: { total: number; limit: number; offset: number },
): PaginatedView<ArtifactHistoryItemView> {
  return {
    ...pagination,
    items: artifacts.map((artifact) => ({
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
  };
}

export function toLatestRunSummaryView(state: ProjectState): LatestRunSummaryView | null {
  const artifact = [...state.artifacts]
    .filter((entry) => entry.type === 'run_summary')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  if (!artifact) {
    return null;
  }

  return {
    id: artifact.id,
    title: artifact.title,
    createdAt: artifact.createdAt,
    ...(artifact.metadata.taskId ? { taskId: artifact.metadata.taskId } : {}),
    ...(artifact.metadata.summary ? { summary: artifact.metadata.summary } : {}),
  };
}

export function toApprovalRequestView(requests: ApprovalRequest[]): ApprovalRequestView[] {
  return requests
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((request) => ({
      id: request.id,
      runId: request.runId,
      taskId: request.taskId,
      reason: request.reason,
      requestedAction: request.requestedAction,
      riskLevel: request.riskLevel,
      status: request.status,
      createdAt: request.createdAt,
      ...(request.approvedBy ? { approvedBy: request.approvedBy } : {}),
      ...(request.approvedAt ? { approvedAt: request.approvedAt } : {}),
      ...(request.rejectedBy ? { rejectedBy: request.rejectedBy } : {}),
      ...(request.rejectedAt ? { rejectedAt: request.rejectedAt } : {}),
      ...(request.rejectionReason ? { rejectionReason: request.rejectionReason } : {}),
      ...(request.resumedBy ? { resumedBy: request.resumedBy } : {}),
      ...(request.resumedAt ? { resumedAt: request.resumedAt } : {}),
      ...(request.completedAt ? { completedAt: request.completedAt } : {}),
    }));
}

function summarizePayload(payload: Record<string, unknown>): string {
  const parts = Object.entries(payload)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 4)
    .map(([key, value]) => `${key}=${String(value)}`);

  return parts.length > 0 ? parts.join(' | ') : 'No summary available';
}
