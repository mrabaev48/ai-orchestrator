import type {
  ExecutionPolicyActionType,
  ExecutionPolicyRiskLevel,
  ProjectState,
} from '@ai-orchestrator/core';
import {
  classifyExecutionPolicyActionRisk,
  formatPolicyDecisionError,
} from '@ai-orchestrator/core';
import { WorkflowPolicyError } from '@ai-orchestrator/shared';
import type { StateStore } from '@ai-orchestrator/state';

export interface PersistPolicyDecisionInput {
  state: ProjectState;
  runId: string;
  taskId: string;
  stepId: string;
  attempt: number;
  actionType: ExecutionPolicyActionType;
  riskLevel?: ExecutionPolicyRiskLevel;
  inputHashSeed: string;
  reasonCodes: string[];
}

const POLICY_VERSION = 'policyDecisionPersistenceV1';

export class PolicyDecisionRecorder {
  constructor(private readonly stateStore: StateStore) {}

  async persistAndRequire(input: PersistPolicyDecisionInput): Promise<void> {
    const decision = {
      decisionId: crypto.randomUUID(),
      tenantId: input.state.orgId,
      projectId: input.state.projectId,
      runId: input.runId,
      stepId: input.stepId,
      attempt: input.attempt,
      actionType: input.actionType,
      riskLevel: input.riskLevel ?? classifyExecutionPolicyActionRisk(input.actionType).riskLevel,
      decision: 'allow' as const,
      reasonCodes: input.reasonCodes,
      decidedAt: new Date().toISOString(),
      decider: 'orchestrator_policy_gate_v1',
      inputHash: this.createPolicyInputHash(input.inputHashSeed),
      traceId: input.runId,
      policyVersion: POLICY_VERSION,
    };
    await this.stateStore.recordPolicyDecision(decision);
    input.state.policyDecisions.push(decision);

    const persisted = await this.stateStore.getPolicyDecision({
      runId: input.runId,
      stepId: input.stepId,
      attempt: input.attempt,
      actionType: input.actionType,
    });
    if (!persisted) {
      throw new WorkflowPolicyError(formatPolicyDecisionError('POLICY_DECISION_MISSING', input.actionType), {
        details: {
          policyCode: 'POLICY_DECISION_MISSING',
          runId: input.runId,
          taskId: input.taskId,
          stepId: input.stepId,
        },
      });
    }
    if (persisted.policyVersion !== POLICY_VERSION || persisted.inputHash !== decision.inputHash) {
      throw new WorkflowPolicyError(formatPolicyDecisionError('POLICY_DECISION_STALE', input.actionType), {
        details: {
          policyCode: 'POLICY_DECISION_STALE',
          runId: input.runId,
          taskId: input.taskId,
          stepId: input.stepId,
        },
      });
    }
    if (persisted.decision !== 'allow') {
      throw new WorkflowPolicyError(formatPolicyDecisionError('POLICY_DENIED', input.actionType), {
        details: {
          policyCode: 'POLICY_DENIED',
          runId: input.runId,
          taskId: input.taskId,
          stepId: input.stepId,
        },
      });
    }
  }

  private createPolicyInputHash(seed: string): string {
    return Buffer.from(seed).toString('base64url').slice(0, 64);
  }
}
