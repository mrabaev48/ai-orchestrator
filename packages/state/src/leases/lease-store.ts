export interface QueueLease {
  readonly jobId: string;
  readonly ownerId: string;
  readonly leaseId: string;
  readonly acquiredAtIso: string;
  readonly expiresAtIso: string;
  readonly heartbeatAtIso: string;
}

export interface AcquireQueueLeaseInput {
  readonly jobId: string;
  readonly ownerId: string;
  readonly leaseId: string;
  readonly ttlMs: number;
  readonly nowIso: string;
}

export interface HeartbeatQueueLeaseInput {
  readonly jobId: string;
  readonly ownerId: string;
  readonly leaseId: string;
  readonly ttlMs: number;
  readonly nowIso: string;
}

export interface ReleaseQueueLeaseInput {
  readonly jobId: string;
  readonly ownerId: string;
  readonly leaseId: string;
}

export interface QueueLeaseStore {
  readonly acquire: (input: AcquireQueueLeaseInput) => Promise<{ acquired: true; lease: QueueLease } | { acquired: false; reason: 'already_leased'; lease: QueueLease }>;
  readonly heartbeat: (input: HeartbeatQueueLeaseInput) => Promise<{ renewed: true; lease: QueueLease } | { renewed: false; reason: 'missing_lease' | 'lease_owner_mismatch'; lease?: QueueLease }>;
  readonly release: (input: ReleaseQueueLeaseInput) => Promise<{ released: true } | { released: false; reason: 'missing_lease' | 'lease_owner_mismatch'; lease?: QueueLease }>;
}

function extendLease(input: { current: QueueLease; nowIso: string; ttlMs: number }): QueueLease {
  const expiresAtIso = new Date(new Date(input.nowIso).getTime() + input.ttlMs).toISOString();
  return {
    ...input.current,
    heartbeatAtIso: input.nowIso,
    expiresAtIso,
  };
}

export class InMemoryQueueLeaseStore implements QueueLeaseStore {
  private readonly leases = new Map<string, QueueLease>();

  async acquire(input: AcquireQueueLeaseInput): Promise<{ acquired: true; lease: QueueLease } | { acquired: false; reason: 'already_leased'; lease: QueueLease }> {
    const current = this.leases.get(input.jobId);
    if (current && new Date(current.expiresAtIso).getTime() > new Date(input.nowIso).getTime()) {
      return { acquired: false, reason: 'already_leased', lease: current };
    }

    const lease: QueueLease = {
      jobId: input.jobId,
      ownerId: input.ownerId,
      leaseId: input.leaseId,
      acquiredAtIso: input.nowIso,
      heartbeatAtIso: input.nowIso,
      expiresAtIso: new Date(new Date(input.nowIso).getTime() + input.ttlMs).toISOString(),
    };
    this.leases.set(input.jobId, lease);
    return { acquired: true, lease };
  }

  async heartbeat(input: HeartbeatQueueLeaseInput): Promise<{ renewed: true; lease: QueueLease } | { renewed: false; reason: 'missing_lease' | 'lease_owner_mismatch'; lease?: QueueLease }> {
    const current = this.leases.get(input.jobId);
    if (!current) {
      return { renewed: false, reason: 'missing_lease' };
    }

    if (current.ownerId !== input.ownerId || current.leaseId !== input.leaseId) {
      return { renewed: false, reason: 'lease_owner_mismatch', lease: current };
    }

    const lease = extendLease({ current, nowIso: input.nowIso, ttlMs: input.ttlMs });
    this.leases.set(input.jobId, lease);
    return { renewed: true, lease };
  }

  async release(input: ReleaseQueueLeaseInput): Promise<{ released: true } | { released: false; reason: 'missing_lease' | 'lease_owner_mismatch'; lease?: QueueLease }> {
    const current = this.leases.get(input.jobId);
    if (!current) {
      return { released: false, reason: 'missing_lease' };
    }

    if (current.ownerId !== input.ownerId || current.leaseId !== input.leaseId) {
      return { released: false, reason: 'lease_owner_mismatch', lease: current };
    }

    this.leases.delete(input.jobId);
    return { released: true };
  }
}
