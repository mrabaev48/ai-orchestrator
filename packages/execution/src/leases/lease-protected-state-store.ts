import type {
  ArtifactRecord,
  DecisionLogItem,
  DomainEvent,
  ExecutionPolicyDecision,
  ProjectState,
  RunStepLogEntry,
} from '@ai-orchestrator/core';
import type {
  ListEventsQuery,
  ListRunStepsQuery,
  PolicyDecisionQuery,
  RecordFailureInput,
  StateStore,
  StateWriteOptions,
} from '@ai-orchestrator/state';

import type { ExecutionLeaseGuard } from './execution-lease-authority.js';

export function createLeaseProtectedStateStore(
  stateStore: StateStore,
  guard: ExecutionLeaseGuard,
): StateStore {
  const requireLease = async (): Promise<void> => {
    await guard.requireValid();
  };

  return {
    load: async () => stateStore.load(),
    save: async (state: ProjectState, options?: StateWriteOptions) => {
      await requireLease();
      return stateStore.save(state, options);
    },
    saveWithEvents: async (state: ProjectState, events: readonly DomainEvent[], options?: StateWriteOptions) => {
      await requireLease();
      return stateStore.saveWithEvents(state, events, options);
    },
    listEvents: async (query?: ListEventsQuery) => stateStore.listEvents(query),
    listRunSteps: async (query?: ListRunStepsQuery) => stateStore.listRunSteps(query),
    recordEvent: async (event: DomainEvent) => {
      await requireLease();
      return stateStore.recordEvent(event);
    },
    recordFailure: async (input: RecordFailureInput, options?: StateWriteOptions) => {
      await requireLease();
      return stateStore.recordFailure(input, options);
    },
    recordArtifact: async (artifact: ArtifactRecord, options?: StateWriteOptions) => {
      await requireLease();
      return stateStore.recordArtifact(artifact, options);
    },
    recordDecision: async (decision: DecisionLogItem, options?: StateWriteOptions) => {
      await requireLease();
      return stateStore.recordDecision(decision, options);
    },
    recordRunStep: async (step: RunStepLogEntry) => {
      await requireLease();
      return stateStore.recordRunStep(step);
    },
    recordPolicyDecision: async (decision: ExecutionPolicyDecision, options?: StateWriteOptions) => {
      await requireLease();
      return stateStore.recordPolicyDecision(decision, options);
    },
    getPolicyDecision: async (query: PolicyDecisionQuery) => stateStore.getPolicyDecision(query),
    markTaskDone: async (taskId: string, summary: string, options?: StateWriteOptions) => {
      await requireLease();
      return stateStore.markTaskDone(taskId, summary, options);
    },
  };
}
