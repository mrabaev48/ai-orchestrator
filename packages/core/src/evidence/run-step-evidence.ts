import { createHash } from 'node:crypto';

import type { RunStepLogEntry } from '../project-state.ts';

interface CanonicalObject {
  [key: string]: CanonicalValue;
}

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | CanonicalObject;

export function canonicalizeEvidencePayload(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function computeRunStepChecksum(input: {
  evidenceId: string;
  tenantId: string;
  projectId: string;
  runId: string;
  stepId: string;
  attempt: number;
  status: RunStepLogEntry['status'];
  policyDecisionId?: string;
  idempotencyKey: string;
  createdAt: string;
  payloadRef?: string;
  prevChecksum?: string;
  traceId: string;
}): string {
  const canonical = canonicalizeEvidencePayload(input);
  return createHash('sha256').update(canonical).digest('hex');
}

function normalize(value: unknown): CanonicalValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item): CanonicalValue => normalize(item));
  }

  if (typeof value === 'object') {
    const result: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value).sort()) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate !== 'undefined') {
        result[key] = normalize(candidate);
      }
    }
    return result;
  }

  return 'unsupported';
}


export function verifyRunStepEvidenceChain(steps: readonly RunStepLogEntry[]): string[] {
  const issues: string[] = [];
  const ordered = [...steps].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  let prevChecksum: string | undefined;
  for (const step of ordered) {
    const expected = computeRunStepChecksum({
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

    if (step.checksum !== expected) {
      issues.push(`checksum_mismatch:${step.id}`);
    }

    if (prevChecksum && step.prevChecksum !== prevChecksum) {
      issues.push(`chain_mismatch:${step.id}`);
    }

    prevChecksum = step.checksum;
  }

  return issues;
}
