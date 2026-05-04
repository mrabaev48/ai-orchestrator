import type { Logger } from '../../../shared/src/index.ts';
import { WorkflowPolicyError } from '../../../shared/src/index.ts';
import type { DistributedLockLease, DistributedLockStore } from '../../../state/src/locks/distributed-lock.store.ts';

export interface FencingLockHandle {
  readonly lease: DistributedLockLease;
  readonly validate: (nowIso: string) => Promise<{ valid: true } | { valid: false; reason: string }>;
  readonly release: () => Promise<void>;
}

export interface FencingTokenGuard {
  readonly acquire: (resource: string, ownerId: string, nowIso: string) => Promise<FencingLockHandle | null>;
}

export function createFencingTokenGuard(
  store: DistributedLockStore,
  logger: Logger,
  options: { ttlMs: number },
): FencingTokenGuard {
  return {
    acquire: async (resource, ownerId, nowIso) => {
      const acquired = await store.acquire({ resource, ownerId, nowIso, ttlMs: options.ttlMs });
      if (!acquired.acquired) {
        logger.info('fencing lock unavailable', { data: { resource, ownerId, reason: acquired.reason, fencingToken: acquired.lease.fencingToken } });
        return null;
      }

      const lease = acquired.lease;
      logger.info('fencing lock acquired', { data: { resource, ownerId, fencingToken: lease.fencingToken, expiresAtIso: lease.expiresAtIso } });

      return {
        lease,
        validate: async (validateNowIso: string) => {
          const result = await store.validate({
            resource,
            ownerId,
            fencingToken: lease.fencingToken,
            nowIso: validateNowIso,
          });
          if (!result.valid) {
            logger.warn('fencing lock validation failed', { data: { resource, ownerId, fencingToken: lease.fencingToken, reason: result.reason } });
            return { valid: false, reason: result.reason };
          }
          return { valid: true };
        },
        release: async () => {
          const releaseResult = await store.release({ resource, ownerId, fencingToken: lease.fencingToken });
          if (!releaseResult.released) {
            throw new WorkflowPolicyError('Unable to release fencing lock', {
              details: { resource, ownerId, fencingToken: lease.fencingToken, reason: releaseResult.reason },
            });
          }
          logger.info('fencing lock released', { data: { resource, ownerId, fencingToken: lease.fencingToken } });
        },
      };
    },
  };
}
