import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyProjectState,
  type ArtifactRecord,
  type DecisionLogItem,
  type DomainEvent,
  type ExecutionPolicyDecision,
  type ProjectState,
  type RunStepLogEntry,
} from '@ai-orchestrator/core';
import { ApprovalGateService } from './approval-gate-service.js';
import type {
  ApplicationStateStore,
  ListEventsQuery,
  ListRunStepsQuery,
  PolicyDecisionQuery,
  RecordFailureResult,
  RecordFailureInput,
  StateMutationResult,
  StateWriteOptions,
} from './ports.js';

void test('ApprovalGateService uses the application state store port without infrastructure constructors', async () => {
  const state = createEmptyProjectState({
    projectId: 'ports-test',
    projectName: 'Ports Test',
    summary: 'Application service port test',
  });
  state.approvals.push({
    id: 'approval-1',
    runId: 'run-1',
    taskId: 'task-1',
    reason: 'Policy gate requires approval',
    requestedAction: 'git_push',
    riskLevel: 'high',
    status: 'pending',
    metadata: {},
    createdAt: '2026-05-05T00:00:00.000Z',
  });
  const stateStore = new TestApplicationStateStore(state);

  const result = await new ApprovalGateService(stateStore).approve('approval-1', 'operator-1', {
    policyDecisionId: 'decision-1',
    evidenceId: 'evidence-1',
  });

  assert.equal(result.status, 'approved');
  assert.equal(result.approvedBy, 'operator-1');
  assert.equal(stateStore.savedState?.approvals[0]?.decisionPolicyDecisionId, 'decision-1');
  assert.deepEqual(stateStore.recordedEvents.map((event) => event.eventType), ['APPROVAL_APPROVED']);
});

class TestApplicationStateStore implements ApplicationStateStore {
  savedState?: ProjectState;
  readonly recordedEvents: DomainEvent[] = [];

  constructor(private readonly state: ProjectState) {}

  async load(): Promise<ProjectState> {
    return this.state;
  }

  async save(state: ProjectState, _options?: StateWriteOptions): Promise<StateMutationResult> {
    state.revision += 1;
    this.savedState = state;
    return { revision: state.revision };
  }

  async saveWithEvents(
    state: ProjectState,
    events: readonly DomainEvent[],
    _options?: StateWriteOptions,
  ): Promise<StateMutationResult> {
    state.revision += 1;
    this.savedState = state;
    this.recordedEvents.push(...events);
    return { revision: state.revision };
  }

  async listEvents(_query?: ListEventsQuery): Promise<DomainEvent[]> {
    return [...this.recordedEvents];
  }

  async listRunSteps(_query?: ListRunStepsQuery): Promise<RunStepLogEntry[]> {
    return [];
  }

  async recordEvent(event: DomainEvent): Promise<void> {
    this.recordedEvents.push(event);
  }

  async recordFailure(_input: RecordFailureInput, _options?: StateWriteOptions): Promise<RecordFailureResult> {
    throw new Error('recordFailure is not needed for this test.');
  }

  async recordArtifact(_artifact: ArtifactRecord, _options?: StateWriteOptions): Promise<StateMutationResult> {
    return { revision: this.state.revision };
  }

  async recordDecision(_decision: DecisionLogItem, _options?: StateWriteOptions): Promise<StateMutationResult> {
    return { revision: this.state.revision };
  }

  async recordRunStep(_step: RunStepLogEntry): Promise<StateMutationResult> {
    return { revision: this.state.revision };
  }

  async recordPolicyDecision(
    _decision: ExecutionPolicyDecision,
    _options?: StateWriteOptions,
  ): Promise<StateMutationResult> {
    return { revision: this.state.revision };
  }

  async getPolicyDecision(_query: PolicyDecisionQuery): Promise<ExecutionPolicyDecision | null> {
    return null;
  }

  async markTaskDone(
    _taskId: string,
    _summary: string,
    _options?: StateWriteOptions,
  ): Promise<StateMutationResult> {
    return { revision: this.state.revision };
  }
}
