export interface DistributedLockLease {
  readonly resource: string;
  readonly ownerId: string;
  readonly fencingToken: number;
  readonly acquiredAtIso: string;
  readonly expiresAtIso: string;
}

export interface AcquireDistributedLockInput {
  readonly resource: string;
  readonly ownerId: string;
  readonly nowIso: string;
  readonly ttlMs: number;
}

export interface ReleaseDistributedLockInput {
  readonly resource: string;
  readonly ownerId: string;
  readonly fencingToken: number;
}

export interface ValidateDistributedLockInput {
  readonly resource: string;
  readonly ownerId: string;
  readonly fencingToken: number;
  readonly nowIso: string;
}

export interface DistributedLockStore {
  readonly acquire: (
    input: AcquireDistributedLockInput,
  ) => Promise<{ acquired: true; lease: DistributedLockLease } | { acquired: false; reason: 'already_locked'; lease: DistributedLockLease }>;
  readonly release: (
    input: ReleaseDistributedLockInput,
  ) => Promise<{ released: true } | { released: false; reason: 'missing_lock' | 'owner_mismatch' | 'stale_fencing_token'; lease?: DistributedLockLease }>;
  readonly validate: (
    input: ValidateDistributedLockInput,
  ) => Promise<{ valid: true; lease: DistributedLockLease } | { valid: false; reason: 'missing_lock' | 'owner_mismatch' | 'stale_fencing_token' | 'expired'; lease?: DistributedLockLease }>;
}

interface LockRecord {
  lease: DistributedLockLease;
  lastFencingToken: number;
}

export class InMemoryDistributedLockStore implements DistributedLockStore {
  private readonly records = new Map<string, LockRecord>();
  private globalFencingCounter = 0;

  async acquire(input: AcquireDistributedLockInput): Promise<{ acquired: true; lease: DistributedLockLease } | { acquired: false; reason: 'already_locked'; lease: DistributedLockLease }> {
    const current = this.records.get(input.resource);
    if (current && new Date(current.lease.expiresAtIso).getTime() > new Date(input.nowIso).getTime()) {
      return { acquired: false, reason: 'already_locked', lease: current.lease };
    }

    const token = this.nextFencingToken();
    const lease: DistributedLockLease = {
      resource: input.resource,
      ownerId: input.ownerId,
      fencingToken: token,
      acquiredAtIso: input.nowIso,
      expiresAtIso: new Date(new Date(input.nowIso).getTime() + input.ttlMs).toISOString(),
    };

    this.records.set(input.resource, { lease, lastFencingToken: token });
    return { acquired: true, lease };
  }

  async release(input: ReleaseDistributedLockInput): Promise<{ released: true } | { released: false; reason: 'missing_lock' | 'owner_mismatch' | 'stale_fencing_token'; lease?: DistributedLockLease }> {
    const current = this.records.get(input.resource);
    if (!current) {
      return { released: false, reason: 'missing_lock' };
    }

    if (current.lease.ownerId !== input.ownerId) {
      return { released: false, reason: 'owner_mismatch', lease: current.lease };
    }

    if (current.lease.fencingToken !== input.fencingToken) {
      return { released: false, reason: 'stale_fencing_token', lease: current.lease };
    }

    this.records.delete(input.resource);
    return { released: true };
  }

  async validate(input: ValidateDistributedLockInput): Promise<{ valid: true; lease: DistributedLockLease } | { valid: false; reason: 'missing_lock' | 'owner_mismatch' | 'stale_fencing_token' | 'expired'; lease?: DistributedLockLease }> {
    const current = this.records.get(input.resource);
    if (!current) {
      return { valid: false, reason: 'missing_lock' };
    }

    if (new Date(current.lease.expiresAtIso).getTime() <= new Date(input.nowIso).getTime()) {
      return { valid: false, reason: 'expired', lease: current.lease };
    }

    if (current.lease.ownerId !== input.ownerId) {
      return { valid: false, reason: 'owner_mismatch', lease: current.lease };
    }

    if (current.lease.fencingToken !== input.fencingToken) {
      return { valid: false, reason: 'stale_fencing_token', lease: current.lease };
    }

    return { valid: true, lease: current.lease };
  }

  private nextFencingToken(): number {
    this.globalFencingCounter += 1;
    return this.globalFencingCounter;
  }
}
