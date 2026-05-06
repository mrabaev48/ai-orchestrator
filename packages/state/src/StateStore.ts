import type {
  ArtifactRecord,
  DecisionLogItem,
  DomainEvent,
  DomainEventType,
  FailureRecord,
  ProjectState,
  RunStepLogEntry,
  ExecutionPolicyActionType,
  ExecutionPolicyDecision,
} from '@ai-orchestrator/core';
import type { AgentRoleName } from '@ai-orchestrator/core';
import type { FailureStatus } from '@ai-orchestrator/core';

export interface RecordFailureInput {
  taskId: string;
  role: AgentRoleName;
  reason: string;
  symptoms?: string[];
  badPatterns?: string[];
  retrySuggested?: boolean;
  status?: FailureStatus;
  checkpointRunId?: string;
  checkpointStepId?: string;
  deadLetteredAt?: string;
}

export interface ListEventsQuery {
  limit?: number;
  offset?: number;
  eventType?: DomainEventType;
}

export interface ListRunStepsQuery {
  runId?: string;
  taskId?: string;
  limit?: number;
  offset?: number;
}

export interface StateWriteOptions {
  expectedRevision?: number;
}

export interface StateMutationResult {
  revision: number;
}

export interface RecordFailureResult extends StateMutationResult {
  failure: FailureRecord;
  retryCount: number;
}

export interface StateStore {
  load: () => Promise<ProjectState>;
  /**
   * Persists a full-state snapshot using optimistic concurrency.
   *
   * The write succeeds only when the expected revision matches the latest
   * stored snapshot revision. On success the snapshot is stored at the next
   * monotonic revision and the provided state object is updated to that revision.
   */
  save: (state: ProjectState, options?: StateWriteOptions) => Promise<StateMutationResult>;
  saveWithEvents: (
    state: ProjectState,
    events: readonly DomainEvent[],
    options?: StateWriteOptions,
  ) => Promise<StateMutationResult>;
  listEvents: (query?: ListEventsQuery) => Promise<DomainEvent[]>;
  listRunSteps: (query?: ListRunStepsQuery) => Promise<RunStepLogEntry[]>;
  recordEvent: (event: DomainEvent) => Promise<void>;
  recordFailure: (input: RecordFailureInput, options?: StateWriteOptions) => Promise<RecordFailureResult>;
  recordArtifact: (artifact: ArtifactRecord, options?: StateWriteOptions) => Promise<StateMutationResult>;
  recordDecision: (decision: DecisionLogItem, options?: StateWriteOptions) => Promise<StateMutationResult>;
  recordRunStep: (step: RunStepLogEntry) => Promise<StateMutationResult>;
  recordPolicyDecision: (decision: ExecutionPolicyDecision, options?: StateWriteOptions) => Promise<StateMutationResult>;
  getPolicyDecision: (query: PolicyDecisionQuery) => Promise<ExecutionPolicyDecision | null>;
  markTaskDone: (taskId: string, summary: string, options?: StateWriteOptions) => Promise<StateMutationResult>;
}


export interface PolicyDecisionQuery {
  runId: string;
  stepId: string;
  attempt: number;
  actionType: ExecutionPolicyActionType;
}
