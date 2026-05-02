import type { DedupRegistryRecord } from '../../../core/src/index.ts';
import type {
  DedupFinalizeCommand,
  DedupFinalizeResult,
  DedupRegistryPort,
  DedupReserveCommand,
  DedupReserveResult,
} from './dedup-registry.port.ts';
import { finalizeDedupEntry, reserveDedupEntry } from './dedup-registry.ts';

export class InMemoryDedupRegistryPort implements DedupRegistryPort {
  private readonly registry: Record<string, DedupRegistryRecord>;

  constructor(registry: Record<string, DedupRegistryRecord>) {
    this.registry = registry;
  }

  reserve(command: DedupReserveCommand): DedupReserveResult {
    const result = reserveDedupEntry(this.registry, command);
    if (result.reserved) return result;
    if (result.entry.status === 'pending') return { reserved: false, reason: 'duplicate_pending', entry: result.entry };
    return { reserved: false, reason: 'duplicate_succeeded', entry: result.entry };
  }

  finalize(command: DedupFinalizeCommand): DedupFinalizeResult {
    const current = this.registry[command.key];
    if (!current) return { finalized: false, reason: 'missing_entry' };
    if (command.leaseOwner && current.leaseOwner !== command.leaseOwner) {
      return { finalized: false, reason: 'lease_owner_mismatch', entry: current };
    }
    const updated = finalizeDedupEntry(this.registry, command);
    if (!updated) return { finalized: false, reason: 'missing_entry' };
    return { finalized: true, entry: updated };
  }
}
