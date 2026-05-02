import { createHash } from 'node:crypto';

export interface BuildIdempotencyKeyInput {
  tenantId: string;
  projectId: string;
  runId: string;
  taskId: string;
  stage: string;
  attempt: number;
  sideEffectType: string;
  normalizedInput: string;
}

export function buildIdempotencyKey(input: BuildIdempotencyKeyInput): string {
  const actionHash = createHash('sha256').update(input.normalizedInput).digest('hex');
  return [
    input.tenantId,
    input.projectId,
    input.runId,
    input.taskId,
    input.stage,
    String(input.attempt),
    `${input.sideEffectType}-${actionHash}`,
  ].join(':');
}
