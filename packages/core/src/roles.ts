import type { Logger } from '../../shared/src/index.ts';

export type AgentRoleName =
  | 'bootstrap_analyst'
  | 'architect'
  | 'planner'
  | 'release_auditor'
  | 'state_steward'
  | 'integration_manager'
  | 'task_manager'
  | 'prompt_engineer'
  | 'coder'
  | 'reviewer'
  | 'tester'
  | 'docs_writer';

export interface ToolProfile {
  allowedWritePaths: string[];
  canWriteRepo: boolean;
  canApproveChanges: boolean;
  canRunTests: boolean;
}

export type ToolExecutionPolicy =
  | 'orchestrator_default'
  | 'read_only_analysis'
  | 'quality_gate';

export type ToolPermissionScope =
  | 'read_only'
  | 'repo_write'
  | 'test_execution';

export type EvidenceSource =
  | 'state_snapshot'
  | 'runtime_events'
  | 'artifacts';

export interface ToolExecutionContext {
  policy: ToolExecutionPolicy;
  permissionScope: ToolPermissionScope;
  workspaceRoot: string;
  evidenceSource: EvidenceSource;
}

export interface RoleExecutionContext {
  runId: string;
  taskId?: string;
  role: AgentRoleName;
  stateSummary: string;
  toolProfile: ToolProfile;
  toolExecution: ToolExecutionContext;
  logger: Logger;
}

export interface RoleRequest<TInput> {
  role: AgentRoleName;
  objective: string;
  input: TInput;
  acceptanceCriteria: string[];
  expectedOutputSchema?: Record<string, unknown>;
}

export interface RoleResponse<TOutput> {
  role: AgentRoleName;
  summary: string;
  output: TOutput;
  warnings: string[];
  risks: string[];
  needsHumanDecision: boolean;
  confidence: number;
}

export interface AgentRole<TInput, TOutput> {
  readonly name: AgentRoleName;
  execute: (
    request: RoleRequest<TInput>,
    context: RoleExecutionContext,
  ) => Promise<RoleResponse<TOutput>>;
  validate?: (response: RoleResponse<TOutput>) => void | Promise<void>;
}
