import type { Logger } from '../../../shared/src/index.ts';
import type { QueueLeaseStore } from '../../../state/src/leases/lease-store.ts';

export interface QueueLeaseManagerOptions {
  readonly ownerId: string;
  readonly ttlMs: number;
  readonly now: () => Date;
}

export interface QueueLeaseHandle {
  readonly jobId: string;
  readonly leaseId: string;
  heartbeat: () => Promise<{ ok: true } | { ok: false; reason: 'missing_lease' | 'lease_owner_mismatch' }>;
  release: () => Promise<{ ok: true } | { ok: false; reason: 'missing_lease' | 'lease_owner_mismatch' }>;
}

export class QueueLeaseManager {
  private readonly store: QueueLeaseStore;
  private readonly logger: Logger;
  private readonly options: QueueLeaseManagerOptions;

  public constructor(store: QueueLeaseStore, logger: Logger, options: QueueLeaseManagerOptions) {
    this.store = store;
    this.logger = logger;
    this.options = options;
  }

  async acquire(jobId: string, leaseId: string): Promise<{ acquired: true; handle: QueueLeaseHandle } | { acquired: false; reason: 'already_leased' }> {
    const nowIso = this.options.now().toISOString();
    const result = await this.store.acquire({
      jobId,
      leaseId,
      ownerId: this.options.ownerId,
      nowIso,
      ttlMs: this.options.ttlMs,
    });

    if (!result.acquired) {
      this.logger.debug('queue lease acquire skipped', { data: { jobId, ownerId: this.options.ownerId, reason: result.reason } });
      return { acquired: false, reason: result.reason };
    }

    this.logger.info('queue lease acquired', {
      data: { jobId, ownerId: this.options.ownerId, leaseId, expiresAtIso: result.lease.expiresAtIso },
    });

    return {
      acquired: true,
      handle: {
        jobId,
        leaseId,
        heartbeat: async () => this.heartbeat(jobId, leaseId),
        release: async () => this.release(jobId, leaseId),
      },
    };
  }

  private async heartbeat(jobId: string, leaseId: string): Promise<{ ok: true } | { ok: false; reason: 'missing_lease' | 'lease_owner_mismatch' }> {
    const result = await this.store.heartbeat({
      jobId,
      leaseId,
      ownerId: this.options.ownerId,
      nowIso: this.options.now().toISOString(),
      ttlMs: this.options.ttlMs,
    });
    if (!result.renewed) {
      this.logger.warn('queue lease heartbeat failed', { data: { jobId, ownerId: this.options.ownerId, reason: result.reason } });
      return { ok: false, reason: result.reason };
    }

    this.logger.debug('queue lease heartbeat renewed', { data: { jobId, leaseId, expiresAtIso: result.lease.expiresAtIso } });
    return { ok: true };
  }

  private async release(jobId: string, leaseId: string): Promise<{ ok: true } | { ok: false; reason: 'missing_lease' | 'lease_owner_mismatch' }> {
    const result = await this.store.release({
      jobId,
      leaseId,
      ownerId: this.options.ownerId,
    });

    if (!result.released) {
      this.logger.warn('queue lease release failed', { data: { jobId, ownerId: this.options.ownerId, reason: result.reason } });
      return { ok: false, reason: result.reason };
    }

    this.logger.info('queue lease released', { data: { jobId, ownerId: this.options.ownerId, leaseId } });
    return { ok: true };
  }
}
