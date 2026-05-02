import type { BacklogTask, ProjectState } from '../../../core/src/index.ts';
import type { ExecutionPolicyActionType } from '../../../core/src/index.ts';

export interface PostflightPolicyGateInput {
  state: ProjectState;
  runId: string;
  task: BacklogTask;
}

export interface PostflightPolicyGateDecisionRequest {
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

export function buildPostflightPolicyGateDecisionRequest(
  input: PostflightPolicyGateInput,
): PostflightPolicyGateDecisionRequest {
  return {
    state: input.state,
    runId: input.runId,
    taskId: input.task.id,
    stepId: `${input.task.id}:postflight_policy`,
    attempt: 0,
    actionType: 'artifact_write',
    riskLevel: 'low',
    inputHashSeed: `${input.runId}:${input.task.id}:postflight`,
    reasonCodes: ['NON_BYPASS_POSTFLIGHT_CHECK'],
  };
}
