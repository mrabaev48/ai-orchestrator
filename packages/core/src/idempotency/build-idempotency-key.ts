import { createHash } from 'node:crypto';

export interface BuildIdempotencyKeyInput {
  tenantId: string;
  projectId: string;
  runId: string;
  stepId: string;
  sideEffectType: string;
  normalizedInput: string;
}

export function buildIdempotencyKey(input: BuildIdempotencyKeyInput): string {
  const inputHash = createHash('sha256').update(input.normalizedInput).digest('hex');
  return [
    input.tenantId,
    input.projectId,
    input.runId,
    input.stepId,
    input.sideEffectType,
    inputHash,
  ].join(':');
}
