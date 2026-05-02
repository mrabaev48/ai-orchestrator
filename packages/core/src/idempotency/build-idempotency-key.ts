import { createHash } from 'node:crypto';

export interface BuildIdempotencyKeyInput {
  tenantId: string;
  projectId: string;
  runId: string;
  taskId: string;
  stage: string;
  attempt: number;
  sideEffectType: string;
  normalizedInput: string | Record<string, unknown> | readonly unknown[];
}

function assertKeyPart(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`buildIdempotencyKey: ${field} must be a non-empty string`);
  }
  if (normalized.includes(':')) {
    throw new Error(`buildIdempotencyKey: ${field} must not include ':'`);
  }
  return normalized;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`).join(',')}}`;
}

export function buildIdempotencyKey(input: BuildIdempotencyKeyInput): string {
  if (!Number.isInteger(input.attempt) || input.attempt < 0) {
    throw new Error('buildIdempotencyKey: attempt must be an integer >= 0');
  }
  const canonicalInput = canonicalize(input.normalizedInput);
  const actionHash = createHash('sha256').update(canonicalInput).digest('hex');
  return [
    assertKeyPart(input.tenantId, 'tenantId'),
    assertKeyPart(input.projectId, 'projectId'),
    assertKeyPart(input.runId, 'runId'),
    assertKeyPart(input.taskId, 'taskId'),
    assertKeyPart(input.stage, 'stage'),
    String(input.attempt),
    `${assertKeyPart(input.sideEffectType, 'sideEffectType')}-${actionHash}`,
  ].join(':');
}
