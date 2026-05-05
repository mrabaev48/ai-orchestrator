import {
  assertProjectState,
  defaultArtifactSchemaRegistry,
  verifyRunStepEvidenceChain,
  assertRunStepTransitionAllowed,
  type ArtifactRecord,
  type DecisionLogItem,
  type DomainEvent,
  type FailureRecord,
  type ProjectState,
  type RunStepLogEntry,
  type ExecutionPolicyDecision,
} from '../../../core/src/index.ts';
import type { ListEventsQuery, ListRunStepsQuery, PolicyDecisionQuery, RecordFailureInput, StateStore } from '../StateStore.ts';
import { StateStoreError } from '../../../shared/src/index.ts';

export class InMemoryStateStore implements StateStore {
  readonly events: DomainEvent[] = [];
  private state: ProjectState;

  constructor(initialState: ProjectState) {
    assertProjectState(initialState);
    this.state = structuredClone(initialState);
  }

  async load(): Promise<ProjectState> {
    return structuredClone(this.state);
  }

  async save(state: ProjectState): Promise<void> {
    assertProjectState(state);
    this.state = structuredClone(state);
  }

  async saveWithEvents(state: ProjectState, events: readonly DomainEvent[]): Promise<void> {
    assertProjectState(state);
    this.state = structuredClone(state);
    for (const event of events) {
      this.events.push(structuredClone(event));
    }
  }

  async listEvents(query: ListEventsQuery = {}): Promise<DomainEvent[]> {
    const filtered = query.eventType
      ? this.events.filter((event) => event.eventType === query.eventType)
      : this.events;

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;

    return structuredClone(
      [...filtered]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(offset, offset + limit),
    );
  }

  async listRunSteps(query: ListRunStepsQuery = {}): Promise<RunStepLogEntry[]> {
    const state = await this.load();
    const steps = state.execution.runStepLog ?? [];
    const filtered = steps.filter((step) => {
      if (query.runId && step.runId !== query.runId) {
        return false;
      }
      if (query.taskId && step.taskId !== query.taskId) {
        return false;
      }
      return true;
    });

    if (query.runId) {
      const issues = verifyRunStepEvidenceChain(filtered);
      if (issues.length > 0) {
        throw new StateStoreError('EVIDENCE_INTEGRITY_VIOLATION', { details: { runId: query.runId, issues } });
      }
    }

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return filtered
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(offset, offset + limit);
  }

  async recordEvent(event: DomainEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async recordFailure(input: RecordFailureInput): Promise<FailureRecord> {
    const current = await this.load();
    if (!current.backlog.tasks[input.taskId]) {
      throw new StateStoreError(`Cannot record failure for missing task ${input.taskId}`);
    }

    const failure: FailureRecord = {
      id: crypto.randomUUID(),
      taskId: input.taskId,
      role: input.role,
      reason: input.reason,
      symptoms: input.symptoms ?? [],
      badPatterns: input.badPatterns ?? [],
      retrySuggested: input.retrySuggested ?? true,
      ...(input.status ? { status: input.status } : {}),
      ...(input.checkpointRunId ? { checkpointRunId: input.checkpointRunId } : {}),
      ...(input.checkpointStepId ? { checkpointStepId: input.checkpointStepId } : {}),
      ...(input.deadLetteredAt ? { deadLetteredAt: input.deadLetteredAt } : {}),
      createdAt: new Date().toISOString(),
    };

    current.failures.push(failure);
    current.execution.retryCounts[input.taskId] = (current.execution.retryCounts[input.taskId] ?? 0) + 1;
    await this.save(current);
    return failure;
  }

  async recordArtifact(artifact: ArtifactRecord): Promise<void> {
    const issues = defaultArtifactSchemaRegistry.validate(artifact);
    if (issues.length > 0) {
      throw new StateStoreError('Artifact schema validation failed', {
        details: { artifactType: artifact.type, issues },
      });
    }
    const current = await this.load();
    current.artifacts.push(structuredClone(artifact));
    await this.save(current);
  }

  async recordDecision(decision: DecisionLogItem): Promise<void> {
    const current = await this.load();
    current.decisions.push(structuredClone(decision));
    await this.save(current);
  }


  async recordPolicyDecision(decision: ExecutionPolicyDecision): Promise<void> {
    const current = await this.load();
    current.policyDecisions.push(structuredClone(decision));
    await this.save(current);
  }

  async getPolicyDecision(query: PolicyDecisionQuery): Promise<ExecutionPolicyDecision | null> {
    const current = await this.load();
    const found = current.policyDecisions
      .slice()
      .reverse()
      .find((item) => item.runId === query.runId
        && item.stepId === query.stepId
        && item.attempt === query.attempt
        && item.actionType === query.actionType);
    return found ? structuredClone(found) : null;
  }

  async recordRunStep(step: RunStepLogEntry): Promise<void> {
    const current = await this.load();
    current.execution.runStepLog ??= [];


    if (step.tenantId !== current.orgId || step.projectId !== current.projectId) {
      throw new StateStoreError('TENANT_PARTITION_GUARD_VIOLATION', {
        details: {
          expectedTenantId: current.orgId,
          expectedProjectId: current.projectId,
          receivedTenantId: step.tenantId,
          receivedProjectId: step.projectId,
        },
      });
    }

    const previous = current.execution.runStepLog
      .filter((entry) => entry.runId === step.runId && entry.stepId === step.stepId && entry.attempt === step.attempt)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    assertRunStepTransitionAllowed({
      ...(previous?.status ? { previousStatus: previous.status } : {}),
      nextStatus: step.status,
      runId: step.runId,
      stepId: step.stepId,
      attempt: step.attempt,
      evidenceId: step.id,
    });

    current.execution.runStepLog.push(structuredClone(step));
    await this.save(current);
  }

  async markTaskDone(taskId: string, summary: string): Promise<void> {
    const current = await this.load();
    const task = current.backlog.tasks[taskId];
    if (!task) {
      throw new StateStoreError(`Cannot mark missing task ${taskId} as done`);
    }

    task.status = 'done';
    if (!current.execution.completedTaskIds.includes(taskId)) {
      current.execution.completedTaskIds.push(taskId);
    }
    delete current.execution.activeTaskId;
    const summaryArtifact: ArtifactRecord = {
      id: crypto.randomUUID(),
      type: 'run_summary',
      title: `Task ${taskId} completion summary`,
      metadata: {
        taskId,
        summary,
      },
      createdAt: new Date().toISOString(),
    };
    const issues = defaultArtifactSchemaRegistry.validate(summaryArtifact);
    if (issues.length > 0) {
      throw new StateStoreError('Artifact schema validation failed', {
        details: { artifactType: summaryArtifact.type, issues },
      });
    }
    current.artifacts.push(summaryArtifact);
    await this.save(current);
  }
}
