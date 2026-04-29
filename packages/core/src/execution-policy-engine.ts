import type {
  AgentRoleName,
  EvidenceSource,
  RoleExecutionContext,
  ToolExecutionPolicy,
  ToolPermissionScope,
  ToolProfile,
} from './roles.ts';

export interface ExecutionPolicyRule {
  maxChangedFiles: number;
  forbiddenDirectories: string[];
  requiredChecks: string[];
}

export interface RoleModelConstraint {
  policy: ToolExecutionPolicy;
  permissionScope: ToolPermissionScope;
  canWriteRepo: boolean;
  canRunTests: boolean;
}

export interface ExecutionPolicyProfile {
  role: AgentRoleName;
  toolProfile: ToolProfile;
  toolExecution: {
    policy: ToolExecutionPolicy;
    permissionScope: ToolPermissionScope;
    workspaceRoot: string;
    evidenceSource: EvidenceSource;
    qualityGateMode?: 'tooling' | 'synthetic';
  };
  rules: ExecutionPolicyRule;
}

const DEFAULT_RULES_BY_POLICY: Record<ToolExecutionPolicy, ExecutionPolicyRule> = {
  read_only_analysis: {
    maxChangedFiles: 0,
    forbiddenDirectories: ['.git', '.github/workflows'],
    requiredChecks: [],
  },
  orchestrator_default: {
    maxChangedFiles: 50,
    forbiddenDirectories: ['.git', '.github/workflows'],
    requiredChecks: ['lint', 'typecheck'],
  },
  quality_gate: {
    maxChangedFiles: 0,
    forbiddenDirectories: ['.git', '.github/workflows'],
    requiredChecks: ['lint', 'typecheck', 'test', 'build'],
  },
};

const ROLE_MODEL_CONSTRAINTS: Record<AgentRoleName, RoleModelConstraint> = {
  bootstrap_analyst: { policy: 'read_only_analysis', permissionScope: 'read_only', canWriteRepo: false, canRunTests: false },
  architect: { policy: 'read_only_analysis', permissionScope: 'read_only', canWriteRepo: false, canRunTests: false },
  planner: { policy: 'read_only_analysis', permissionScope: 'read_only', canWriteRepo: false, canRunTests: false },
  release_auditor: { policy: 'quality_gate', permissionScope: 'test_execution', canWriteRepo: false, canRunTests: true },
  state_steward: { policy: 'quality_gate', permissionScope: 'test_execution', canWriteRepo: false, canRunTests: true },
  integration_manager: { policy: 'orchestrator_default', permissionScope: 'repo_write', canWriteRepo: true, canRunTests: false },
  task_manager: { policy: 'read_only_analysis', permissionScope: 'read_only', canWriteRepo: false, canRunTests: false },
  prompt_engineer: { policy: 'read_only_analysis', permissionScope: 'read_only', canWriteRepo: false, canRunTests: false },
  coder: { policy: 'orchestrator_default', permissionScope: 'repo_write', canWriteRepo: true, canRunTests: false },
  reviewer: { policy: 'read_only_analysis', permissionScope: 'read_only', canWriteRepo: false, canRunTests: false },
  tester: { policy: 'quality_gate', permissionScope: 'test_execution', canWriteRepo: false, canRunTests: true },
  docs_writer: { policy: 'orchestrator_default', permissionScope: 'repo_write', canWriteRepo: true, canRunTests: false },
};

export interface ExecutionPolicyEngineInput {
  role: AgentRoleName;
  runId: string;
  stateSummary: string;
  workspaceRoot: string;
  allowedWritePaths: string[];
  evidenceSource: EvidenceSource;
  qualityGateMode?: 'tooling' | 'synthetic';
  logger: RoleExecutionContext['logger'];
  taskId?: string;
  abortSignal?: AbortSignal;
}

export class ExecutionPolicyEngine {
  resolve(input: ExecutionPolicyEngineInput): RoleExecutionContext {
    const constraint = ROLE_MODEL_CONSTRAINTS[input.role];
    const baseRules = DEFAULT_RULES_BY_POLICY[constraint.policy];
    const profile: ExecutionPolicyProfile = {
      role: input.role,
      toolProfile: {
        allowedWritePaths: constraint.canWriteRepo ? input.allowedWritePaths : [],
        canWriteRepo: constraint.canWriteRepo,
        canApproveChanges: false,
        canRunTests: constraint.canRunTests,
      },
      toolExecution: {
        policy: constraint.policy,
        permissionScope: constraint.permissionScope,
        workspaceRoot: input.workspaceRoot,
        evidenceSource: input.evidenceSource,
        ...(input.qualityGateMode ? { qualityGateMode: input.qualityGateMode } : {}),
      },
      rules: baseRules,
    };

    const logger = input.logger.withContext({
      runId: input.runId,
      role: input.role,
      ...(input.taskId ? { taskId: input.taskId } : {}),
    });

    return {
      runId: input.runId,
      role: input.role,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      stateSummary: input.stateSummary,
      toolProfile: profile.toolProfile,
      toolExecution: profile.toolExecution,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      logger,
    };
  }
}

export const defaultExecutionPolicyEngine = new ExecutionPolicyEngine();
