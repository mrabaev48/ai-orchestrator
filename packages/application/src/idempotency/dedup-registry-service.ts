import type { DedupFinalizeCommand, DedupRegistryPort, DedupReserveCommand } from '../../../state/src/idempotency/dedup-registry.port.ts';

export class DedupRegistryService {
  private readonly dedupRegistry: DedupRegistryPort;

  constructor(dedupRegistry: DedupRegistryPort) {
    this.dedupRegistry = dedupRegistry;
  }

  reserve(command: DedupReserveCommand) {
    return this.dedupRegistry.reserve(command);
  }

  finalize(command: DedupFinalizeCommand) {
    return this.dedupRegistry.finalize(command);
  }
}
