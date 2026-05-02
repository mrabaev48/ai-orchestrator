import type { BacklogTask, ProjectState } from '../../../core/src/index.ts';
import type { ExecutionPolicyActionType } from '../../../core/src/index.ts';

export interface PreflightPolicyGateInput {
  state: ProjectState;
  runId: string;
  task: BacklogTask;
}

export interface PreflightPolicyGateDecisionRequest {
  state: ProjectState;
  runId: string;
  taskId: string;
  stepId: string;
  attempt: number;
  actionType: ExecutionPolicyActionType;
  riskLevel: 'low';
  inputHashSeed: string;
  reasonCodes: string[];
}

export function buildPreflightPolicyGateDecisionRequest(
  input: PreflightPolicyGateInput,
): PreflightPolicyGateDecisionRequest {
  return {
    state: input.state,
    runId: input.runId,
    taskId: input.task.id,
    stepId: `${input.task.id}:preflight_policy`,
    attempt: 0,
    actionType: 'artifact_write',
    riskLevel: 'low',
    inputHashSeed: `${input.runId}:${input.task.id}:preflight`,
    reasonCodes: ['NON_BYPASS_PREFLIGHT_CHECK'],
  };
}
