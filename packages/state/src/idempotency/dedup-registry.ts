export type DedupStatus = 'pending' | 'succeeded' | 'failed' | 'expired';

export interface DedupRegistryEntry {
  key: string;
  status: DedupStatus;
  leaseOwner: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  policyDecisionId?: string;
  evidenceId?: string;
}

export interface ReserveDedupInput {
  key: string;
  leaseOwner: string;
  nowIso: string;
  ttlMs: number;
}

export function reserveDedupEntry(
  registry: Record<string, DedupRegistryEntry>,
  input: ReserveDedupInput,
): { reserved: true; entry: DedupRegistryEntry } | { reserved: false; entry: DedupRegistryEntry } {
  const current = registry[input.key];
  const now = Date.parse(input.nowIso);
  if (current) {
    const expiresAt = Date.parse(current.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= now) {
      const expired: DedupRegistryEntry = { ...current, status: 'expired', updatedAt: input.nowIso };
      registry[input.key] = expired;
    } else if (current.status === 'pending' || current.status === 'succeeded') {
      return { reserved: false, entry: current };
    }
  }

  const next: DedupRegistryEntry = {
    key: input.key,
    status: 'pending',
    leaseOwner: input.leaseOwner,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
    expiresAt: new Date(now + input.ttlMs).toISOString(),
  };
  registry[input.key] = next;
  return { reserved: true, entry: next };
}

export function finalizeDedupEntry(
  registry: Record<string, DedupRegistryEntry>,
  input: { key: string; nowIso: string; status: 'succeeded' | 'failed'; policyDecisionId?: string; evidenceId?: string },
): DedupRegistryEntry | null {
  const current = registry[input.key];
  if (!current) {
    return null;
  }
  const updated: DedupRegistryEntry = {
    ...current,
    status: input.status,
    updatedAt: input.nowIso,
    ...(input.policyDecisionId ? { policyDecisionId: input.policyDecisionId } : {}),
    ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}),
  };
  registry[input.key] = updated;
  return updated;
}
