import {
  computeRunStepChecksum,
  type RunStepLogEntry,
} from '../../../core/src/index.ts';
import type { RunStepEvidenceStore } from '../../../state/src/evidence/run-step-evidence.store.ts';

export interface AppendRunStepEvidenceInput {
  evidenceId: string;
  tenantId: string;
  projectId: string;
  runId: string;
  stepId: string;
  attempt: number;
  taskId?: string;
  role: string;
  tool?: string;
  input: string;
  output: string;
  status: RunStepLogEntry['status'];
  policyDecisionId?: string;
  idempotencyKey: string;
  payloadRef?: string;
  prevChecksum?: string;
  traceId: string;
  durationMs: number;
  createdAt: string;
}

export async function appendRunStepEvidence(
  store: RunStepEvidenceStore,
  input: AppendRunStepEvidenceInput,
): Promise<RunStepLogEntry> {
  const step: RunStepLogEntry = {
    id: input.evidenceId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    runId: input.runId,
    stepId: input.stepId,
    attempt: input.attempt,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    role: input.role,
    ...(input.tool ? { tool: input.tool } : {}),
    input: input.input,
    output: input.output,
    status: input.status,
    ...(input.policyDecisionId ? { policyDecisionId: input.policyDecisionId } : {}),
    idempotencyKey: input.idempotencyKey,
    ...(input.payloadRef ? { payloadRef: input.payloadRef } : {}),
    checksum: '',
    ...(input.prevChecksum ? { prevChecksum: input.prevChecksum } : {}),
    traceId: input.traceId,
    durationMs: Math.max(0, input.durationMs),
    createdAt: input.createdAt,
  };

  step.checksum = computeRunStepChecksum({
    evidenceId: step.id,
    tenantId: step.tenantId,
    projectId: step.projectId,
    runId: step.runId,
    stepId: step.stepId,
    attempt: step.attempt,
    status: step.status,
    ...(step.policyDecisionId ? { policyDecisionId: step.policyDecisionId } : {}),
    idempotencyKey: step.idempotencyKey,
    createdAt: step.createdAt,
    ...(step.payloadRef ? { payloadRef: step.payloadRef } : {}),
    ...(step.prevChecksum ? { prevChecksum: step.prevChecksum } : {}),
    traceId: step.traceId,
  });

  await store.append(step);
  return step;
}
