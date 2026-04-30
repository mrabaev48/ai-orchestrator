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
} from '../../core/src/index.ts';
import type { AgentRoleName } from '../../core/src/roles.ts';
import type { FailureStatus } from '../../core/src/failures.ts';

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

export interface StateStore {
  load: () => Promise<ProjectState>;
  save: (state: ProjectState) => Promise<void>;
  saveWithEvents: (state: ProjectState, events: readonly DomainEvent[]) => Promise<void>;
  listEvents: (query?: ListEventsQuery) => Promise<DomainEvent[]>;
  listRunSteps: (query?: ListRunStepsQuery) => Promise<RunStepLogEntry[]>;
  recordEvent: (event: DomainEvent) => Promise<void>;
  recordFailure: (input: RecordFailureInput) => Promise<FailureRecord>;
  recordArtifact: (artifact: ArtifactRecord) => Promise<void>;
  recordDecision: (decision: DecisionLogItem) => Promise<void>;
  recordRunStep: (step: RunStepLogEntry) => Promise<void>;
  recordPolicyDecision: (decision: ExecutionPolicyDecision) => Promise<void>;
  getPolicyDecision: (query: PolicyDecisionQuery) => Promise<ExecutionPolicyDecision | null>;
  markTaskDone: (taskId: string, summary: string) => Promise<void>;
}


export interface PolicyDecisionQuery {
  runId: string;
  stepId: string;
  attempt: number;
  actionType: ExecutionPolicyActionType;
}
