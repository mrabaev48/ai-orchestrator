import type { DedupRegistryRecord } from '@ai-orchestrator/core';
import { finalizeDedupEntry, reserveDedupEntry } from '@ai-orchestrator/state';

export function reserveSideEffect(
  registry: Record<string, DedupRegistryRecord>,
  input: { key: string; leaseOwner: string; nowIso: string; ttlMs: number },
): { dedupSuppressed: false } | { dedupSuppressed: true; status: DedupRegistryRecord['status'] } {
  const result = reserveDedupEntry(registry, input);
  if (!result.reserved) {
    return { dedupSuppressed: true, status: result.entry.status };
  }
  return { dedupSuppressed: false };
}

export function completeSideEffect(
  registry: Record<string, DedupRegistryRecord>,
  input: { key: string; nowIso: string; status: 'succeeded' | 'failed'; policyDecisionId?: string; evidenceId?: string },
): void {
  finalizeDedupEntry(registry, input);
}
