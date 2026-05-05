import type {
  AgentRole,
  AgentRoleName,
  ArtifactRecord,
  DecisionLogItem,
  DomainEvent,
  DomainEventType,
  ExecutionPolicyActionType,
  ExecutionPolicyDecision,
  FailureRecord,
  FailureStatus,
  ProjectState,
  RunStepLogEntry,
} from '@ai-orchestrator/core';

export interface ApplicationRoleRegistry {
  get: <TInput, TOutput>(roleName: AgentRoleName) => AgentRole<TInput, TOutput>;
}

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

export interface PolicyDecisionQuery {
  runId: string;
  stepId: string;
  attempt: number;
  actionType: ExecutionPolicyActionType;
}

export interface ApplicationStateStore {
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

export type DedupFinalizeStatus = 'succeeded' | 'failed';

export interface DedupRegistryEntry {
  key: string;
  status: 'pending' | 'succeeded' | 'failed' | 'expired';
  leaseOwner: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  policyDecisionId?: string;
  evidenceId?: string;
}

export interface DedupReserveCommand {
  key: string;
  leaseOwner: string;
  nowIso: string;
  ttlMs: number;
}

export interface DedupFinalizeCommand {
  key: string;
  nowIso: string;
  status: DedupFinalizeStatus;
  leaseOwner?: string;
  policyDecisionId?: string;
  evidenceId?: string;
}

export type DedupReserveResult =
  | { reserved: true; entry: DedupRegistryEntry }
  | { reserved: false; reason: 'duplicate_pending' | 'duplicate_succeeded'; entry: DedupRegistryEntry };

export type DedupFinalizeResult =
  | { finalized: true; entry: DedupRegistryEntry }
  | { finalized: false; reason: 'missing_entry' | 'lease_owner_mismatch'; entry?: DedupRegistryEntry };

export interface DedupRegistryPort {
  reserve: (command: DedupReserveCommand) => DedupReserveResult;
  finalize: (command: DedupFinalizeCommand) => DedupFinalizeResult;
}

export type RolloutRiskTier = 'low' | 'medium' | 'high';

export interface GradualRolloutRule {
  ruleId: string;
  enabled: boolean;
  rolloutPercent: number;
  riskTier: RolloutRiskTier;
  tenantId?: string;
  projectId?: string;
  createdAt: string;
}

export interface RolloutConfigStore {
  listRules: () => readonly GradualRolloutRule[];
}
