import type { DedupRegistryEntry } from './dedup-registry.ts';

export type DedupFinalizeStatus = 'succeeded' | 'failed';

export interface DedupReserveCommand {
  key: string;
  leaseOwner: string;
  nowIso: string;
  ttlMs: number;
}

export interface DedupFinalizeCommand {
  key: string;
  nowIso: string;
  status: DedupFinalizeStatus;
  leaseOwner?: string;
  policyDecisionId?: string;
  evidenceId?: string;
}

export type DedupReserveResult =
  | { reserved: true; entry: DedupRegistryEntry }
  | { reserved: false; reason: 'duplicate_pending' | 'duplicate_succeeded'; entry: DedupRegistryEntry };

export type DedupFinalizeResult =
  | { finalized: true; entry: DedupRegistryEntry }
  | { finalized: false; reason: 'missing_entry' | 'lease_owner_mismatch'; entry?: DedupRegistryEntry };

export interface DedupRegistryPort {
  reserve: (command: DedupReserveCommand) => DedupReserveResult;
  finalize: (command: DedupFinalizeCommand) => DedupFinalizeResult;
}
