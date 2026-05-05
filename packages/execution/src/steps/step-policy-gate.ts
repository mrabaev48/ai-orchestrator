import type { ExecutionPolicyActionType, ProjectState } from '@ai-orchestrator/core';
import { classifyExecutionPolicyActionRisk } from '@ai-orchestrator/core';

export interface StepPolicyGateRequestInput {
  state: ProjectState;
  runId: string;
  taskId: string;
  stepId: string;
  attempt: number;
  actionType: ExecutionPolicyActionType;
  inputHashSeed: string;
  reasonCodes: string[];
}

export interface StepPolicyGateRequest {
  state: ProjectState;
  runId: string;
  taskId: string;
  stepId: string;
  attempt: number;
  actionType: ExecutionPolicyActionType;
  riskLevel: 'low' | 'medium' | 'high';
  inputHashSeed: string;
  reasonCodes: string[];
}

export function buildStepPolicyGateRequest(input: StepPolicyGateRequestInput): StepPolicyGateRequest {
  return {
    state: input.state,
    runId: input.runId,
    taskId: input.taskId,
    stepId: input.stepId,
    attempt: input.attempt,
    actionType: input.actionType,
    riskLevel: classifyExecutionPolicyActionRisk(input.actionType).riskLevel,
    inputHashSeed: input.inputHashSeed,
    reasonCodes: input.reasonCodes,
  };
}
