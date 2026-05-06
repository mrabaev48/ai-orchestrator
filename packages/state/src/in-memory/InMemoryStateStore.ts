import {
  assertProjectState,
  defaultArtifactSchemaRegistry,
  verifyRunStepEvidenceChain,
  assertRunStepTransitionAllowed,
  type ArtifactRecord,
  type DecisionLogItem,
  type DomainEvent,
  type ProjectState,
  type RunStepLogEntry,
  type ExecutionPolicyDecision,
} from '@ai-orchestrator/core';
import type {
  ListEventsQuery,
  ListRunStepsQuery,
  PolicyDecisionQuery,
  RecordFailureInput,
  RecordFailureResult,
  StateMutationResult,
  StateStore,
  StateWriteOptions,
} from '../StateStore.js';
import { StateStoreError } from '@ai-orchestrator/shared';
import { expectedRevisionFor, stateRevisionConflict } from '../revision.js';
import { buildFailureRecord } from '../failure-record.js';

export class InMemoryStateStore implements StateStore {
  readonly events: DomainEvent[] = [];
  private state: ProjectState;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(initialState: ProjectState) {
    assertProjectState(initialState);
    this.state = structuredClone(initialState);
  }

  async load(): Promise<ProjectState> {
    return structuredClone(this.state);
  }

  async save(state: ProjectState, options: StateWriteOptions = {}): Promise<StateMutationResult> {
    return await this.enqueueMutation(() => this.commitSnapshot(state, options));
  }

  async saveWithEvents(
    state: ProjectState,
    events: readonly DomainEvent[],
    options: StateWriteOptions = {},
  ): Promise<StateMutationResult> {
    return await this.enqueueMutation(() => this.commitSnapshot(state, options, events));
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

  async recordFailure(input: RecordFailureInput, options: StateWriteOptions = {}): Promise<RecordFailureResult> {
    return await this.enqueueMutation(() => {
      const current = structuredClone(this.state);
      if (!current.backlog.tasks[input.taskId]) {
        throw new StateStoreError(`Cannot record failure for missing task ${input.taskId}`);
      }

      const failure = buildFailureRecord(input);

      current.failures.push(failure);
      const retryCount = (current.execution.retryCounts[input.taskId] ?? 0) + 1;
      current.execution.retryCounts[input.taskId] = retryCount;
      const result = this.commitSnapshot(current, options);
      return { failure, retryCount, revision: result.revision };
    });
  }

  async recordArtifact(artifact: ArtifactRecord, options: StateWriteOptions = {}): Promise<StateMutationResult> {
    const issues = defaultArtifactSchemaRegistry.validate(artifact);
    if (issues.length > 0) {
      throw new StateStoreError('Artifact schema validation failed', {
        details: { artifactType: artifact.type, issues },
      });
    }
    return await this.enqueueMutation(() => {
      const current = structuredClone(this.state);
      if (!current.artifacts.some((item) => item.id === artifact.id)) {
        current.artifacts.push(structuredClone(artifact));
      }
      return this.commitSnapshot(current, options);
    });
  }

  async recordDecision(decision: DecisionLogItem, options: StateWriteOptions = {}): Promise<StateMutationResult> {
    return await this.enqueueMutation(() => {
      const current = structuredClone(this.state);
      current.decisions.push(structuredClone(decision));
      return this.commitSnapshot(current, options);
    });
  }


  async recordPolicyDecision(
    decision: ExecutionPolicyDecision,
    options: StateWriteOptions = {},
  ): Promise<StateMutationResult> {
    return await this.enqueueMutation(() => {
      const current = structuredClone(this.state);
      current.policyDecisions.push(structuredClone(decision));
      return this.commitSnapshot(current, options);
    });
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

  async recordRunStep(step: RunStepLogEntry): Promise<StateMutationResult> {
    return await this.enqueueMutation(() => {
      const current = structuredClone(this.state);
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
      assertProjectState(current);
      this.state = structuredClone(current);
      return { revision: this.state.revision };
    });
  }

  async markTaskDone(
    taskId: string,
    summary: string,
    options: StateWriteOptions = {},
  ): Promise<StateMutationResult> {
    return await this.enqueueMutation(() => {
      const current = structuredClone(this.state);
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
      return this.commitSnapshot(current, options);
    });
  }

  private commitSnapshot(
    state: ProjectState,
    options: StateWriteOptions = {},
    events: readonly DomainEvent[] = [],
  ): StateMutationResult {
    assertProjectState(state);
    const expectedRevision = expectedRevisionFor(state, options);
    const currentRevision = this.state.revision;
    if (expectedRevision !== currentRevision) {
      throw stateRevisionConflict(expectedRevision, currentRevision);
    }

    const next = structuredClone(state);
    next.revision = currentRevision + 1;
    assertProjectState(next);
    this.state = structuredClone(next);
    state.revision = next.revision;
    for (const event of events) {
      this.events.push(structuredClone(event));
    }
    return { revision: next.revision };
  }

  private async enqueueMutation<T>(action: () => T | Promise<T>): Promise<T> {
    const run = this.mutationQueue.then(action, action);
    this.mutationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  }
}
